const BaseAdapter = require('./baseAdapter');

class LinkedInAdapter extends BaseAdapter {
    constructor() {
        super('linkedin');
    }

    canHandle(url) {
        return url.includes('linkedin.com');
    }

    /**
     * Search LinkedIn for Easy Apply jobs matching domain & location
     */
    async searchJobs(page, { keywords = 'Full Stack Developer', location = 'Remote', limit = 15 } = {}) {
        const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}&f_AL=true`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);

        const jobs = await page.$$eval('.job-card-container, .jobs-search-results__list-item', cards => {
            return cards.map(c => {
                const titleElem = c.querySelector('.job-card-list__title, .artdeco-entity-lockup__title');
                const companyElem = c.querySelector('.job-card-container__company-name, .artdeco-entity-lockup__subtitle');
                const locationElem = c.querySelector('.job-card-container__metadata-item');
                const linkElem = c.querySelector('a.job-card-list__title, a.job-card-container__link');

                return {
                    title: titleElem ? titleElem.innerText.trim() : '',
                    company: companyElem ? companyElem.innerText.trim() : '',
                    location: locationElem ? locationElem.innerText.trim() : '',
                    url: linkElem ? (linkElem.href.split('?')[0]) : ''
                };
            }).filter(j => j.title && j.url);
        });

        return jobs.slice(0, limit).map(j => ({
            ...j,
            platform: 'linkedin',
            job_type: 'Full-time'
        }));
    }

    /**
     * Automated LinkedIn Easy Apply modal multi-step flow
     */
    async apply(page, job, profile, options = {}) {
        const answersLog = {};
        await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);

        // Click Easy Apply button
        const easyApplyBtn = await page.$('button.jobs-apply-button, button:has-text("Easy Apply")');
        if (!easyApplyBtn) {
            return {
                success: false,
                status: 'skipped',
                answersLog,
                notes: 'Easy Apply button not found (may require external application or login)'
            };
        }

        await easyApplyBtn.click();
        await page.waitForTimeout(2000);

        // Step loop (LinkedIn forms usually have 1 to 5 steps: Contact Info -> Resume -> Questions -> Review)
        let maxSteps = 6;
        let stepCount = 0;
        let isSubmitted = false;

        while (stepCount < maxSteps) {
            stepCount++;
            await page.waitForTimeout(1500);

            // Fill phone if empty
            const phoneInput = await page.$('input[id*="phoneNumber"], input[type="tel"]');
            if (phoneInput && !(await phoneInput.inputValue())) {
                await phoneInput.fill(profile.phone || '+1 555-0199');
                answersLog['Phone'] = profile.phone;
            }

            // Fill text inputs / screening questions on current page
            const textFields = await page.$$('.jobs-easy-apply-modal input[type="text"], .jobs-easy-apply-modal textarea');
            for (const field of textFields) {
                const val = await field.inputValue().catch(() => '');
                if (!val) {
                    const label = await field.evaluate(el => {
                        const lbl = el.closest('.fb-dash-form-element')?.querySelector('label');
                        return lbl ? lbl.innerText : '';
                    });
                    const questionText = label || 'Experience';
                    let answer = '3';
                    if (questionText.toLowerCase().includes('year')) answer = `${Math.round(profile.experience_years || 3)}`;
                    else answer = await this.resolveQuestionAnswer(questionText, profile, job);

                    await field.fill(answer);
                    answersLog[questionText] = answer;
                }
            }

            // Radio questions (Yes/No)
            const radioGroups = await page.$$('.jobs-easy-apply-modal fieldset');
            for (const group of radioGroups) {
                const legend = await group.$('legend');
                const qText = legend ? (await legend.innerText()).toLowerCase() : '';
                
                let chooseYes = true;
                if (qText.includes('sponsor') || qText.includes('felony') || qText.includes('convicted')) {
                    chooseYes = false;
                }

                const targetRadio = await group.$(chooseYes ? 'input[value="Yes"], input[value="true"], label:has-text("Yes")' : 'input[value="No"], input[value="false"], label:has-text("No")');
                if (targetRadio) {
                    await targetRadio.click().catch(() => {});
                }
            }

            // Check if Review or Submit button is present
            const submitBtn = await page.$('.jobs-easy-apply-modal button:has-text("Submit application")');
            if (submitBtn) {
                if (options.reviewOnly) {
                    return {
                        success: true,
                        status: 'review_needed',
                        answersLog,
                        notes: 'Easy Apply modal filled and reached Review step. Awaiting approval.'
                    };
                }

                await submitBtn.click();
                await page.waitForTimeout(3000);
                isSubmitted = true;
                break;
            }

            // Check for Next or Review button
            const nextBtn = await page.$('.jobs-easy-apply-modal button:has-text("Next"), .jobs-easy-apply-modal button:has-text("Review")');
            if (nextBtn) {
                await nextBtn.click();
                await page.waitForTimeout(1500);
            } else {
                break;
            }
        }

        // Verify completion or dismiss dialog
        const modalSuccess = await page.$('.jobs-easy-apply-modal:has-text("Application sent"), .artdeco-modal:has-text("applied")');
        if (modalSuccess || isSubmitted) {
            return {
                success: true,
                status: 'applied',
                answersLog,
                notes: 'Successfully submitted via LinkedIn Easy Apply'
            };
        }

        return {
            success: false,
            status: 'failed',
            answersLog,
            notes: 'Easy Apply modal stopped before submission (complex custom questions or manual verification required)'
        };
    }
}

module.exports = new LinkedInAdapter();
