/**
 * ApplyPilot AI — Frontend Application Controller
 */

document.addEventListener('DOMContentLoaded', () => {
    let currentProfile = {};
    let currentSkills = [];

    // Initialize application
    initTabs();
    initSSE();
    loadProfile();
    loadStats();
    loadJobs();
    loadApplications();
    checkPlatformSessions();
    bindEvents();

    // ==========================================
    // 1. Navigation Tabs
    // ==========================================
    function initTabs() {
        const tabs = document.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.getAttribute('data-tab');
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

                tab.classList.add('active');
                const targetPane = document.getElementById(targetId);
                if (targetPane) targetPane.classList.add('active');

                // Auto refresh relevant tab content
                if (targetId === 'tab-jobs') loadJobs();
                if (targetId === 'tab-applications') loadApplications();
                if (targetId === 'tab-dashboard') { loadStats(); checkAgentStatus(); }
                if (targetId === 'tab-platforms') checkPlatformSessions();
            });
        });
    }

    // ==========================================
    // 2. Real-time Agent Stream (SSE)
    // ==========================================
    function initSSE() {
        const terminal = document.getElementById('terminal-logs');
        let retryMs = 1000;

        function connect() {
            const evtSource = new EventSource('/api/agent/stream');

            evtSource.onmessage = (event) => {
                retryMs = 1000; // reset on successful message
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'log') {
                        appendTerminalLog(data.payload);
                    } else if (data.type === 'state') {
                        updateAgentStateUI(data.payload);
                    }
                } catch (err) {
                    console.warn('SSE parse error:', err);
                }
            };

            evtSource.onerror = () => {
                evtSource.close();
                retryMs = Math.min(retryMs * 2, 30000);
                setTimeout(connect, retryMs);
            };
        }
        connect();
    }

    function appendTerminalLog(log) {
        const terminal = document.getElementById('terminal-logs');
        const div = document.createElement('div');
        div.className = `log-entry log-${log.type || 'info'}`;
        div.innerHTML = `
            <span class="log-time">[${log.timestamp || new Date().toLocaleTimeString()}]</span>
            <span class="log-text">${escapeHtml(log.message)}</span>
        `;
        terminal.appendChild(div);
        terminal.scrollTop = terminal.scrollHeight;
    }

    function updateAgentStateUI(state) {
        const pill = document.getElementById('agent-status-pill');
        const label = document.getElementById('agent-status-text');
        const btnStart = document.getElementById('btn-start-run');
        const btnPause = document.getElementById('btn-pause-run');
        const btnResume = document.getElementById('btn-resume-run');
        const btnStop = document.getElementById('btn-stop-run');

        pill.className = 'agent-beacon-pill ' + state.status;
        label.textContent = `AGENT ${state.status.toUpperCase()}`;

        if (state.status === 'running') {
            btnStart.disabled = true;
            btnPause.disabled = false;
            btnResume.disabled = true;
            btnStop.disabled = false;
        } else if (state.status === 'paused') {
            btnStart.disabled = true;
            btnPause.disabled = true;
            btnResume.disabled = false;
            btnStop.disabled = false;
        } else {
            // Idle or stopped
            btnStart.disabled = false;
            btnPause.disabled = true;
            btnResume.disabled = true;
            btnStop.disabled = true;
        }

        // Render current job
        renderCurrentJob(state.currentJob);
        loadStats();
    }

    function renderCurrentJob(job) {
        const container = document.getElementById('active-job-details');
        const platformBadge = document.getElementById('current-platform-badge');

        if (!job) {
            container.className = 'active-job-empty';
            container.innerHTML = `
                <div class="empty-animation-ring"></div>
                <p>No job currently active. Press <strong>Start Autonomous Run</strong> to begin processing the application queue.</p>
            `;
            platformBadge.textContent = 'IDLE';
            platformBadge.className = 'badge badge-platform';
            return;
        }

        platformBadge.textContent = (job.platform || 'WEB').toUpperCase();
        platformBadge.className = 'badge badge-success';

        container.className = 'active-job-filled';
        container.innerHTML = `
            <h4>${escapeHtml(job.title)}</h4>
            <div class="active-job-company">🏢 ${escapeHtml(job.company)} &bull; ${escapeHtml(job.location || 'Remote')}</div>
            <div style="margin: 10px 0;">
                <span class="active-score-badge">🎯 ${job.match_score}% Match Score</span>
            </div>
            <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 8px;">
                <strong>Applying via:</strong> ${job.platform.toUpperCase()} automation adapter
            </div>
            <div style="margin-top: 10px;">
                <a href="${escapeHtml(job.url)}" target="_blank" style="color: #38bdf8; font-size: 0.78rem; text-decoration: none;">View Source Listing &rarr;</a>
            </div>
        `;
    }

    // ==========================================
    // 3. Candidate Profile & Resume Intelligence
    // ==========================================
    async function loadProfile() {
        try {
            const prof = await API.getProfile();
            currentProfile = prof;

            document.getElementById('prof-name').value = prof.full_name || '';
            document.getElementById('prof-email').value = prof.email || '';
            document.getElementById('prof-phone').value = prof.phone || '';
            document.getElementById('prof-location').value = prof.location || '';
            document.getElementById('prof-domain').value = prof.domain || 'Full Stack Developer';
            document.getElementById('prof-exp').value = prof.experience_years || 3;
            document.getElementById('prof-linkedin').value = prof.linkedin_url || '';
            document.getElementById('prof-github').value = prof.github_url || '';
            document.getElementById('prof-portfolio').value = prof.portfolio_url || '';
            document.getElementById('prof-threshold').value = prof.auto_apply_threshold || 75;
            document.getElementById('profile-summary').value = prof.summary || '';
            document.getElementById('headed-toggle').checked = !Boolean(prof.headless_mode);

            if (prof.resume_filename) {
                document.getElementById('uploaded-filename').textContent = `✓ Uploaded: ${prof.resume_filename}`;
            }

            // Screening answers
            const screen = prof.screening_answers || {};
            if (screen.authorized) document.getElementById('screen-authorized').value = screen.authorized;
            if (screen.sponsorship) document.getElementById('screen-sponsorship').value = screen.sponsorship;
            if (screen.notice_period) document.getElementById('screen-notice').value = screen.notice_period;
            if (screen.expected_salary) document.getElementById('screen-salary').value = screen.expected_salary;

            // Skills tags
            currentSkills = Array.isArray(prof.skills) ? [...prof.skills] : [];
            renderSkillsTags();
        } catch (err) {
            console.error('Failed to load profile:', err);
        }
    }

    function renderSkillsTags() {
        const container = document.getElementById('skills-tag-cloud');
        container.innerHTML = '';
        currentSkills.forEach((skill, idx) => {
            const span = document.createElement('span');
            span.className = 'skill-tag';
            span.innerHTML = `
                ${escapeHtml(skill)}
                <span class="skill-tag-remove" data-idx="${idx}">&times;</span>
            `;
            container.appendChild(span);
        });

        container.querySelectorAll('.skill-tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-idx'));
                currentSkills.splice(idx, 1);
                renderSkillsTags();
            });
        });
    }

    // ==========================================
    // 4. Job Discovery & Listings
    // ==========================================
    async function loadJobs() {
        const container = document.getElementById('jobs-container');
        const keyword = document.getElementById('filter-job-keyword').value;
        const platform = document.getElementById('filter-platform').value;
        const minScore = document.getElementById('filter-score').value;

        try {
            const jobs = await API.getJobs({ platform, minScore });
            const filtered = jobs.filter(j => {
                if (!keyword) return true;
                const kw = keyword.toLowerCase();
                return (j.title || '').toLowerCase().includes(kw) || (j.company || '').toLowerCase().includes(kw);
            });

            if (filtered.length === 0) {
                container.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 48px; background: rgba(0,0,0,0.2); border-radius: 12px;">
                        <h3>No jobs match current filter criteria</h3>
                        <p style="color: #94a3b8; margin: 8px 0 16px 0;">Click below to discover new openings across LinkedIn, Naukri, Greenhouse, Lever, and remote boards.</p>
                        <button class="btn btn-primary" id="btn-empty-discover">Discover Jobs Now</button>
                    </div>
                `;
                document.getElementById('btn-empty-discover')?.addEventListener('click', triggerDiscovery);
                return;
            }

            container.innerHTML = filtered.map(job => {
                const scoreClass = job.match_score >= 80 ? 'score-high' : job.match_score >= 65 ? 'score-mid' : 'score-low';
                const reasonsList = (job.match_reasons || []).slice(0, 3).map(r => `<div>&bull; ${escapeHtml(r)}</div>`).join('');

                return `
                    <div class="job-card">
                        <div>
                            <div class="job-card-top">
                                <div>
                                    <div class="job-card-title">${escapeHtml(job.title)}</div>
                                    <div class="job-card-company">${escapeHtml(job.company)}</div>
                                </div>
                                <span class="score-badge ${scoreClass}">${job.match_score}% Match</span>
                            </div>

                            <div class="job-card-meta">
                                <span>📍 ${escapeHtml(job.location || 'Remote')}</span>
                                <span>💰 ${escapeHtml(job.salary || 'Competitive')}</span>
                                <span class="badge badge-platform">${job.platform.toUpperCase()}</span>
                            </div>

                            <div class="job-card-reasons">
                                ${reasonsList || '<div>&bull; Compatible domain & experience requirements</div>'}
                            </div>
                        </div>

                        <div class="job-card-actions">
                            <a href="${escapeHtml(job.url)}" target="_blank" style="color: #94a3b8; font-size: 0.75rem; text-decoration: none;">View Posting &rarr;</a>
                            <span class="badge ${job.status === 'applied' ? 'badge-success' : job.status === 'queued' ? 'badge-warning' : 'badge-neutral'}">
                                ${job.status.toUpperCase()}
                            </span>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('Failed to load jobs:', err);
        }
    }

    async function triggerDiscovery() {
        const btn = document.getElementById('btn-trigger-discovery');
        const origText = btn ? btn.innerHTML : 'Discover Matching Jobs';
        if (btn) {
            btn.innerHTML = 'Scanning Boards...';
            btn.disabled = true;
        }

        try {
            const domain = document.getElementById('prof-domain').value;
            const res = await API.discoverJobs(domain);

            if (res.warnings && res.warnings.length > 0) {
                res.warnings.forEach(warn => {
                    appendTerminalLog({
                        type: 'warn',
                        message: `Discovery feed advisory: ${warn}`
                    });
                });
            }

            if (res.count > 0) {
                appendTerminalLog({
                    type: 'success',
                    message: `Discovered and scored ${res.count} new jobs across platforms (${res.alreadyExisting || 0} already in queue).`
                });
            } else if (res.alreadyExisting > 0) {
                appendTerminalLog({
                    type: 'info',
                    message: `Discovery scan complete: All ${res.alreadyExisting} matched jobs are already present in your queue.`
                });
            } else {
                appendTerminalLog({
                    type: 'info',
                    message: `No new jobs found matching domain "${domain}". Try updating target domain or skills.`
                });
            }

            await loadJobs();
            await loadStats();
        } catch (err) {
            appendTerminalLog({
                type: 'error',
                message: `Failed to discover jobs: ${err.message}`
            });
            alert('Failed to discover jobs: ' + err.message);
        } finally {
            if (btn) {
                btn.innerHTML = origText;
                btn.disabled = false;
            }
        }
    }

    // ==========================================
    // 5. Applications Table & Proof Modal
    // ==========================================
    async function loadApplications() {
        const tbody = document.getElementById('applications-table-body');
        const status = document.getElementById('history-filter-status').value;

        try {
            const apps = await API.getApplications({ status });
            if (apps.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #94a3b8;">No applications found. Run the agent to apply automatically.</td></tr>`;
                return;
            }

            tbody.innerHTML = apps.map((app, index) => {
                const statusBadge = app.status === 'applied' 
                    ? '<span class="badge badge-success">APPLIED</span>' 
                    : app.status === 'review_needed' 
                    ? '<span class="badge badge-warning">REVIEW</span>' 
                    : '<span class="badge badge-danger">FAILED</span>';

                return `
                    <tr>
                        <td style="font-weight: 600; color: #f8fafc;">${escapeHtml(app.company)}</td>
                        <td>${escapeHtml(app.title)}</td>
                        <td><span class="badge badge-platform">${app.platform.toUpperCase()}</span></td>
                        <td style="font-weight: bold; color: #38bdf8;">${app.match_score}%</td>
                        <td>${statusBadge}</td>
                        <td style="font-size: 0.78rem; color: #94a3b8;">${new Date(app.applied_at).toLocaleString()}</td>
                        <td>
                            <button class="btn btn-sm btn-outline btn-view-proof" data-app-idx="${index}">
                                View Proof
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            // Bind proof buttons - use index reference instead of inline JSON
            tbody.querySelectorAll('.btn-view-proof').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.getAttribute('data-app-idx'));
                    openProofModal(apps[idx]);
                });
            });

            // Update stats
            document.getElementById('rep-total').textContent = apps.length;
            const successCount = apps.filter(a => a.status === 'applied').length;
            const rate = apps.length > 0 ? Math.round((successCount / apps.length) * 100) : 100;
            document.getElementById('rep-rate').textContent = `${rate}%`;

            // Calculate actual average match score
            const avgScore = apps.length > 0 
                ? Math.round(apps.reduce((sum, a) => sum + (a.match_score || 0), 0) / apps.length)
                : 0;
            document.getElementById('rep-avg-score').textContent = `${avgScore}%`;
        } catch (err) {
            console.error('Failed to load applications:', err);
        }
    }

    function openProofModal(app) {
        const modal = document.getElementById('proof-modal');
        document.getElementById('modal-proof-title').textContent = `${app.company} — ${app.title}`;

        document.getElementById('modal-proof-meta').innerHTML = `
            <div style="font-size: 0.85rem; margin-bottom: 12px; color: #cbd5e1;">
                <strong>Platform:</strong> ${app.platform.toUpperCase()} &bull;
                <strong>Match Score:</strong> ${app.match_score}% &bull;
                <strong>Status:</strong> ${app.status.toUpperCase()} &bull;
                <strong>Notes:</strong> ${escapeHtml(app.notes || 'None')} &bull;
                <a href="${escapeHtml(app.url)}" target="_blank" style="color: #38bdf8;">Original Listing</a>
            </div>
        `;

        const shotWrap = document.getElementById('modal-screenshot-wrap');
        if (app.screenshot_path) {
            shotWrap.innerHTML = `<img src="${app.screenshot_path}" alt="Application Screenshot Evidence" style="max-width: 100%; border-radius: 6px;">`;
        } else {
            shotWrap.innerHTML = `<p style="color: #94a3b8; font-size: 0.82rem;">No screenshot captured for this application.</p>`;
        }

        document.getElementById('modal-answers-json').textContent = JSON.stringify(app.answers_log, null, 2);
        modal.hidden = false;
    }

    // ==========================================
    // 6. Metrics & Platform Sessions
    // ==========================================
    async function loadStats() {
        try {
            const stats = await API.getStats();
            document.getElementById('stat-discovered').textContent = stats.totalDiscovered;
            document.getElementById('stat-applied').textContent = stats.totalApplied;
            document.getElementById('stat-high-match').textContent = stats.highMatch;
            document.getElementById('stat-queued').textContent = stats.totalQueued;
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    }

    async function checkPlatformSessions() {
        try {
            const ln = await API.getPlatformSession('linkedin');
            const nk = await API.getPlatformSession('naukri');
            const ind = await API.getPlatformSession('indeed');

            const lnBadge = document.getElementById('linkedin-status-badge');
            if (ln.connected) {
                lnBadge.textContent = 'Connected (Cookies Active)';
                lnBadge.className = 'badge badge-success';
            } else {
                lnBadge.textContent = 'Not Connected';
                lnBadge.className = 'badge badge-neutral';
            }

            const nkBadge = document.getElementById('naukri-status-badge');
            if (nk.connected) {
                nkBadge.textContent = 'Connected (Cookies Active)';
                nkBadge.className = 'badge badge-success';
            } else {
                nkBadge.textContent = 'Not Connected';
                nkBadge.className = 'badge badge-neutral';
            }

            const indBadge = document.getElementById('indeed-status-badge');
            if (ind && ind.connected) {
                indBadge.textContent = 'Connected (Cookies Active)';
                indBadge.className = 'badge badge-success';
            } else {
                indBadge.textContent = 'Not Connected';
                indBadge.className = 'badge badge-neutral';
            }
        } catch (err) {}
    }

    async function checkAgentStatus() {
        try {
            const st = await API.getAgentStatus();
            updateAgentStateUI(st);
        } catch (err) {}
    }

    // ==========================================
    // 7. Event Handlers & Bindings
    // ==========================================
    function bindEvents() {
        // Agent controls
        document.getElementById('btn-start-run').addEventListener('click', async () => {
            const limit = parseInt(document.getElementById('batch-limit-input').value) || 10;
            const mode = document.getElementById('execution-mode-select').value;
            const reviewOnly = mode === 'review_first';

            try {
                await API.startAgent(limit, reviewOnly);
            } catch (err) {
                alert(err.message);
            }
        });

        document.getElementById('btn-pause-run').addEventListener('click', () => API.pauseAgent());
        document.getElementById('btn-resume-run').addEventListener('click', () => API.resumeAgent());
        document.getElementById('btn-stop-run').addEventListener('click', () => API.stopAgent());
        document.getElementById('btn-quick-discover').addEventListener('click', triggerDiscovery);
        document.getElementById('btn-trigger-discovery').addEventListener('click', triggerDiscovery);

        document.getElementById('btn-clear-logs').addEventListener('click', () => {
            document.getElementById('terminal-logs').innerHTML = '';
        });

        // Filter events
        document.getElementById('filter-job-keyword').addEventListener('input', loadJobs);
        document.getElementById('filter-platform').addEventListener('change', loadJobs);
        document.getElementById('filter-score').addEventListener('change', loadJobs);
        document.getElementById('history-filter-status').addEventListener('change', loadApplications);

        // Resume Drag & Drop
        const dropzone = document.getElementById('resume-dropzone');
        const fileInput = document.getElementById('resume-file-input');

        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = '#38bdf8'; });
        dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'rgba(56, 189, 248, 0.3)'; });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'rgba(56, 189, 248, 0.3)';
            if (e.dataTransfer.files.length > 0) {
                handleResumeUpload(e.dataTransfer.files[0]);
            }
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleResumeUpload(e.target.files[0]);
            }
        });

        // Skills Input
        const skillsInput = document.getElementById('prof-skills-input');
        skillsInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = skillsInput.value.replace(/,/g, '').trim();
                if (val && !currentSkills.includes(val)) {
                    currentSkills.push(val);
                    renderSkillsTags();
                }
                skillsInput.value = '';
            }
        });

        // Save Profile
        document.getElementById('btn-save-profile').addEventListener('click', async () => {
            const updated = {
                full_name: document.getElementById('prof-name').value,
                email: document.getElementById('prof-email').value,
                phone: document.getElementById('prof-phone').value,
                location: document.getElementById('prof-location').value,
                domain: document.getElementById('prof-domain').value,
                experience_years: parseFloat(document.getElementById('prof-exp').value) || 0,
                linkedin_url: document.getElementById('prof-linkedin').value,
                github_url: document.getElementById('prof-github').value,
                portfolio_url: document.getElementById('prof-portfolio').value,
                auto_apply_threshold: parseInt(document.getElementById('prof-threshold').value) || 75,
                summary: document.getElementById('profile-summary').value,
                headless_mode: document.getElementById('headed-toggle').checked ? 0 : 1,
                skills: currentSkills,
                screening_answers: {
                    authorized: document.getElementById('screen-authorized').value,
                    sponsorship: document.getElementById('screen-sponsorship').value,
                    notice_period: document.getElementById('screen-notice').value,
                    expected_salary: document.getElementById('screen-salary').value
                }
            };

            try {
                await API.saveProfile(updated);
                alert('✓ Candidate profile updated successfully!');
            } catch (err) {
                alert('Failed to save profile: ' + err.message);
            }
        });

        // Helper to poll platform connection state after launch
        let platformPollInterval = null;
        function startPlatformStatusPolling() {
            if (platformPollInterval) clearInterval(platformPollInterval);
            let attempts = 0;
            platformPollInterval = setInterval(async () => {
                attempts++;
                await loadPlatformStatuses();
                if (attempts >= 40) {
                    clearInterval(platformPollInterval);
                    platformPollInterval = null;
                }
            }, 3000);
        }

        // Platform login helpers
        document.getElementById('btn-login-linkedin').addEventListener('click', async () => {
            alert('Opening LinkedIn in browser preview. Please log in to your account. Your session cookies will be captured automatically once authenticated.');
            await API.launchLogin('linkedin');
            startPlatformStatusPolling();
        });

        document.getElementById('btn-login-naukri').addEventListener('click', async () => {
            alert('Opening Naukri in browser preview. Please log in to your account. Your session cookies will be captured automatically once authenticated.');
            await API.launchLogin('naukri');
            startPlatformStatusPolling();
        });

        document.getElementById('btn-login-indeed').addEventListener('click', async () => {
            alert('Opening Indeed in browser preview. Please log in to your account. Your session cookies will be captured automatically once authenticated.');
            await API.launchLogin('indeed');
            startPlatformStatusPolling();
        });

        // Test mock Greenhouse portal button
        document.getElementById('btn-test-mock-greenhouse').addEventListener('click', async () => {
            await API.importJob({
                title: 'Senior Full Stack Engineer',
                company: 'Stripe Ecosystem (Test Portal)',
                url: `http://localhost:${window.location.port || 3000}/mock/greenhouse`,
                platform: 'greenhouse',
                description: 'Full stack TypeScript and React engineering position.'
            });
            alert('Added Demo Greenhouse Portal to queue! Press "Start Autonomous Run" to watch the agent fill and submit it.');
            document.getElementById('nav-dashboard').click();
        });

        // Modal triggers
        document.getElementById('btn-close-modal').addEventListener('click', () => {
            document.getElementById('proof-modal').hidden = true;
        });

        document.getElementById('btn-open-import-modal').addEventListener('click', () => {
            document.getElementById('import-modal').hidden = false;
        });
        document.getElementById('btn-close-import-modal').addEventListener('click', () => {
            document.getElementById('import-modal').hidden = true;
        });

        // Custom Job Import Form
        document.getElementById('import-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const jobData = {
                company: document.getElementById('imp-company').value,
                title: document.getElementById('imp-title').value,
                url: document.getElementById('imp-url').value,
                platform: document.getElementById('imp-platform').value
            };

            try {
                await API.importJob(jobData);
                document.getElementById('import-modal').hidden = true;
                alert('✓ Job imported into application queue!');
                loadJobs();
                loadStats();
            } catch (err) {
                alert('Failed to import job: ' + err.message);
            }
        });

        // Send Test Report Email
        document.getElementById('btn-send-test-report').addEventListener('click', async () => {
            const recipient = document.getElementById('email-recipient').value;
            if (!recipient) {
                alert('Please enter a recipient email address.');
                return;
            }

            const emailConfig = {
                enabled: true,
                smtpHost: document.getElementById('email-smtp-host').value,
                smtpPort: document.getElementById('email-smtp-port').value,
                smtpUser: document.getElementById('email-smtp-user').value,
                smtpPass: document.getElementById('email-smtp-pass').value,
                recipientEmail: recipient
            };

            const btn = document.getElementById('btn-send-test-report');
            btn.textContent = 'Sending email...';
            btn.disabled = true;

            try {
                const res = await API.sendEmailReport(emailConfig);
                if (res.success) {
                    alert('✓ Test report email sent successfully!');
                } else {
                    alert('Email notice: ' + (res.message || 'SMTP credentials needed'));
                }
            } catch (err) {
                alert('Email delivery error: ' + err.message);
            } finally {
                btn.textContent = 'Send Test Report Email';
                btn.disabled = false;
            }
        });
    }

    async function handleResumeUpload(file) {
        const formData = new FormData();
        formData.append('resume', file);

        const statusLabel = document.getElementById('uploaded-filename');
        statusLabel.textContent = `Analyzing ${file.name} with AI...`;

        try {
            const res = await API.uploadResume(formData);
            if (res.success) {
                statusLabel.textContent = `✓ Uploaded & Parsed: ${file.name}`;
                appendTerminalLog({
                    type: 'success',
                    message: `Resume parsed: Detected domain "${res.profile.domain}", ${res.profile.experience_years} years experience, ${res.profile.skills.length} skills.`
                });
                await loadProfile();
            } else {
                statusLabel.textContent = 'Upload failed';
            }
        } catch (err) {
            statusLabel.textContent = 'Upload error: ' + err.message;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
});
