const { DOMAIN_KEYWORDS, TECH_SKILLS } = require('./resumeParser');

/**
 * Evaluates candidate profile vs job listing
 * @param {Object} profile - Candidate profile
 * @param {Object} job - Job description and metadata
 * @returns {Object} { score: number, reasons: Array<string>, eligible: boolean, minExperience: number }
 */
function evaluateJobMatch(profile, job) {
    let score = 0;
    const reasons = [];
    const jobText = `${job.title} ${job.description} ${job.location || ''}`.toLowerCase();
    const candidateDomain = (profile.domain || 'Full Stack Developer').toLowerCase();

    // 1. Domain & Title Match (Weight: 35)
    let domainScore = 0;
    const titleLower = (job.title || '').toLowerCase();

    // Direct domain keywords check
    const domainKeywords = DOMAIN_KEYWORDS[profile.domain] || ['software', 'developer', 'engineer'];
    let domainMatches = 0;
    for (const kw of domainKeywords) {
        if (titleLower.includes(kw)) domainMatches += 2;
        else if (jobText.includes(kw)) domainMatches += 0.5;
    }

    if (domainMatches >= 2) {
        domainScore = 35;
        reasons.push(`Strong domain match: Title aligns with "${profile.domain}"`);
    } else if (domainMatches > 0) {
        domainScore = 24;
        reasons.push(`Moderate domain match for "${profile.domain}"`);
    } else if (titleLower.includes('developer') || titleLower.includes('engineer')) {
        domainScore = 15;
        reasons.push('General engineering role match');
    } else {
        domainScore = 5;
    }
    score += domainScore;

    // 2. Years of Experience Check (Weight: 25)
    const minExp = extractExperienceRequirement(jobText);
    const candidateExp = Number(profile.experience_years) || 0;
    let expScore = 0;

    if (minExp === 0) {
        // No strict experience requirement detected
        expScore = 20;
        reasons.push('Open experience requirements');
    } else if (candidateExp >= minExp) {
        if (candidateExp <= minExp + 3) {
            // Sweet spot
            expScore = 25;
            reasons.push(`Experience match: Requires ~${minExp} yrs (Candidate has ${candidateExp} yrs)`);
        } else {
            // Overqualified slightly, but still good
            expScore = 20;
            reasons.push(`Candidate experience (${candidateExp} yrs) exceeds requirement (${minExp} yrs)`);
        }
    } else {
        // Candidate has fewer years
        const diff = minExp - candidateExp;
        if (diff <= 1.5) {
            expScore = 14;
            reasons.push(`Near experience requirement (Requires ${minExp} yrs, candidate has ${candidateExp} yrs)`);
        } else {
            expScore = 5;
            reasons.push(`High experience requirement (Requires ${minExp} yrs vs candidate's ${candidateExp} yrs)`);
        }
    }
    score += expScore;

    // 3. Technical Skills Overlap (Weight: 30)
    const candidateSkills = Array.isArray(profile.skills) ? profile.skills : [];
    const matchedSkills = [];

    for (const skill of candidateSkills) {
        const regex = new RegExp(`\\b${skill.toLowerCase().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        if (regex.test(jobText)) {
            matchedSkills.push(skill);
        }
    }

    const skillRatio = candidateSkills.length > 0 ? (matchedSkills.length / Math.min(candidateSkills.length, 6)) : 0;
    const skillScore = Math.min(30, Math.round(skillRatio * 30));
    score += skillScore;

    if (matchedSkills.length > 0) {
        reasons.push(`Matches ${matchedSkills.length} key skills: ${matchedSkills.slice(0, 5).join(', ')}`);
    }

    // 4. Location / Remote Preference (Weight: 10)
    let locScore = 5; // default neutral
    const isRemote = jobText.includes('remote') || (job.location || '').toLowerCase().includes('remote');
    const candLocation = (profile.location || '').toLowerCase();

    if (isRemote) {
        locScore = 10;
        reasons.push('Remote flexibility aligns with candidate preferences');
    } else if (candLocation && (job.location || '').toLowerCase().includes(candLocation.split('/')[0].trim().toLowerCase())) {
        locScore = 10;
        reasons.push(`Location matches candidate profile (${job.location})`);
    } else {
        locScore = 7;
    }
    score += locScore;

    // Final normalization
    const finalScore = Math.max(10, Math.min(100, Math.round(score)));
    const threshold = Number(profile.auto_apply_threshold) || 75;

    return {
        score: finalScore,
        reasons,
        matchedSkills,
        minExperience: minExp,
        eligible: finalScore >= threshold
    };
}

/**
 * Extracts required years of experience from job text
 */
function extractExperienceRequirement(text) {
    const patterns = [
        /(\d+)\s*[-+to]?\s*(?:\d+)?\s*(?:years?|yrs?)(?:\s*(?:of)?\s*(?:relevant|practical|professional)?\s*experience)/i,
        /minimum\s*(?:of)?\s*(\d+)\s*(?:years?|yrs?)/i,
        /at least\s*(\d+)\s*(?:years?|yrs?)/i,
        /(\d+)\+\s*(?:years?|yrs?)/i
    ];

    for (const pat of patterns) {
        const match = text.match(pat);
        if (match && match[1]) {
            const num = parseFloat(match[1]);
            if (num > 0 && num <= 20) return num;
        }
    }

    if (text.includes('senior') || text.includes('lead') || text.includes('staff')) return 5;
    if (text.includes('junior') || text.includes('entry level') || text.includes('intern')) return 0;

    return 2; // general default
}

module.exports = {
    evaluateJobMatch,
    extractExperienceRequirement
};
