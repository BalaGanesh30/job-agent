const BaseAdapter = require('./baseAdapter');

class LeverAdapter extends BaseAdapter {
    constructor() {
        super('lever');
    }

    canHandle(url) {
        return url.includes('lever.co');
    }

    async apply(page, job, profile, options = {}) {
        const answersLog = {};
        let applyUrl = job.url;
        if (!applyUrl.endsWith('/apply')) {
            applyUrl = applyUrl.replace(/\/$/, '') + '/apply';
        }

        await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Name
        if (await page.$('input[name="name"]')) {
            await this.humanType(page, 'input[name="name"]', profile.full_name);
            answersLog['Full Name'] = profile.full_name;
        }

        // Email
        if (await page.$('input[name="email"]')) {
            await this.humanType(page, 'input[name="email"]', profile.email);
            answersLog['Email'] = profile.email;
        }

        // Phone
        if (await page.$('input[name="phone"]')) {
            await this.humanType(page, 'input[name="phone"]', profile.phone);
            answersLog['Phone'] = profile.phone;
        }

        // Current Company
        if (await page.$('input[name="org"]')) {
            await this.humanType(page, 'input[name="org"]', profile.current_title || 'Software Engineering');
            answersLog['Current Org'] = profile.current_title;
        }

        // Social Links
        const linkedin = await page.$('input[name="urls[LinkedIn]"], input[id*="linkedin"]');
        if (linkedin && profile.linkedin_url) {
            await linkedin.fill(profile.linkedin_url);
            answersLog['LinkedIn'] = profile.linkedin_url;
        }

        const github = await page.$('input[name="urls[GitHub]"], input[id*="github"]');
        if (github && profile.github_url) {
            await github.fill(profile.github_url);
            answersLog['GitHub'] = profile.github_url;
        }

        const portfolio = await page.$('input[name="urls[Portfolio]"], input[name="urls[Other]"]');
        if (portfolio && profile.portfolio_url) {
            await portfolio.fill(profile.portfolio_url);
            answersLog['Portfolio'] = profile.portfolio_url;
        }

        // Resume Upload
        if (profile.resume_path) {
            const uploaded = await this.uploadResume(page, 'input[type="file"], input[name="resume"]', profile.resume_path);
            answersLog['Resume Attached'] = uploaded ? 'Yes' : 'Failed';
        }

        // Additional Cards / Custom Questions
        const customQuestions = await page.$$('.application-question, .custom-question');
        for (const qElem of customQuestions) {
            try {
                const label = await qElem.$('.text, label');
                const labelText = label ? (await label.innerText()).trim() : '';
                if (!labelText) continue;

                const textarea = await qElem.$('textarea');
                if (textarea) {
                    const ans = await this.resolveQuestionAnswer(labelText, profile, job);
                    await textarea.fill(ans);
                    answersLog[labelText] = ans;
                }

                const textInput = await qElem.$('input[type="text"]');
                if (textInput && !(await textInput.inputValue())) {
                    const ans = await this.resolveQuestionAnswer(labelText, profile, job);
                    await textInput.fill(ans);
                    answersLog[labelText] = ans;
                }
            } catch (err) {
                // skip
            }
        }

        if (options.reviewOnly) {
            return {
                success: true,
                status: 'review_needed',
                answersLog,
                notes: 'Form prefilled on Lever. Ready for manual confirmation.'
            };
        }

        // Submit
        const submitBtn = await page.$('button[data-qa="btn-submit"], button:has-text("Submit application"), #btn-submit');
        if (submitBtn) {
            await submitBtn.click();
            await page.waitForTimeout(4000);

            const isConfirmed = page.url().includes('/thanks') || (await page.content()).includes('Application submitted');
            return {
                success: isConfirmed,
                status: isConfirmed ? 'applied' : 'review_needed',
                answersLog,
                notes: isConfirmed ? 'Application submitted successfully on Lever' : 'Submitted; confirmation pending'
            };
        }

        return {
            success: false,
            status: 'failed',
            answersLog,
            error: 'Lever submit button not found'
        };
    }
}

module.exports = new LeverAdapter();
