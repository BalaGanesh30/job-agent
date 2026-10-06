const assert = require('assert');
const path = require('path');
const fs = require('fs');
const express = require('express');

const indeedAdapter = require('../automation/adapters/indeedAdapter');
const agentWorker = require('../automation/agentWorker');
const browserManager = require('../automation/browserManager');
const { getProfile } = require('../database/db');

async function testIndeedAutomation() {
    console.log('--- STARTING INDEED ADAPTER AUTOMATION TEST ---');

    // 1. Adapter Detection & Routing Test
    assert(indeedAdapter.canHandle('https://www.indeed.com/viewjob?jk=abcdef123456'), 'Indeed adapter handles indeed.com URLs');
    assert(indeedAdapter.canHandle('https://in.indeed.com/jobs?q=developer'), 'Indeed adapter handles international indeed subdomains');

    const sampleIndeedJob = {
        id: 'ind_test_01',
        title: 'Full Stack Engineer',
        company: 'Atlassian Global',
        url: 'https://www.indeed.com/viewjob?jk=987654321',
        platform: 'indeed'
    };

    const selectedAdapter = agentWorker.selectAdapter(sampleIndeedJob);
    assert.strictEqual(selectedAdapter.platformName, 'indeed', 'agentWorker selects indeedAdapter for Indeed job');
    console.log('✓ Indeed adapter URL matching and agentWorker routing verified.');

    // 2. Start mock Indeed application server on port 3998
    const mockApp = express();
    mockApp.use(express.urlencoded({ extended: true }));

    let submitted = false;
    mockApp.get('/mock/indeed-job', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Full Stack Engineer - Indeed</title></head>
            <body>
                <h1>Full Stack Engineer</h1>
                <p>Atlassian Global - Remote</p>
                <button id="indeedApplyButton" onclick="document.getElementById('modal').style.display='block'">Apply now</button>

                <div id="modal" style="display: none; padding: 20px; border: 1px solid #ccc; margin-top: 20px;">
                    <form method="POST" action="/mock/indeed-submit">
                        <label>First Name</label>
                        <input type="text" id="input-firstName" name="firstName">
                        
                        <label>Last Name</label>
                        <input type="text" id="input-lastName" name="lastName">

                        <label>Email</label>
                        <input type="email" id="input-email" name="email">

                        <label>Phone number</label>
                        <input type="tel" id="input-phoneNumber" name="phone">

                        <div>
                            <label>How many years of experience do you have with React?</label>
                            <input type="text" name="react_exp">
                        </div>

                        <button type="submit">Submit your application</button>
                    </form>
                </div>
            </body>
            </html>
        `);
    });

    mockApp.post('/mock/indeed-submit', (req, res) => {
        submitted = true;
        res.send('<h1>Your application was sent to Atlassian Global. Thank you!</h1>');
    });

    const server = mockApp.listen(3998);
    console.log('✓ Mock Indeed portal running on http://localhost:3998/mock/indeed-job');

    try {
        const { browser, context } = await browserManager.launchBrowser({ headless: true });
        const page = await context.newPage();

        const testJob = {
            id: 'job_mock_ind_1',
            title: 'Full Stack Engineer',
            company: 'Atlassian Global',
            url: 'http://localhost:3998/mock/indeed-job',
            platform: 'indeed',
            match_score: 88
        };

        console.log('Executing Indeed automated apply flow...');
        const profile = getProfile();
        const result = await indeedAdapter.apply(page, testJob, profile, { reviewOnly: false });

        console.log('Indeed application result:', result);
        assert.strictEqual(result.success, true, 'Indeed application should be successful');
        assert.strictEqual(result.status, 'applied', 'Status should be applied');
        assert.strictEqual(submitted, true, 'Mock server received Indeed form submission');

        // Screenshot verification
        const shot = await browserManager.captureScreenshot(page, 'indeed_proof');
        assert(fs.existsSync(shot.filepath), 'Proof screenshot must exist');
        console.log(`✓ Indeed proof screenshot saved: ${shot.filename}`);

        await page.close();
        await browserManager.closeBrowser();
        console.log('--- ALL INDEED AUTOMATION TESTS PASSED! ---');
    } finally {
        server.close();
    }
}

testIndeedAutomation().catch(err => {
    console.error('Indeed test failed:', err);
    process.exit(1);
});
