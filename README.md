# ApplyPilot AI — Autonomous Job Applying Agent

**ApplyPilot AI** is an autonomous job application system that replaces manual application workflows. It ingests your resume, matches positions across career boards based on your domain and experience level, automates form filling and submissions using Playwright browser automation, and tracks application records with verification proof and exportable reports.

---

## 🌟 Key Capabilities

- **Resume & Domain Intelligence**:
  - Automatically parses PDF / text resumes (`services/resumeParser.js`).
  - Extracts full name, contact information, domain specialization, skills list, and calculated years of experience.
  - Maintains default answers for standard screening questions (Notice Period, Expected CTC, Visa Sponsorship, Authorization).
- **Multi-Platform Support**:
  - **LinkedIn**: Easy Apply multi-step modal automation with session cookie persistence.
  - **Naukri.com**: Search by role and experience, automated questionnaire solving, and 1-click apply.
  - **Indeed**: Search with "Easily apply" filter, multi-step application drawer filling, and submission verification.
  - **Greenhouse Boards**: Automated form filling, resume attachment, custom questions answering, and confirmation detection.
  - **Lever Boards**: Single-page form automation and submission verification.
  - **Remote Feeds**: Direct ingestion from RemoteOK and Jobicy APIs.
  - **Direct URL Importer**: Paste any company career posting link to queue it for immediate application.
- **Smart Match Scoring**:
  - Evaluates job descriptions with a 0–100% fit score based on Domain Alignment (35%), Years of Experience (25%), Skill Overlap (30%), and Location (10%).
  - Configurable auto-apply threshold (default: 75%).
- **Browser Automation & Safety**:
  - Powered by [Playwright](https://playwright.dev/) with stealth browser settings.
  - Toggle between **Headed Preview** (watch the agent type and click live) and **Headless Mode** (silent background runs).
  - Real-time **Pause / Resume / Stop** controls.
  - Optional **Safety Review Mode** (prefills forms and pauses for your 1-click confirmation before submission).
- **Audit Trails & Reporting**:
  - Real-time Server-Sent Events (SSE) log terminal in the web UI.
  - Full application history saved in SQLite database (`job_agent.db`).
  - Evidence screenshots captured upon application submission.
  - One-click **CSV Spreadsheet** export and printable **HTML Report Summary**.
  - Automated summary email dispatch via Nodemailer SMTP.

---

## 🚀 Quick Start Guide

### 1. Start the Application
Run the following in the project root:
```powershell
npm start
```

Open your browser to:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🖥️ Using the Dashboard

1. **Profile & Resume Tab**:
   - Drag & drop your PDF resume into the dropzone. The system will extract your skills, years of experience, and domain.
   - Adjust any screening defaults (e.g. Expected Salary, Notice Period). Click **Save Changes**.
2. **Platforms Tab**:
   - Connect your **LinkedIn** and **Naukri** sessions. Click "Connect Session" to open a browser window and log in once; your session cookies will be saved for future automated applications.
   - Test out the built-in **Demo Greenhouse Portal** to see the agent in action instantly.
3. **Job Discovery Tab**:
   - Click **Discover Matching Jobs** to pull openings across remote feeds and portals.
   - Inspect the match scores and strengths breakdown for each position.
   - Use **+ Import Custom URL** to add any specific job link.
4. **Monitor & Live Tab**:
   - Set your batch size and execution mode.
   - Click **Start Autonomous Run**.
   - Watch the live terminal stream logs in real-time as the agent navigates forms, fills screening answers, attaches your resume, and submits.
5. **Applications & Reports Tabs**:
   - View your audit trail of applied jobs. Click **View Proof** on any record to inspect the confirmation screenshot and submitted answers.
   - Download the CSV spreadsheet or configure automated email digests.

---

## 🧪 Running Automated Tests
Run the test suite:
```powershell
npm test
```
Or test the full Playwright browser submission pipeline:
```powershell
node tests/test_automation_flow.js
```
