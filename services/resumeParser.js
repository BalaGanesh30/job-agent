const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const DOMAIN_KEYWORDS = {
    'Full Stack Developer': ['full stack', 'fullstack', 'mern', 'mean', 'node.js', 'react', 'express', 'full-stack', 'frontend and backend'],
    'Frontend Developer': ['frontend', 'front-end', 'react', 'vue', 'angular', 'next.js', 'css', 'html', 'tailwind', 'ui/ux', 'javascript'],
    'Backend Developer': ['backend', 'back-end', 'node.js', 'express', 'django', 'fastapi', 'spring boot', 'golang', 'microservices', 'postgresql', 'mongodb'],
    'DevOps / Cloud Engineer': ['devops', 'aws', 'docker', 'kubernetes', 'terraform', 'ci/cd', 'azure', 'gcp', 'jenkins', 'ansible'],
    'Data Scientist / AI Engineer': ['data science', 'machine learning', 'deep learning', 'pytorch', 'tensorflow', 'nlp', 'llm', 'pandas', 'scikit-learn', 'data analyst'],
    'QA / Automation Engineer': ['qa engineer', 'software testing', 'selenium', 'cypress', 'playwright', 'automation testing', 'test automation'],
    'Mobile Developer': ['android', 'ios', 'flutter', 'react native', 'swift', 'kotlin']
};

const TECH_SKILLS = [
    'JavaScript', 'TypeScript', 'Node.js', 'React', 'Vue', 'Angular', 'Next.js', 'Express',
    'Python', 'Django', 'FastAPI', 'Java', 'Spring Boot', 'C++', 'C#', '.NET', 'Go', 'Golang',
    'Rust', 'PHP', 'Laravel', 'Ruby', 'Rails', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB',
    'Redis', 'GraphQL', 'REST APIs', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
    'Terraform', 'CI/CD', 'Git', 'Linux', 'Microservices', 'TailwindCSS', 'CSS3', 'HTML5',
    'Redux', 'Playwright', 'Jest', 'Mocha', 'Kafka', 'RabbitMQ', 'Machine Learning', 'TensorFlow'
];

async function parseResumeFile(filePath) {
    let rawText = '';
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        rawText = data.text || '';
    } else {
        rawText = fs.readFileSync(filePath, 'utf-8');
    }

    return extractProfileFromText(rawText);
}

function extractProfileFromText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Extract Email
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0] : '';

    // Extract Phone
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const phone = phoneMatch ? phoneMatch[0] : '';

    // Extract LinkedIn
    const linkedinMatch = text.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+)/i);
    const linkedin = linkedinMatch ? linkedinMatch[0] : '';

    // Extract GitHub
    const githubMatch = text.match(/(https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9_-]+)/i);
    const github = githubMatch ? githubMatch[0] : '';

    // Extract Portfolio / Personal Website
    const portfolioMatch = text.match(/(https?:\/\/(?:www\.)?(?!linkedin|github)[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/i);
    const portfolio = portfolioMatch ? portfolioMatch[0] : '';

    // Extract Skills
    const lowerText = text.toLowerCase();
    const skills = TECH_SKILLS.filter(skill => {
        const regex = new RegExp(`\\b${skill.toLowerCase().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        return regex.test(lowerText);
    });

    // Detect Domain
    let bestDomain = 'Full Stack Developer';
    let maxDomainScore = 0;
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
        let score = 0;
        for (const kw of keywords) {
            if (lowerText.includes(kw)) score++;
        }
        if (score > maxDomainScore) {
            maxDomainScore = score;
            bestDomain = domain;
        }
    }

    // Estimate Years of Experience
    let years = 3.0; // default baseline
    const expRegex = /(\d+(?:\.\d+)?)\s*(?:\+|plus)?\s*(?:years?|yrs?)(?:\s*of)?\s*(?:experience|exp)/i;
    const expMatch = text.match(expRegex);
    if (expMatch) {
        years = parseFloat(expMatch[1]);
    } else {
        // Try finding year dates like 2018 - 2024 or 2020 - Present
        const yearSpans = text.match(/\b(20\d{2})\s*[-–—to]+\s*(20\d{2}|present|current)\b/gi);
        if (yearSpans && yearSpans.length > 0) {
            let earliestYear = 2026;
            for (const span of yearSpans) {
                const startYearMatch = span.match(/20\d{2}/);
                if (startYearMatch) {
                    const y = parseInt(startYearMatch[0], 10);
                    if (y < earliestYear && y > 1990) earliestYear = y;
                }
            }
            if (earliestYear < 2026) {
                years = Math.max(1, 2026 - earliestYear);
            }
        }
    }

    // Extract Name candidate (first non-empty line usually or near top)
    let candidateName = '';
    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i];
        if (line && line.length < 40 && !line.includes('@') && !line.includes('http') && !line.toLowerCase().includes('resume') && !line.toLowerCase().includes('curriculum')) {
            candidateName = line;
            break;
        }
    }

    // Extract Summary / Bio snippet
    let summary = '';
    const summaryHeaderIndex = lines.findIndex(l => /^(summary|profile|about me|professional summary|objective)/i.test(l));
    if (summaryHeaderIndex !== -1 && summaryHeaderIndex + 1 < lines.length) {
        summary = lines.slice(summaryHeaderIndex + 1, summaryHeaderIndex + 4).join(' ');
    } else {
        summary = `${candidateName || 'Candidate'} is a ${bestDomain} with ${years}+ years of experience specialized in ${skills.slice(0, 5).join(', ')}.`;
    }

    return {
        fullName: candidateName,
        email,
        phone,
        linkedinUrl: linkedin,
        githubUrl: github,
        portfolioUrl: portfolio,
        domain: bestDomain,
        experienceYears: Math.min(years, 30),
        skills,
        summary,
        rawText: text
    };
}

module.exports = {
    parseResumeFile,
    extractProfileFromText,
    DOMAIN_KEYWORDS,
    TECH_SKILLS
};
