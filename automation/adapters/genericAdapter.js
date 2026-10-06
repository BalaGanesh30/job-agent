const BaseAdapter = require('./baseAdapter');

class GenericAdapter extends BaseAdapter {
    constructor() {
        super('generic');
    }

    canHandle(url) {
        return true; // Fallback handler
    }

    async apply(page, job, profile, options = {}) {
        const answersLog = {};
        await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(3000);

        // Find and click any "Apply" or "Apply Now" button to open application form if on description page
        const applyNowBtn = await page.$('a:has-text("Apply Now"), button:has-text("Apply Now"), a:has-text("Apply for this job")');
        if (applyNowBtn) {
            await applyNowBtn.click();
            await page.waitForTimeout(2000);
        }

        // 1. Fill Name
        const nameInput = await page.$('input[name*="name"], input[id*="name"], input[placeholder*="Name" i]');
        if (nameInput) {
            await nameInput.fill(profile.full_name);
            answersLog['Name'] = profile.full_name;
        }

        // 2. Fill Email
        const emailInput = await page.$('input[type="email"], input[name*="email"], input[id*="email"]');
        if (emailInput) {
            await emailInput.fill(profile.email);
            answersLog['Email'] = profile.email;
        }

        // 3. Fill Phone
        const phoneInput = await page.$('input[type="tel"], input[name*="phone"], input[id*="phone"]');
        if (phoneInput && profile.phone) {
            await phoneInput.fill(profile.phone);
            answersLog['Phone'] = profile.phone;
        }

        // 4. Fill Links
        const linkedinInput = await page.$('input[name*="linkedin" i], input[id*="linkedin" i]');
        if (linkedinInput && profile.linkedin_url) {
            await linkedinInput.fill(profile.linkedin_url);
            answersLog['LinkedIn'] = profile.linkedin_url;
        }

        const githubInput = await page.$('input[name*="github" i], input[id*="github" i]');
        if (githubInput && profile.github_url) {
            await githubInput.fill(profile.github_url);
            answersLog['GitHub'] = profile.github_url;
        }

        // 5. Upload Resume
        if (profile.resume_path) {
            const uploaded = await this.uploadResume(page, 'input[type="file"]', profile.resume_path);
            answersLog['Resume'] = uploaded ? 'Attached' : 'Not attached';
        }

        if (options.reviewOnly) {
            return {
                success: true,
                status: 'review_needed',
                answersLog,
                notes: 'Generic form mapped and prefilled. Ready for manual review.'
            };
        }

        // 6. Look for Submit button
        const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Send Application")');
        if (submitBtn) {
            await submitBtn.click();
            await page.waitForTimeout(4000);

            const content = await page.content();
            const confirmed = /thank you|application received|successfully submitted/i.test(content);
            return {
                success: confirmed,
                status: confirmed ? 'applied' : 'review_needed',
                answersLog,
                notes: confirmed ? 'Form submitted successfully' : 'Form submitted; confirmation verification pending'
            };
        }

        return {
            success: false,
            status: 'failed',
            answersLog,
            error: 'Submit button not located on generic page'
        };
    }
}

module.exports = new GenericAdapter();
