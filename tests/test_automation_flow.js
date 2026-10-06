const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Import server & services
const { getProfile, updateProfile, getApplications } = require('../database/db');
const browserManager = require('../automation/browserManager');
const greenhouseAdapter = require('../automation/adapters/greenhouseAdapter');

async function testFullAutomationFlow() {
    console.log('--- STARTING PLAYWRIGHT BROWSER AUTOMATION INTEGRATION TEST ---');

    // 1. Prepare sample resume file
    const sampleResumePath = path.join(__dirname, 'test_resume.txt');
    fs.writeFileSync(sampleResumePath, 'Alex Mercer - Full Stack Developer Resume\nSkills: React, Node.js, TypeScript');

    const profile = getProfile();
    updateProfile({
        resume_path: sampleResumePath,
        full_name: 'Alex Mercer',
        email: 'alex.mercer@testapply.dev',
        phone: '+1 (555) 789-0123',
        linkedin_url: 'https://linkedin.com/in/alex-mercer',
        portfolio_url: 'https://alexmercer.dev'
    });

    // 2. Start mock server on port 3999
    const express = require('express');
    const mockApp = express();
    mockApp.use(express.urlencoded({ extended: true }));

    let submittedData = null;
    mockApp.get('/portal/apply', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <body>
                <form method="POST" action="/portal/submit" id="application_form">
                    <input type="text" id="first_name" name="first_name">
                    <input type="text" id="last_name" name="last_name">
                    <input type="email" id="email" name="email">
                    <input type="tel" id="phone" name="phone">
                    <input type="file" id="resume" name="resume">
                    <input type="text" id="linkedin" name="linkedin">
                    <div class="field">
                        <label>Why do you want to join this team?</label>
                        <textarea id="why_us" name="why_us"></textarea>
                    </div>
                    <button type="submit" id="submit_app">Submit Application</button>
                </form>
            </body>
            </html>
        `);
    });

    mockApp.post('/portal/submit', (req, res) => {
        submittedData = req.body;
        res.send('<h1>Thank you for applying! Application received successfully.</h1>');
    });

    const server = mockApp.listen(3999);
    console.log('✓ Mock career portal running at http://localhost:3999/portal/apply');

    try {
        // 3. Launch browser via browserManager
        console.log('Launching Playwright Chromium browser...');
        const { browser, context } = await browserManager.launchBrowser({ headless: true });
        const page = await context.newPage();

        const testJob = {
            id: 'job_test_01',
            title: 'Senior Software Engineer',
            company: 'Stripe Ecosystem',
            url: 'http://localhost:3999/portal/apply',
            platform: 'greenhouse',
            match_score: 92
        };

        console.log('Automating Greenhouse application form...');
        const result = await greenhouseAdapter.apply(page, testJob, getProfile(), { reviewOnly: false });

        console.log('Form submission result:', result);
        assert.strictEqual(result.success, true, 'Form application should be successful');
        assert.strictEqual(result.status, 'applied', 'Status should be applied');

        // Capture screenshot
        const shot = await browserManager.captureScreenshot(page, 'test_proof');
        assert(fs.existsSync(shot.filepath), 'Proof screenshot must exist on disk');
        console.log(`✓ Proof screenshot saved: ${shot.filename}`);

        await page.close();
        await browserManager.closeBrowser();
        console.log('✓ Playwright browser automation test completed successfully!');
    } finally {
        server.close();
        if (fs.existsSync(sampleResumePath)) fs.unlinkSync(sampleResumePath);
    }
}

testFullAutomationFlow().catch(err => {
    console.error('Automation test failed:', err);
    process.exit(1);
});
