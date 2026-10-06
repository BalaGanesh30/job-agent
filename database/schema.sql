-- ApplyPilot AI Database Schema

CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    full_name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    location TEXT DEFAULT '',
    linkedin_url TEXT DEFAULT '',
    github_url TEXT DEFAULT '',
    portfolio_url TEXT DEFAULT '',
    domain TEXT DEFAULT 'Full Stack Development',
    experience_years REAL DEFAULT 3.0,
    current_title TEXT DEFAULT '',
    skills TEXT DEFAULT '[]', -- JSON array of strings
    summary TEXT DEFAULT '',
    resume_path TEXT DEFAULT '',
    resume_filename TEXT DEFAULT '',
    resume_text TEXT DEFAULT '',
    screening_answers TEXT DEFAULT '{}', -- JSON object: {"authorized": "Yes", "sponsorship": "No", "notice_period": "Immediate", "expected_salary": "$120,000"}
    auto_apply_threshold INTEGER DEFAULT 75, -- percentage (0-100)
    execution_mode TEXT DEFAULT 'full_auto', -- 'full_auto' or 'review_first'
    headless_mode INTEGER DEFAULT 0, -- 0 for headed (visible browser), 1 for headless
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT DEFAULT '',
    url TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL, -- 'greenhouse', 'lever', 'linkedin', 'naukri', 'remote', 'generic'
    domain TEXT DEFAULT '',
    experience_required TEXT DEFAULT '',
    min_experience REAL DEFAULT 0,
    skills_extracted TEXT DEFAULT '[]', -- JSON array
    salary TEXT DEFAULT '',
    job_type TEXT DEFAULT 'Full-time',
    description TEXT DEFAULT '',
    match_score INTEGER DEFAULT 0,
    match_reasons TEXT DEFAULT '[]', -- JSON array of strengths/matches
    status TEXT DEFAULT 'discovered', -- 'discovered', 'queued', 'applied', 'skipped', 'failed'
    discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    platform TEXT NOT NULL,
    match_score INTEGER DEFAULT 0,
    status TEXT NOT NULL, -- 'applied', 'review_needed', 'failed', 'skipped'
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    screenshot_path TEXT DEFAULT '',
    answers_log TEXT DEFAULT '{}', -- JSON object of answered questions
    error_log TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    FOREIGN KEY(job_id) REFERENCES jobs(id)
);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    period TEXT DEFAULT 'daily',
    total_discovered INTEGER DEFAULT 0,
    total_applied INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    avg_match_score REAL DEFAULT 0,
    summary_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS platform_sessions (
    platform TEXT PRIMARY KEY, -- 'linkedin', 'naukri'
    status TEXT DEFAULT 'disconnected', -- 'connected', 'disconnected', 'expired'
    session_data TEXT DEFAULT '', -- Encrypted or serialized cookies/storageState
    last_verified DATETIME DEFAULT CURRENT_TIMESTAMP
);
