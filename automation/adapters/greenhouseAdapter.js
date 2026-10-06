const BaseAdapter = require('./baseAdapter');

class GreenhouseAdapter extends BaseAdapter {
    constructor() {
        super('greenhouse');
    }

    canHandle(url) {
        return url.includes('greenhouse.io') || url.includes('gh_jid');
    }

    /**
     * Fills and submits application on Greenhouse
     */
    async apply(page, job, profile, options = {}) {
        const answersLog = {};
        await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Check if form is embedded in an iframe or on page
        const nameParts = (profile.full_name || 'Candidate').split(' ');
        const firstName = nameParts[0] || 'Candidate';
        const lastName = nameParts.slice(1).join(' ') || 'Applicant';

        // Fill standard personal fields
        if (await page.$('#first_name')) {
            await this.humanType(page, '#first_name', firstName);
            answersLog['First Name'] = firstName;
        }
        if (await page.$('#last_name')) {
            await this.humanType(page, '#last_name', lastName);
            answersLog['Last Name'] = lastName;
        }
        if (await page.$('#email')) {
            await this.humanType(page, '#email', profile.email);
            answersLog['Email'] = profile.email;
        }
        if (await page.$('#phone')) {
            await this.humanType(page, '#phone', profile.phone);
            answersLog['Phone'] = profile.phone;
        }

        // Attach Resume
        if (profile.resume_path) {
            const uploaded = await this.uploadResume(page, 'input[type="file"]', profile.resume_path);
            answersLog['Resume Attached'] = uploaded ? 'Yes' : 'Failed';
        }

        // Fill LinkedIn & GitHub & Portfolio
        const linkedinInput = await page.$('input[autocomplete="custom-question-linkedin"], input[id*="linkedin"], input[name*="linkedin"]');
        if (linkedinInput && profile.linkedin_url) {
            await linkedinInput.fill(profile.linkedin_url);
            answersLog['LinkedIn'] = profile.linkedin_url;
        }

        const websiteInput = await page.$('input[id*="website"], input[name*="website"], input[id*="portfolio"]');
        if (websiteInput && profile.portfolio_url) {
            await websiteInput.fill(profile.portfolio_url);
            answersLog['Portfolio'] = profile.portfolio_url;
        }

        const githubInput = await page.$('input[id*="github"], input[name*="github"]');
        if (githubInput && profile.github_url) {
            await githubInput.fill(profile.github_url);
            answersLog['GitHub'] = profile.github_url;
        }

        // Handle Custom Questions / Fields
        const customFields = await page.$$('.field:not([style*="display: none"])');
        for (const field of customFields) {
            try {
                const labelElem = await field.$('label');
                if (!labelElem) continue;
                const labelText = (await labelElem.innerText()).trim();
                if (!labelText || labelText.includes('First Name') || labelText.includes('Last Name') || labelText.includes('Email') || labelText.includes('Phone')) {
                    continue;
                }

                const textInput = await field.$('input[type="text"], textarea');
                if (textInput) {
                    const currentVal = await textInput.inputValue().catch(() => '');
                    if (!currentVal) {
                        const answer = await this.resolveQuestionAnswer(labelText, profile, job);
                        await textInput.fill(answer);
                        answersLog[labelText] = answer;
                    }
                }

                const selectElem = await field.$('select');
                if (selectElem) {
                    const options = await selectElem.$$('option');
                    if (options.length > 1) {
                        // Select "Yes" if authorization question, or first valid option
                        const optTexts = await Promise.all(options.map(o => o.innerText()));
                        let selectedIndex = 1;
                        if (labelText.toLowerCase().includes('authorized') || labelText.toLowerCase().includes('legally')) {
                            const yesIdx = optTexts.findIndex(t => /yes/i.test(t));
                            if (yesIdx !== -1) selectedIndex = yesIdx;
                        } else if (labelText.toLowerCase().includes('sponsorship')) {
                            const noIdx = optTexts.findIndex(t => /no/i.test(t));
                            if (noIdx !== -1) selectedIndex = noIdx;
                        }
                        const val = await options[selectedIndex].getAttribute('value');
                        if (val) await selectElem.selectOption(val);
                    }
                }
            } catch (err) {
                // skip field error
            }
        }

        // If safety review mode is requested, pause or return
        if (options.reviewOnly) {
            return {
                success: true,
                status: 'review_needed',
                answersLog,
                notes: 'Form prefilled. Awaiting manual confirmation.'
            };
        }

        // Submit form
        const submitBtn = await page.$('#submit_app, button[type="submit"]:has-text("Submit Application"), input[type="submit"]');
        if (submitBtn) {
            await submitBtn.click();
            await page.waitForTimeout(4000);

            // Check confirmation
            const content = await page.content();
            const isConfirmed = /thank you|application submitted|received your application|success/i.test(content) || page.url().includes('confirmation');

            return {
                success: isConfirmed,
                status: isConfirmed ? 'applied' : 'review_needed',
                answersLog,
                notes: isConfirmed ? 'Application submitted successfully on Greenhouse' : 'Submitted; confirmation pending verification'
            };
        }

        return {
            success: false,
            status: 'failed',
            answersLog,
            error: 'Submit button not located'
        };
    }
}

module.exports = new GreenhouseAdapter();
