const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { getApplications, getStats, db } = require('../database/db');

class ReportService {
    constructor() {
        this.reportsDir = path.join(__dirname, '..', 'reports');
        if (!fs.existsSync(this.reportsDir)) {
            fs.mkdirSync(this.reportsDir, { recursive: true });
        }
    }

    /**
     * Generates CSV report of all applications or filtered by status
     */
    generateCSV(status = null) {
        const applications = getApplications(status ? { status } : {});
        const headers = ['ID', 'Date Applied', 'Company', 'Title', 'Platform', 'Match Score', 'Status', 'URL', 'Proof Screenshot', 'Notes'];

        const rows = applications.map(app => [
            `"${app.id}"`,
            `"${app.applied_at}"`,
            `"${(app.company || '').replace(/"/g, '""')}"`,
            `"${(app.title || '').replace(/"/g, '""')}"`,
            `"${app.platform}"`,
            `"${app.match_score}%"`,
            `"${app.status}"`,
            `"${app.url}"`,
            `"${(app.screenshot_path || '').replace(/"/g, '""')}"`,
            `"${(app.notes || '').replace(/"/g, '""')}"`
        ]);

        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    /**
     * Generates a rich HTML report summary
     */
    generateHTMLSummary(period = 'Recent Applications') {
        const apps = getApplications({ limit: 50 });
        const stats = getStats();
        const appliedCount = apps.filter(a => a.status === 'applied').length;
        const failedCount = apps.filter(a => a.status === 'failed').length;

        const tableRows = apps.map(app => `
            <tr style="border-bottom: 1px solid #2d3748;">
                <td style="padding: 10px 14px; font-weight: 600; color: #e2e8f0;">${escapeHtml(app.company)}</td>
                <td style="padding: 10px 14px; color: #cbd5e0;">${escapeHtml(app.title)}</td>
                <td style="padding: 10px 14px;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background: #3182ce; color: #fff; text-transform: uppercase;">
                        ${escapeHtml(app.platform)}
                    </span>
                </td>
                <td style="padding: 10px 14px; color: #38bdf8; font-weight: bold;">${app.match_score}%</td>
                <td style="padding: 10px 14px;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background: ${app.status === 'applied' ? '#22c55e' : '#ef4444'}; color: #fff;">
                        ${app.status.toUpperCase()}
                    </span>
                </td>
                <td style="padding: 10px 14px; color: #94a3b8; font-size: 12px;">${app.applied_at}</td>
                <td style="padding: 10px 14px;">
                    <a href="${escapeHtml(app.url)}" target="_blank" style="color: #60a5fa; text-decoration: none; font-size: 12px;">View Job &rarr;</a>
                </td>
            </tr>
        `).join('');

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>ApplyPilot AI Application Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; margin: 0;">
    <div style="max-width: 900px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 28px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155;">
        <div style="border-bottom: 1px solid #334155; padding-bottom: 18px; margin-bottom: 24px;">
            <h1 style="margin: 0 0 6px 0; color: #38bdf8; font-size: 24px; display: flex; align-items: center; gap: 8px;">
                🚀 ApplyPilot AI — Job Application Report
            </h1>
            <p style="margin: 0; color: #94a3b8; font-size: 14px;">Generated on: ${new Date().toLocaleString()} | Period: ${period}</p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px;">
            <div style="background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155; text-align: center;">
                <div style="color: #94a3b8; font-size: 12px; text-transform: uppercase;">Total Discovered</div>
                <div style="color: #e2e8f0; font-size: 22px; font-weight: bold; margin-top: 4px;">${stats.totalDiscovered}</div>
            </div>
            <div style="background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155; text-align: center;">
                <div style="color: #94a3b8; font-size: 12px; text-transform: uppercase;">Successfully Applied</div>
                <div style="color: #4ade80; font-size: 22px; font-weight: bold; margin-top: 4px;">${stats.totalApplied}</div>
            </div>
            <div style="background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155; text-align: center;">
                <div style="color: #94a3b8; font-size: 12px; text-transform: uppercase;">High Match (&gt;80%)</div>
                <div style="color: #38bdf8; font-size: 22px; font-weight: bold; margin-top: 4px;">${stats.highMatch}</div>
            </div>
            <div style="background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155; text-align: center;">
                <div style="color: #94a3b8; font-size: 12px; text-transform: uppercase;">Queued / Pending</div>
                <div style="color: #facc15; font-size: 22px; font-weight: bold; margin-top: 4px;">${stats.totalQueued}</div>
            </div>
        </div>

        <h3 style="color: #e2e8f0; margin-bottom: 12px; font-size: 16px;">Application Activity</h3>
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                    <tr style="background: #0f172a; color: #94a3b8; text-transform: uppercase; font-size: 11px;">
                        <th style="padding: 10px 14px;">Company</th>
                        <th style="padding: 10px 14px;">Role</th>
                        <th style="padding: 10px 14px;">Platform</th>
                        <th style="padding: 10px 14px;">Fit Score</th>
                        <th style="padding: 10px 14px;">Status</th>
                        <th style="padding: 10px 14px;">Timestamp</th>
                        <th style="padding: 10px 14px;">Listing</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows || '<tr><td colspan="7" style="padding: 18px; text-align: center; color: #94a3b8;">No applications recorded yet.</td></tr>'}
                </tbody>
            </table>
        </div>

        <div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #334155; text-align: center; color: #64748b; font-size: 12px;">
            ApplyPilot AI Autonomous Job Agent &bull; Powered by Playwright Browser Automation &bull; Antigravity
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Sends email report via nodemailer if SMTP is configured
     */
    async sendEmailReport(emailConfig, period = 'Daily Summary') {
        if (!emailConfig || !emailConfig.enabled || !emailConfig.smtpUser || !emailConfig.recipientEmail) {
            return { success: false, message: 'SMTP not configured or disabled' };
        }

        const transporter = nodemailer.createTransport({
            host: emailConfig.smtpHost || 'smtp.gmail.com',
            port: Number(emailConfig.smtpPort) || 587,
            secure: Number(emailConfig.smtpPort) === 465,
            auth: {
                user: emailConfig.smtpUser,
                pass: emailConfig.smtpPass
            }
        });

        const html = this.generateHTMLSummary(period);
        const csv = this.generateCSV();

        const mailOptions = {
            from: emailConfig.fromEmail || emailConfig.smtpUser,
            to: emailConfig.recipientEmail,
            subject: `[ApplyPilot AI] Job Application Report - ${new Date().toLocaleDateString()}`,
            html,
            attachments: [
                {
                    filename: `applications-report-${Date.now()}.csv`,
                    content: csv
                }
            ]
        };

        const result = await transporter.sendMail(mailOptions);
        return { success: true, messageId: result.messageId };
    }

    /**
     * Saves snapshot report record to SQLite
     */
    saveReportSnapshot(period = 'daily') {
        const stats = getStats();
        const id = 'rep_' + Date.now();
        const html = this.generateHTMLSummary(period);

        db.prepare(`
            INSERT INTO reports (id, period, total_discovered, total_applied, total_failed, avg_match_score, summary_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            period,
            stats.totalDiscovered,
            stats.totalApplied,
            stats.totalFailed,
            82.5,
            JSON.stringify({ stats, timestamp: new Date().toISOString() })
        );

        return { id, stats };
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

module.exports = new ReportService();
