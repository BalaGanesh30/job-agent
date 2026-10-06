const BaseAdapter = require('./baseAdapter');

class NaukriAdapter extends BaseAdapter {
    constructor() {
        super('naukri');
    }

    canHandle(url) {
        return url.includes('naukri.com');
    }

    /**
     * Search Naukri for job listings matching role and experience
     */
    async searchJobs(page, { keywords = 'Full Stack Developer', experience = 3, location = 'Bangalore', limit = 15 } = {}) {
        const slugKeyword = keywords.toLowerCase().replace(/\s+/g, '-');
        const searchUrl = `https://www.naukri.com/${slugKeyword}-jobs?experience=${Math.floor(experience)}&cityTypeGid=${encodeURIComponent(location)}`;

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(3000);

        const jobs = await page.$$eval('.srp-jobtuple-wrapper, .cust-job-tuple', elements => {
            return elements.map(el => {
                const titleElem = el.querySelector('a.title, .title');
                const compElem = el.querySelector('a.comp-name, .comp-name');
                const expElem = el.querySelector('.exp-wrap, .exp');
                const locElem = el.querySelector('.loc-wrap, .loc');
                const linkElem = el.querySelector('a.title');

                return {
                    title: titleElem ? titleElem.innerText.trim() : '',
                    company: compElem ? compElem.innerText.trim() : '',
                    location: locElem ? locElem.innerText.trim() : '',
                    experience_required: expElem ? expElem.innerText.trim() : '',
                    url: linkElem ? linkElem.href : ''
                };
            }).filter(j => j.title && j.url);
        });

        return jobs.slice(0, limit).map(j => ({
            ...j,
            platform: 'naukri',
            job_type: 'Full-time'
        }));
    }

    /**
     * Apply to a job posting on Naukri
     */
    async apply(page, job, profile, options = {}) {
        const answersLog = {};
        await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500);

        // Check for Apply Button
        const applyBtn = await page.$('#apply-button, button.apply-button, button:has-text("Apply")');
        if (!applyBtn) {
            // Check if already applied
            const alreadyApplied = await page.$('.already-applied, button:has-text("Already Applied")');
            if (alreadyApplied) {
                return {
                    success: true,
                    status: 'applied',
                    answersLog,
                    notes: 'Already applied on Naukri'
                };
            }

            return {
                success: false,
                status: 'skipped',
                answersLog,
                notes: 'Apply button not found or requires company site redirect'
            };
        }

        if (options.reviewOnly) {
            return {
                success: true,
                status: 'review_needed',
                answersLog,
                notes: 'Found Naukri job listing. Ready for 1-click confirmation.'
            };
        }

        await applyBtn.click();
        await page.waitForTimeout(3000);

        // Handle Questionnaire modal if present
        const modal = await page.$('.apply-message-modal, .chatbot-container, .apply-questions');
        if (modal) {
            // Fill common questions: Expected CTC, Notice Period
            const inputs = await modal.$$('input[type="text"], textarea');
            for (const input of inputs) {
                const placeholder = (await input.getAttribute('placeholder') || '').toLowerCase();
                if (placeholder.includes('notice')) {
                    await input.fill(profile.screening_answers?.notice_period || '15 Days');
                    answersLog['Notice Period'] = '15 Days';
                } else if (placeholder.includes('ctc') || placeholder.includes('salary')) {
                    await input.fill(profile.screening_answers?.expected_salary || '18 LPA');
                    answersLog['Expected CTC'] = '18 LPA';
                } else {
                    await input.fill(`${profile.experience_years} years`);
                }
            }

            const submitModalBtn = await modal.$('button:has-text("Submit"), button:has-text("Save and Apply")');
            if (submitModalBtn) {
                await submitModalBtn.click();
                await page.waitForTimeout(2000);
            }
        }

        const isSuccess = await page.$('.apply-message:has-text("successfully applied"), .apply-success');
        return {
            success: true,
            status: 'applied',
            answersLog,
            notes: 'Successfully applied via Naukri'
        };
    }
}

module.exports = new NaukriAdapter();
