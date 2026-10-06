require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
    getProfile,
    updateProfile,
    getJobs,
    saveJob,
    getApplications,
    getStats,
    getSession,
    saveSession
} = require('./database/db');

const { parseResumeFile } = require('./services/resumeParser');
const { evaluateJobMatch } = require('./services/matcher');
const jobDiscoveryService = require('./services/jobDiscovery');
const reportService = require('./services/reportService');
const aiService = require('./services/aiService');
const agentWorker = require('./automation/agentWorker');
const browserManager = require('./automation/browserManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

// File upload setup
const uploadsDir = path.join(__dirname, 'uploads', 'resumes');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'resume-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// ==========================================
// 1. Profile & Resume Endpoints
// ==========================================
app.get('/api/profile', (req, res) => {
    res.json(getProfile());
});

app.post('/api/profile', (req, res) => {
    try {
        const updated = updateProfile(req.body);
        res.json({ success: true, profile: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/profile/upload-resume', upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const parsedData = await parseResumeFile(filePath);

        const currentProfile = getProfile();
        const merged = {
            ...currentProfile,
            full_name: parsedData.fullName || currentProfile.full_name,
            email: parsedData.email || currentProfile.email,
            phone: parsedData.phone || currentProfile.phone,
            linkedin_url: parsedData.linkedinUrl || currentProfile.linkedin_url,
            github_url: parsedData.githubUrl || currentProfile.github_url,
            portfolio_url: parsedData.portfolioUrl || currentProfile.portfolio_url,
            domain: parsedData.domain || currentProfile.domain,
            experience_years: parsedData.experienceYears || currentProfile.experience_years,
            skills: parsedData.skills.length > 0 ? parsedData.skills : currentProfile.skills,
            summary: parsedData.summary || currentProfile.summary,
            resume_path: filePath,
            resume_filename: req.file.originalname,
            resume_text: parsedData.rawText
        };

        const saved = updateProfile(merged);
        res.json({ success: true, profile: saved, parsedData });
    } catch (err) {
        res.status(500).json({ error: 'Failed to parse resume: ' + err.message });
    }
});

// ==========================================
// 2. Jobs Discovery & Import
// ==========================================
app.get('/api/jobs', (req, res) => {
    const { status, platform, minScore, limit } = req.query;
    res.json(getJobs({ status, platform, minScore, limit }));
});

app.post('/api/jobs/discover', async (req, res) => {
    try {
        const { domain } = req.body;
        const jobs = await jobDiscoveryService.discoverJobs({ domain });
        res.json({
            success: true,
            count: jobs.newCount !== undefined ? jobs.newCount : jobs.length,
            totalScanned: jobs.totalScanned || jobs.length,
            alreadyExisting: jobs.existingCount || 0,
            warnings: jobs.warnings || [],
            jobs
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/jobs/import', (req, res) => {
    try {
        const { url, title, company, platform = 'generic', description = '' } = req.body;
        if (!url || !title || !company) {
            return res.status(400).json({ error: 'URL, title, and company are required' });
        }

        const profile = getProfile();
        const mockJob = { url, title, company, description, platform };
        const match = evaluateJobMatch(profile, mockJob);

        const newJob = {
            id: 'imp_' + Date.now(),
            title,
            company,
            url,
            platform,
            location: 'Remote / Direct',
            domain: profile.domain,
            experience_required: `${match.minExperience} years`,
            min_experience: match.minExperience,
            skills_extracted: match.matchedSkills,
            description,
            match_score: match.score,
            match_reasons: match.reasons,
            status: 'queued'
        };

        saveJob(newJob);
        res.json({ success: true, job: newJob });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 3. Autonomous Agent Controls & SSE Stream
// ==========================================
app.get('/api/agent/status', (req, res) => {
    res.json(agentWorker.getStatus());
});

app.post('/api/agent/start', async (req, res) => {
    try {
        const { limit = 10, reviewOnly = false } = req.body;
        const result = await agentWorker.startBatch({ limit, reviewOnly });
        res.json({ success: true, result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/agent/pause', (req, res) => {
    const paused = agentWorker.pause();
    res.json({ success: paused });
});

app.post('/api/agent/resume', (req, res) => {
    const resumed = agentWorker.resume();
    res.json({ success: resumed });
});

app.post('/api/agent/stop', (req, res) => {
    const stopped = agentWorker.stop();
    res.json({ success: stopped });
});

// Real-time Server-Sent Events stream for agent logs and state
app.get('/api/agent/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const onLog = (logEntry) => {
        res.write(`data: ${JSON.stringify({ type: 'log', payload: logEntry })}\n\n`);
    };

    const onStateChange = (state) => {
        res.write(`data: ${JSON.stringify({ type: 'state', payload: state })}\n\n`);
    };

    agentWorker.on('log', onLog);
    agentWorker.on('stateChange', onStateChange);

    req.on('close', () => {
        agentWorker.off('log', onLog);
        agentWorker.off('stateChange', onStateChange);
    });
});

// ==========================================
// 4. Applications History & Proof
// ==========================================
app.get('/api/applications', (req, res) => {
    const { status, platform, limit } = req.query;
    res.json(getApplications({ status, platform, limit }));
});

app.get('/api/stats', (req, res) => {
    res.json(getStats());
});

// ==========================================
// 5. Reports & Export
// ==========================================
app.get('/api/reports/csv', (req, res) => {
    const csv = reportService.generateCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="applypilot-report-${Date.now()}.csv"`);
    res.send(csv);
});

app.get('/api/reports/html', (req, res) => {
    const html = reportService.generateHTMLSummary();
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

app.post('/api/reports/email', async (req, res) => {
    try {
        const config = require('./config.json');
        const emailConfig = {
            ...config.emailNotifications,
            ...(req.body || {})
        };
        const result = await reportService.sendEmailReport(emailConfig);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 6. Platform Authentication Sessions
// ==========================================
app.get('/api/sessions/:platform', async (req, res) => {
    const platform = req.params.platform;
    const hasSess = await browserManager.hasSession(platform);
    res.json({ platform, connected: hasSess });
});

app.post('/api/sessions/launch-login', async (req, res) => {
    const { platform } = req.body;
    if (!platform || (platform !== 'linkedin' && platform !== 'naukri' && platform !== 'indeed')) {
        return res.status(400).json({ error: 'Valid platform required (linkedin, naukri, or indeed)' });
    }

    // Launch headed browser for manual login
    try {
        const { browser, context } = await browserManager.launchBrowser({ headless: false });
        const page = await context.newPage();
        const loginUrl = platform === 'linkedin' 
            ? 'https://www.linkedin.com/login' 
            : platform === 'naukri'
            ? 'https://www.naukri.com/nlogin/login'
            : 'https://secure.indeed.com/account/login';

        await page.goto(loginUrl);
        agentWorker.log('info', `Opened ${platform.toUpperCase()} authentication window. Log in and your session cookies will be saved.`);

        // Active verification loop: poll for valid authentication without blind timeout
        let isSaved = false;
        const startTime = Date.now();
        const maxWaitMs = 120000; // 2 minutes

        const intervalId = setInterval(async () => {
            if (isSaved) {
                clearInterval(intervalId);
                return;
            }

            if (!browser.isConnected() || page.isClosed()) {
                clearInterval(intervalId);
                return;
            }

            try {
                const isLoggedIn = await browserManager.verifyPlatformLogin(context, page, platform);
                if (isLoggedIn) {
                    isSaved = true;
                    clearInterval(intervalId);
                    await browserManager.saveSessionState(platform);
                    saveSession(platform, 'connected');
                    agentWorker.log('success', `✓ Verified live authentication for ${platform.toUpperCase()}! Cookies stored securely.`);
                } else if (Date.now() - startTime > maxWaitMs) {
                    clearInterval(intervalId);
                    agentWorker.log('warn', `Login window timed out after 2 minutes for ${platform.toUpperCase()} without detected login. Click 'Save Session' if already signed in.`);
                }
            } catch (e) {}
        }, 2500);

        // Also check authentication state on window close
        page.on('close', async () => {
            if (isSaved) return;
            clearInterval(intervalId);
            try {
                const isLoggedIn = await browserManager.verifyPlatformLogin(context, null, platform);
                if (isLoggedIn) {
                    await browserManager.saveSessionState(platform);
                    saveSession(platform, 'connected');
                    agentWorker.log('success', `✓ Verified and saved session for ${platform.toUpperCase()} on window close.`);
                } else {
                    agentWorker.log('info', `Authentication window closed for ${platform.toUpperCase()}.`);
                }
            } catch (e) {}
        });

        res.json({ success: true, message: `Browser launched for ${platform}. Sign in and cookies will persist.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sessions/save', async (req, res) => {
    const { platform } = req.body;
    if (!platform) return res.status(400).json({ error: 'Platform name required' });
    try {
        await browserManager.saveSessionState(platform);
        saveSession(platform, 'saved');
        agentWorker.log('success', `✓ Saved session for ${platform.toUpperCase()}`);
        res.json({ success: true, message: `Session saved for ${platform}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 7. Interactive Mock Career Portals (For instant safe testing)
// ==========================================
app.get('/mock/greenhouse', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Stripe - Full Stack Engineer (Greenhouse Portal)</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 40px; }
        .card { max-width: 650px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .field { margin-bottom: 18px; }
        label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 14px; }
        input[type="text"], input[type="email"], input[type="tel"], textarea, select { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; }
        button { background: #2563eb; color: #fff; padding: 12px 24px; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
    </style>
</head>
<body>
    <div class="card">
        <h2>Full Stack Engineer — Greenhouse Portal</h2>
        <p>Stripe Core Platform &bull; Remote / San Francisco</p>
        <form method="POST" action="/mock/submit-success" id="application_form">
            <div class="field">
                <label>First Name *</label>
                <input type="text" id="first_name" name="first_name" required>
            </div>
            <div class="field">
                <label>Last Name *</label>
                <input type="text" id="last_name" name="last_name" required>
            </div>
            <div class="field">
                <label>Email *</label>
                <input type="email" id="email" name="email" required>
            </div>
            <div class="field">
                <label>Phone *</label>
                <input type="tel" id="phone" name="phone">
            </div>
            <div class="field">
                <label>Resume/CV *</label>
                <input type="file" id="resume" name="resume">
            </div>
            <div class="field">
                <label>LinkedIn Profile</label>
                <input type="text" id="linkedin" name="linkedin">
            </div>
            <div class="field">
                <label>Are you legally authorized to work in this country?</label>
                <select name="authorized">
                    <option value="">Select...</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                </select>
            </div>
            <div class="field">
                <label>Why are you interested in joining this team?</label>
                <textarea rows="3" name="why_us"></textarea>
            </div>
            <button type="submit" id="submit_app">Submit Application</button>
        </form>
    </div>
</body>
</html>
    `);
});

app.post('/mock/submit-success', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head><title>Application Submitted</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 60px; background: #f0fdf4;">
    <h1 style="color: #16a34a;">Thank You! Your application was submitted successfully.</h1>
    <p>We have received your application materials and will be in touch with next steps.</p>
</body>
</html>
    `);
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: require('./package.json').version || '1.0.0'
    });
});

// Graceful Shutdown
function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    agentWorker.stop();
    browserManager.closeBrowser().then(() => {
        console.log('Browser cleaned up. Exiting.');
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start Server
app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 ApplyPilot AI Server running at http://localhost:${PORT}`);
    console.log(`📡 Real-time logs available at http://localhost:${PORT}/api/agent/stream`);
    console.log(`=======================================================`);
});
