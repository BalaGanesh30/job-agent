/**
 * ApplyPilot AI — API Client
 */
const API = {
    async getProfile() {
        const res = await fetch('/api/profile');
        return res.json();
    },

    async saveProfile(profileData) {
        const res = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData)
        });
        return res.json();
    },

    async uploadResume(formData) {
        const res = await fetch('/api/profile/upload-resume', {
            method: 'POST',
            body: formData
        });
        return res.json();
    },

    async getJobs(params = {}) {
        const query = new URLSearchParams(params).toString();
        const res = await fetch(`/api/jobs?${query}`);
        return res.json();
    },

    async discoverJobs(domain) {
        const res = await fetch('/api/jobs/discover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain })
        });
        return res.json();
    },

    async importJob(jobData) {
        const res = await fetch('/api/jobs/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jobData)
        });
        return res.json();
    },

    async getAgentStatus() {
        const res = await fetch('/api/agent/status');
        return res.json();
    },

    async startAgent(limit = 10, reviewOnly = false) {
        const res = await fetch('/api/agent/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit, reviewOnly })
        });
        return res.json();
    },

    async pauseAgent() {
        const res = await fetch('/api/agent/pause', { method: 'POST' });
        return res.json();
    },

    async resumeAgent() {
        const res = await fetch('/api/agent/resume', { method: 'POST' });
        return res.json();
    },

    async stopAgent() {
        const res = await fetch('/api/agent/stop', { method: 'POST' });
        return res.json();
    },

    async getApplications(params = {}) {
        const query = new URLSearchParams(params).toString();
        const res = await fetch(`/api/applications?${query}`);
        return res.json();
    },

    async getStats() {
        const res = await fetch('/api/stats');
        return res.json();
    },

    async sendEmailReport(emailConfig) {
        const res = await fetch('/api/reports/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailConfig)
        });
        return res.json();
    },

    async getPlatformSession(platform) {
        const res = await fetch(`/api/sessions/${platform}`);
        return res.json();
    },

    async launchLogin(platform) {
        const res = await fetch('/api/sessions/launch-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform })
        });
        return res.json();
    },

    async savePlatformSession(platform) {
        const res = await fetch('/api/sessions/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform })
        });
        return res.json();
    }
};

window.API = API;
