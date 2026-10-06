const aiService = require('../../services/aiService');

/**
 * Base Application Adapter Interface
 */
class BaseAdapter {
    constructor(platformName) {
        this.platformName = platformName;
    }

    /**
     * Helper to humanize typing with slight random delays
     */
    async humanType(page, selector, text) {
        if (!text) return;
        try {
            await page.waitForSelector(selector, { timeout: 3000 });
            await page.focus(selector);
            await page.fill(selector, '');
            for (const char of String(text)) {
                await page.type(selector, char, { delay: Math.floor(Math.random() * 20) + 15 });
            }
        } catch (e) {
            // Fallback direct fill
            await page.fill(selector, String(text)).catch(() => {});
        }
    }

    /**
     * Upload candidate resume file to any visible file input
     */
    async uploadResume(page, fileInputSelector, resumePath) {
        if (!resumePath) return false;
        try {
            const input = await page.$(fileInputSelector);
            if (input) {
                await input.setInputFiles(resumePath);
                await page.waitForTimeout(1000);
                return true;
            }
        } catch (err) {
            console.warn(`[${this.platformName}] Resume upload failed:`, err.message);
        }
        return false;
    }

    /**
     * Resolve answer for custom questions
     */
    async resolveQuestionAnswer(questionLabel, profile, job) {
        return await aiService.answerQuestion(questionLabel, profile, job);
    }
}

module.exports = BaseAdapter;
