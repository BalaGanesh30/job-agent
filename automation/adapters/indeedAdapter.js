const BaseAdapter = require('./baseAdapter');

class IndeedAdapter extends BaseAdapter {
    constructor() {
        super('indeed');
    }

    canHandle(url) {
        return url.includes('indeed.com');
    }

    /**
     * Search Indeed for jobs with 'Easily apply' filter
     */
    async searchJobs(page, { keywords = 'Full Stack Developer', location = 'Remote', limit = 15 } = {}) {
        const searchUrl = `https://www.indeed.com/jobs?q=${encodeURIComponent(keywords)}&l=${encodeURIComponent(location)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(3000);

        const jobs = await page.$$eval('.job_seen_beacon, .resultContent', cards => {
            return cards.map(c => {
                const titleElem = c.querySelector('h2.jobTitle span, a.jcs-JobTitle');
                const companyElem = c.querySelector('[data-testid="company-name"], .companyName');
                const locationElem = c.querySelector('[data-testid="text-location"], .companyLocation');
                const linkElem = c.querySelector('h2.jobTitle a, a.jcs-JobTitle');
                const easilyApply = c.querySelector('.iaIcon, [aria-label*="Easily apply" i], .jobCardShelfContainer');

                return {
                    title: titleElem ? titleElem.innerText.trim() : '',
                    company: companyElem ? companyElem.innerText.trim() : '',
                    location: locationElem ? locationElem.innerText.trim() : '',
                    url: linkElem ? linkElem.href : '',
                    is_easy_apply: Boolean(easilyApply)
                };
            }).filter(j => j.title && j.url);
        });

        return jobs.slice(0, limit).map(j => ({
            ...j,
            platform: 'indeed',
            job_type: 'Full-time'
        }));
    }

    /**
     * Automated Indeed Apply flow
     */
    async apply(page, job, profile, options = {}) {
        const answersLog = {};
        await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(2500);

        // Locate Indeed Apply Button
        const applyBtn = await page.$(
            '#indeedApplyButton, button:has-text("Apply now"), button:has-text("Easily apply"), [data-testid="indeedApplyButton"]'
        );

        if (!applyBtn) {
            return {
                success: false,
                status: 'skipped',
                answersLog,
                notes: 'Indeed 1-click/Easily apply button not found (may require external company portal)'
            };
        }

        await applyBtn.click();
        await page.waitForTimeout(3000);

        // Multi-step modal / drawer loop (Contact -> Resume -> Questions -> Review)
        const nameParts = (profile.full_name || 'Candidate').split(' ');
        const firstName = nameParts[0] || 'Candidate';
        const lastName = nameParts.slice(1).join(' ') || 'Applicant';

        let maxSteps = 7;
        let step = 0;
        let isSubmitted = false;

        while (step < maxSteps) {
            step++;
            await page.waitForTimeout(1500);

            // Contact Info Fields
            const firstNameInput = await page.$('input[id*="firstName"], input[name*="firstName"]');
            if (firstNameInput && !(await firstNameInput.inputValue())) {
                await firstNameInput.fill(firstName);
                answersLog['First Name'] = firstName;
            }

            const lastNameInput = await page.$('input[id*="lastName"], input[name*="lastName"]');
            if (lastNameInput && !(await lastNameInput.inputValue())) {
                await lastNameInput.fill(lastName);
                answersLog['Last Name'] = lastName;
            }

            const emailInput = await page.$('input[type="email"], input[id*="email"], input[name*="email"]');
            if (emailInput && !(await emailInput.inputValue())) {
                await emailInput.fill(profile.email);
                answersLog['Email'] = profile.email;
            }

            const phoneInput = await page.$('input[type="tel"], input[id*="phoneNumber"], input[name*="phone"]');
            if (phoneInput && !(await phoneInput.inputValue())) {
                await phoneInput.fill(profile.phone);
                answersLog['Phone'] = profile.phone;
            }

            // Resume File Upload if present on step
            const fileInput = await page.$('input[type="file"]');
            if (fileInput && profile.resume_path) {
                const uploaded = await this.uploadResume(page, 'input[type="file"]', profile.resume_path);
                answersLog['Resume Attached'] = uploaded ? 'Yes' : 'Not required / Existing';
            }

            // Screening Questions on step
            const textFields = await page.$$('form input[type="text"], form textarea');
            for (const field of textFields) {
                const val = await field.inputValue().catch(() => '');
                if (!val) {
                    const labelElem = await field.evaluateHandle(el => {
                        const lbl = el.closest('div')?.querySelector('label');
                        return lbl ? lbl.innerText : '';
                    });
                    const questionText = (await labelElem.jsonValue()) || 'Screening Question';
                    let answer = '';
                    if (questionText.toLowerCase().includes('year')) {
                        answer = `${Math.round(profile.experience_years || 3)}`;
                    } else {
                        answer = await this.resolveQuestionAnswer(questionText, profile, job);
                    }
                    await field.fill(answer);
                    answersLog[questionText] = answer;
                }
            }

            // Radios (Yes/No)
            const radioGroups = await page.$$('fieldset');
            for (const group of radioGroups) {
                const legend = await group.$('legend');
                const qText = legend ? (await legend.innerText()).toLowerCase() : '';
                let chooseYes = true;
                if (qText.includes('sponsor') || qText.includes('felony') || qText.includes('convicted')) {
                    chooseYes = false;
                }
                const targetRadio = await group.$(chooseYes ? 'input[value*="Yes" i], label:has-text("Yes")' : 'input[value*="No" i], label:has-text("No")');
                if (targetRadio) await targetRadio.click().catch(() => {});
            }

            // Check if on Final Submit step
            const submitBtn = await page.$(
                'button:has-text("Submit your application"), button:has-text("Submit application"), button[data-testid="SubmitButton"]'
            );
            if (submitBtn) {
                if (options.reviewOnly) {
                    return {
                        success: true,
                        status: 'review_needed',
                        answersLog,
                        notes: 'Indeed form prefilled and reached review step. Awaiting manual confirmation.'
                    };
                }

                await submitBtn.click();
                await page.waitForTimeout(4000);
                isSubmitted = true;
                break;
            }

            // Check for Continue / Next button
            const continueBtn = await page.$(
                'button:has-text("Continue"), button:has-text("Next"), button:has-text("Review your application"), [data-testid="continue-button"]'
            );
            if (continueBtn) {
                await continueBtn.click();
                await page.waitForTimeout(1500);
            } else {
                break;
            }
        }

        // Verify confirmation
        const content = await page.content();
        const isConfirmed = /application submitted|your application was sent|applied|thank you/i.test(content) || isSubmitted;

        return {
            success: isConfirmed,
            status: isConfirmed ? 'applied' : 'review_needed',
            answersLog,
            notes: isConfirmed ? 'Application submitted successfully on Indeed' : 'Submitted; confirmation pending review'
        };
    }
}

module.exports = new IndeedAdapter();
