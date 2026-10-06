const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'job_agent.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Ensure db directory exists
if (!fs.existsSync(__dirname)) {
    fs.mkdirSync(__dirname, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Initialize schema
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

// Seed default profile if empty
const existingProfile = db.prepare('SELECT id FROM profile WHERE id = 1').get();
if (!existingProfile) {
    db.prepare(`
        INSERT INTO profile (
            id, full_name, email, phone, location, linkedin_url, github_url, portfolio_url,
            domain, experience_years, current_title, skills, summary, screening_answers,
            auto_apply_threshold, execution_mode, headless_mode
        ) VALUES (
            1, 'Alex Mercer', 'alex.mercer.dev@example.com', '+1 (555) 234-5678', 'Remote / Bengaluru, India',
            'https://linkedin.com/in/alex-mercer', 'https://github.com/alex-mercer', 'https://alexmercer.dev',
            'Full Stack Developer', 3.5, 'Senior Software Engineer',
            ?, ?, ?, 75, 'full_auto', 0
        )
    `).run(
        JSON.stringify(['JavaScript', 'TypeScript', 'Node.js', 'React', 'Python', 'SQL', 'Docker', 'AWS', 'REST APIs', 'Git']),
        'Experienced Full Stack Engineer with 3.5+ years building scalable web services, microservices, and reactive user interfaces. Skilled in Node.js, TypeScript, React, and cloud deployments.',
        JSON.stringify({
            authorized: 'Yes',
            sponsorship: 'No',
            notice_period: 'Immediate / 15 Days',
            expected_salary: 'Flexible / Standard Market Rate',
            gender: 'Decline to self-identify',
            veteran_status: 'I am not a protected veteran',
            disability_status: 'No, I do not have a disability'
        })
    );
}

function getProfile() {
    const row = db.prepare('SELECT * FROM profile WHERE id = 1').get();
    if (row) {
        try { row.skills = JSON.parse(row.skills || '[]'); } catch { row.skills = []; }
        try { row.screening_answers = JSON.parse(row.screening_answers || '{}'); } catch { row.screening_answers = {}; }
    }
    return row;
}

function updateProfile(data) {
    const existing = getProfile() || {};
    const updated = { ...existing, ...data };
    
    db.prepare(`
        UPDATE profile SET
            full_name = @full_name,
            email = @email,
            phone = @phone,
            location = @location,
            linkedin_url = @linkedin_url,
            github_url = @github_url,
            portfolio_url = @portfolio_url,
            domain = @domain,
            experience_years = @experience_years,
            current_title = @current_title,
            skills = @skills,
            summary = @summary,
            resume_path = @resume_path,
            resume_filename = @resume_filename,
            resume_text = @resume_text,
            screening_answers = @screening_answers,
            auto_apply_threshold = @auto_apply_threshold,
            execution_mode = @execution_mode,
            headless_mode = @headless_mode,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
    `).run({
        full_name: String(updated.full_name || ''),
        email: String(updated.email || ''),
        phone: String(updated.phone || ''),
        location: String(updated.location || ''),
        linkedin_url: String(updated.linkedin_url || ''),
        github_url: String(updated.github_url || ''),
        portfolio_url: String(updated.portfolio_url || ''),
        domain: String(updated.domain || 'Full Stack Developer'),
        experience_years: Number(updated.experience_years) || 0,
        current_title: String(updated.current_title || ''),
        skills: typeof updated.skills === 'string' ? updated.skills : JSON.stringify(updated.skills || []),
        summary: String(updated.summary || ''),
        resume_path: String(updated.resume_path || ''),
        resume_filename: String(updated.resume_filename || ''),
        resume_text: String(updated.resume_text || ''),
        screening_answers: typeof updated.screening_answers === 'string' ? updated.screening_answers : JSON.stringify(updated.screening_answers || {}),
        auto_apply_threshold: Number(updated.auto_apply_threshold) || 75,
        execution_mode: String(updated.execution_mode || 'full_auto'),
        headless_mode: updated.headless_mode ? 1 : 0
    });
    return getProfile();
}

function saveJob(job) {
    const existing = db.prepare('SELECT id, status FROM jobs WHERE url = ?').get(String(job.url || ''));

    const stmt = db.prepare(`
        INSERT INTO jobs (
            id, title, company, location, url, platform, domain,
            experience_required, min_experience, skills_extracted, salary,
            job_type, description, match_score, match_reasons, status
        ) VALUES (
            @id, @title, @company, @location, @url, @platform, @domain,
            @experience_required, @min_experience, @skills_extracted, @salary,
            @job_type, @description, @match_score, @match_reasons, @status
        )
        ON CONFLICT(url) DO UPDATE SET
            match_score = excluded.match_score,
            match_reasons = excluded.match_reasons,
            status = CASE WHEN jobs.status = 'applied' THEN 'applied' ELSE excluded.status END
    `);

    const result = stmt.run({
        id: String(job.id || ''),
        title: String(job.title || ''),
        company: String(job.company || ''),
        location: String(job.location || ''),
        url: String(job.url || ''),
        platform: String(job.platform || 'generic'),
        domain: String(job.domain || ''),
        experience_required: String(job.experience_required || ''),
        min_experience: Number(job.min_experience) || 0,
        skills_extracted: typeof job.skills_extracted === 'string' ? job.skills_extracted : JSON.stringify(job.skills_extracted || []),
        salary: String(job.salary || ''),
        job_type: String(job.job_type || 'Full-time'),
        description: String(job.description || ''),
        match_score: Number(job.match_score) || 0,
        match_reasons: typeof job.match_reasons === 'string' ? job.match_reasons : JSON.stringify(job.match_reasons || []),
        status: String(job.status || 'discovered')
    });

    return {
        isNew: !existing,
        ...result
    };
}

function getJobs(filter = {}) {
    let query = 'SELECT * FROM jobs WHERE 1=1';
    const params = [];

    if (filter.status) {
        query += ' AND status = ?';
        params.push(filter.status);
    }
    if (filter.platform) {
        query += ' AND platform = ?';
        params.push(filter.platform);
    }
    if (filter.minScore) {
        query += ' AND match_score >= ?';
        params.push(Number(filter.minScore));
    }

    query += ' ORDER BY match_score DESC, discovered_at DESC';

    if (filter.limit) {
        query += ' LIMIT ?';
        params.push(Number(filter.limit));
    }

    const rows = db.prepare(query).all(...params);
    return rows.map(r => {
        try { r.skills_extracted = JSON.parse(r.skills_extracted || '[]'); } catch { r.skills_extracted = []; }
        try { r.match_reasons = JSON.parse(r.match_reasons || '[]'); } catch { r.match_reasons = []; }
        return r;
    });
}

function updateJobStatus(jobId, status) {
    return db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, jobId);
}

function recordApplication(app) {
    const stmt = db.prepare(`
        INSERT INTO applications (
            id, job_id, company, title, url, platform, match_score,
            status, screenshot_path, answers_log, error_log, notes
        ) VALUES (
            @id, @job_id, @company, @title, @url, @platform, @match_score,
            @status, @screenshot_path, @answers_log, @error_log, @notes
        )
    `);

    stmt.run({
        id: String(app.id || ''),
        job_id: String(app.job_id || ''),
        company: String(app.company || ''),
        title: String(app.title || ''),
        url: String(app.url || ''),
        platform: String(app.platform || 'generic'),
        match_score: Number(app.match_score) || 0,
        status: String(app.status || 'applied'),
        screenshot_path: String(app.screenshot_path || ''),
        answers_log: typeof app.answers_log === 'string' ? app.answers_log : JSON.stringify(app.answers_log || {}),
        error_log: String(app.error_log || ''),
        notes: String(app.notes || '')
    });

    updateJobStatus(app.job_id, app.status === 'applied' ? 'applied' : 'failed');
}

function getApplications(filter = {}) {
    let query = 'SELECT * FROM applications WHERE 1=1';
    const params = [];

    if (filter.status) {
        query += ' AND status = ?';
        params.push(filter.status);
    }
    if (filter.platform) {
        query += ' AND platform = ?';
        params.push(filter.platform);
    }

    query += ' ORDER BY applied_at DESC';

    if (filter.limit) {
        query += ' LIMIT ?';
        params.push(Number(filter.limit));
    }

    const rows = db.prepare(query).all(...params);
    return rows.map(r => {
        try { r.answers_log = JSON.parse(r.answers_log || '{}'); } catch { r.answers_log = {}; }
        return r;
    });
}

function getStats() {
    const totalDiscovered = db.prepare('SELECT COUNT(*) as count FROM jobs').get().count;
    const totalApplied = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'applied'").get().count;
    const totalFailed = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'failed'").get().count;
    const totalQueued = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'queued'").get().count;
    const highMatch = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE match_score >= 80').get().count;

    return {
        totalDiscovered,
        totalApplied,
        totalFailed,
        totalQueued,
        highMatch
    };
}

function saveSession(platform, sessionData) {
    return db.prepare(`
        INSERT INTO platform_sessions (platform, status, session_data, last_verified)
        VALUES (?, 'connected', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(platform) DO UPDATE SET
            status = 'connected',
            session_data = excluded.session_data,
            last_verified = CURRENT_TIMESTAMP
    `).run(platform, sessionData);
}

function getSession(platform) {
    return db.prepare('SELECT * FROM platform_sessions WHERE platform = ?').get(platform);
}

function clearSession(platform) {
    return db.prepare('UPDATE platform_sessions SET status = "disconnected", session_data = "" WHERE platform = ?').run(platform);
}

module.exports = {
    db,
    getProfile,
    updateProfile,
    saveJob,
    getJobs,
    updateJobStatus,
    recordApplication,
    getApplications,
    getStats,
    saveSession,
    getSession,
    clearSession
};
