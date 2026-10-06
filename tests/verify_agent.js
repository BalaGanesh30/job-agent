const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { db, getProfile, updateProfile, saveJob, getJobs, getStats, getApplications } = require('../database/db');
const { extractProfileFromText } = require('../services/resumeParser');
const { evaluateJobMatch } = require('../services/matcher');
const reportService = require('../services/reportService');
const jobDiscoveryService = require('../services/jobDiscovery');

async function runTests() {
    console.log('--- STARTING APPLYPILOT AI TEST SUITE ---');

    // 1. Database & Profile Test
    console.log('Testing 1: Database & Profile Operations...');
    const profile = getProfile();
    assert(profile, 'Profile should exist');
    assert.strictEqual(profile.id, 1, 'Profile id should be 1');
    console.log(`✓ Profile verified: ${profile.full_name} (${profile.domain}, ${profile.experience_years} yrs)`);

    // 2. Resume Parser Test
    console.log('Testing 2: Resume Parser Extraction...');
    const sampleResumeText = `
Alex Mercer
Senior Full Stack Engineer
alex.mercer.dev@example.com
(555) 234-5678
https://linkedin.com/in/alex-mercer
https://github.com/alex-mercer

Professional Summary:
Full stack developer with 4 years of experience building modern web applications, distributed APIs, and cloud services.

Technical Skills:
JavaScript, TypeScript, React, Node.js, Express, PostgreSQL, Docker, AWS, Git, REST APIs
    `;

    const parsed = extractProfileFromText(sampleResumeText);
    assert.strictEqual(parsed.email, 'alex.mercer.dev@example.com', 'Parsed email matches');
    assert.strictEqual(parsed.domain, 'Full Stack Developer', 'Parsed domain matches');
    assert(parsed.skills.includes('React'), 'Skills include React');
    assert(parsed.skills.includes('Node.js'), 'Skills include Node.js');
    console.log(`✓ Resume parsed correctly: Email=${parsed.email}, Domain=${parsed.domain}, SkillsCount=${parsed.skills.length}, Exp=${parsed.experienceYears} yrs`);

    // 3. Matcher Engine Test
    console.log('Testing 3: Domain & Experience Matcher...');
    const sampleJobHigh = {
        title: 'Senior Full Stack Developer (Node.js & React)',
        company: 'Vercel Ecosystem',
        description: 'Looking for a Full Stack Developer with 3+ years experience in React, Node.js, TypeScript, and PostgreSQL. Remote.',
        location: 'Remote'
    };

    const matchHigh = evaluateJobMatch(profile, sampleJobHigh);
    assert(matchHigh.score >= 75, `High match score should be >= 75 (got ${matchHigh.score})`);
    assert(matchHigh.eligible, 'Job should be eligible');
    console.log(`✓ High match job evaluated: Score = ${matchHigh.score}%, Reasons = ${matchHigh.reasons.length}`);

    const sampleJobMismatch = {
        title: 'Junior iOS Swift Mobile Developer',
        company: 'MobileCo',
        description: 'iOS development with Swift and Xcode. 1 year experience required.',
        location: 'Onsite Tokyo'
    };

    const matchLow = evaluateJobMatch(profile, sampleJobMismatch);
    assert(matchLow.score < 60, `Low match score should be < 60 (got ${matchLow.score})`);
    console.log(`✓ Mismatch job correctly flagged: Score = ${matchLow.score}%`);

    // 4. Job Discovery & Scoring Persistence Test
    console.log('Testing 4: Job Discovery & Database Insertion...');
    const jobs = await jobDiscoveryService.discoverJobs({ domain: 'Full Stack Developer' });
    assert(jobs.length > 0, 'Discovery should return jobs');
    const dbJobs = getJobs({ limit: 10 });
    assert(dbJobs.length > 0, 'Discovered jobs should be persisted in database');
    console.log(`✓ Discovered & persisted ${jobs.length} jobs.`);

    // 5. Reporting Service Test
    console.log('Testing 5: Reporting Engine (CSV & HTML)...');
    const csv = reportService.generateCSV();
    assert(csv.includes('Date Applied'), 'CSV should contain headers');

    const html = reportService.generateHTMLSummary('Unit Test Period');
    assert(html.includes('ApplyPilot AI'), 'HTML report contains header');
    assert(html.includes('Total Discovered'), 'HTML report contains stats');
    console.log('✓ CSV and HTML reports generated successfully.');

    console.log('--- ALL UNIT & LOGIC TESTS PASSED! ---');
}

runTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
