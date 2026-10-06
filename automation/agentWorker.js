const EventEmitter = require('events');
const browserManager = require('./browserManager');
const greenhouseAdapter = require('./adapters/greenhouseAdapter');
const leverAdapter = require('./adapters/leverAdapter');
const linkedinAdapter = require('./adapters/linkedinAdapter');
const naukriAdapter = require('./adapters/naukriAdapter');
const indeedAdapter = require('./adapters/indeedAdapter');
const genericAdapter = require('./adapters/genericAdapter');
const { getProfile, getJobs, recordApplication, updateJobStatus } = require('../database/db');
const reportService = require('../services/reportService');

class AgentWorker extends EventEmitter {
    constructor() {
        super();
        this.status = 'idle'; // 'idle', 'running', 'paused', 'stopped'
        this.currentJob = null;
        this.stats = {
            total: 0,
            processed: 0,
            successful: 0,
            failed: 0,
            skipped: 0
        };
        this.abortRequested = false;
        this.pauseRequested = false;
        this.activePage = null;
    }

    log(type, message, data = {}) {
        const entry = {
            timestamp: new Date().toLocaleTimeString(),
            type, // 'info', 'success', 'warning', 'error', 'step'
            message,
            data
        };
        this.emit('log', entry);
        console.log(`[AgentWorker ${entry.type.toUpperCase()}] ${entry.message}`);
    }

    getStatus() {
        return {
            status: this.status,
            currentJob: this.currentJob,
            stats: this.stats
        };
    }

    async startBatch({ limit = 10, reviewOnly = false } = {}) {
        if (this.status === 'running') {
            throw new Error('Agent is already running a batch.');
        }

        const profile = getProfile();
        const queuedJobs = getJobs({ status: 'queued', minScore: profile.auto_apply_threshold, limit });

        if (queuedJobs.length === 0) {
            this.log('warning', 'No queued jobs found meeting match score threshold (' + profile.auto_apply_threshold + '%). Discover more jobs or lower threshold.');
            return { processed: 0, message: 'No eligible queued jobs found.' };
        }

        this.status = 'running';
        this.abortRequested = false;
        this.pauseRequested = false;
        this.stats = {
            total: queuedJobs.length,
            processed: 0,
            successful: 0,
            failed: 0,
            skipped: 0
        };

        this.log('info', `Starting autonomous application run for ${queuedJobs.length} jobs (Threshold: ${profile.auto_apply_threshold}%)`);
        this.emit('stateChange', this.getStatus());

        // Launch Playwright
        const headless = Boolean(profile.headless_mode);
        this.log('step', `Launching automated browser (${headless ? 'Headless background' : 'Headed visual preview'})...`);

        let browserObj;
        try {
            browserObj = await browserManager.launchBrowser({ headless });
        } catch (err) {
            this.log('error', `Failed to launch browser: ${err.message}`);
            this.status = 'idle';
            this.emit('stateChange', this.getStatus());
            throw err;
        }

        // Process queue loop
        (async () => {
            try {
                for (const job of queuedJobs) {
                    if (this.abortRequested) {
                        this.log('warning', 'Autonomous run stopped by user.');
                        break;
                    }

                    while (this.pauseRequested) {
                        this.status = 'paused';
                        this.emit('stateChange', this.getStatus());
                        await new Promise(r => setTimeout(r, 1000));
                    }
                    this.status = 'running';
                    this.emit('stateChange', this.getStatus());

                    this.currentJob = job;
                    this.emit('stateChange', this.getStatus());
                    this.log('step', `Processing application: [${job.company}] ${job.title} (${job.match_score}% match)`);

                    await this.processJobApplication(browserObj.context, job, profile, reviewOnly);
                    this.stats.processed++;
                    this.emit('stateChange', this.getStatus());

                    // Polite pacing between applications
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (fatalError) {
                this.log('error', `Worker encountered an issue: ${fatalError.message}`);
            } finally {
                this.status = 'idle';
                this.currentJob = null;
                await browserManager.closeBrowser();
                this.log('success', `Application batch finished. Completed: ${this.stats.successful}, Failed: ${this.stats.failed}, Skipped: ${this.stats.skipped}`);
                
                // Record snapshot report
                reportService.saveReportSnapshot('Batch Completed');
                this.emit('stateChange', this.getStatus());
            }
        })();

        return { queued: queuedJobs.length, status: 'running' };
    }

    async processJobApplication(context, job, profile, reviewOnly = false) {
        let page = null;
        try {
            page = await context.newPage();
            this.activePage = page;

            // Route to appropriate adapter
            const adapter = this.selectAdapter(job);
            this.log('info', `Routing to [${adapter.platformName.toUpperCase()}] adapter for URL: ${job.url}`);

            const result = await adapter.apply(page, job, profile, { reviewOnly });

            // Capture screenshot proof
            let screenshot = { filename: '', filepath: '' };
            try {
                screenshot = await browserManager.captureScreenshot(page, `app_${job.id}`);
            } catch (err) {
                console.warn('Screenshot capture failed:', err.message);
            }

            const isSuccess = result.status === 'applied';
            if (isSuccess) {
                this.stats.successful++;
                this.log('success', `✓ Application submitted successfully to ${job.company} for "${job.title}"!`);
            } else if (result.status === 'review_needed') {
                this.log('warning', `⚠ Application prefilled for ${job.company}. Review needed: ${result.notes}`);
            } else if (result.status === 'skipped') {
                this.stats.skipped++;
                this.log('info', `Skipped ${job.company}: ${result.notes}`);
            } else {
                this.stats.failed++;
                this.log('error', `✗ Failed applying to ${job.company}: ${result.error || result.notes}`);
            }

            // Save record
            recordApplication({
                id: 'app_' + Date.now(),
                job_id: job.id,
                company: job.company,
                title: job.title,
                url: job.url,
                platform: job.platform,
                match_score: job.match_score,
                status: result.status || 'applied',
                screenshot_path: screenshot.filename ? `/screenshots/${screenshot.filename}` : '',
                answers_log: result.answersLog || {},
                error_log: result.error || '',
                notes: result.notes || ''
            });

        } catch (err) {
            this.stats.failed++;
            this.log('error', `Error processing ${job.company}: ${err.message}`);
            recordApplication({
                id: 'app_' + Date.now(),
                job_id: job.id,
                company: job.company,
                title: job.title,
                url: job.url,
                platform: job.platform,
                match_score: job.match_score,
                status: 'failed',
                screenshot_path: '',
                answers_log: {},
                error_log: err.message,
                notes: 'Unhandled application error'
            });
        } finally {
            if (page) await page.close().catch(() => {});
            this.activePage = null;
        }
    }

    selectAdapter(job) {
        const url = (job.url || '').toLowerCase();
        const platform = (job.platform || '').toLowerCase();

        if (platform === 'greenhouse' || greenhouseAdapter.canHandle(url)) return greenhouseAdapter;
        if (platform === 'lever' || leverAdapter.canHandle(url)) return leverAdapter;
        if (platform === 'linkedin' || linkedinAdapter.canHandle(url)) return linkedinAdapter;
        if (platform === 'naukri' || naukriAdapter.canHandle(url)) return naukriAdapter;
        if (platform === 'indeed' || indeedAdapter.canHandle(url)) return indeedAdapter;
        return genericAdapter;
    }

    pause() {
        if (this.status === 'running') {
            this.pauseRequested = true;
            this.log('info', 'Pausing application worker...');
            return true;
        }
        return false;
    }

    resume() {
        if (this.status === 'paused') {
            this.pauseRequested = false;
            this.log('info', 'Resuming application worker...');
            return true;
        }
        return false;
    }

    stop() {
        this.abortRequested = true;
        this.pauseRequested = false;
        this.log('warning', 'Stop signal received. Cleaning up worker...');
        return true;
    }
}

module.exports = new AgentWorker();
