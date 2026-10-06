const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

class BrowserManager {
    constructor() {
        this.browser = null;
        this.context = null;
        this.sessionsDir = path.join(__dirname, '..', 'sessions');
        this.screenshotsDir = path.join(__dirname, '..', 'screenshots');

        if (!fs.existsSync(this.sessionsDir)) fs.mkdirSync(this.sessionsDir, { recursive: true });
        if (!fs.existsSync(this.screenshotsDir)) fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }

    /**
     * Initializes browser with stealth settings and optional session state
     */
    async launchBrowser({ headless = false, platform = null } = {}) {
        if (this.browser && this.browser.isConnected()) {
            return { browser: this.browser, context: this.context };
        }

        const args = [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-size=1280,800'
        ];

        this.browser = await chromium.launch({
            headless: Boolean(headless),
            args
        });

        const storageStatePath = platform ? this.getSessionFilePath(platform) : null;
        const contextOptions = {
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            locale: 'en-US',
            timezoneId: 'America/New_York'
        };

        if (storageStatePath && fs.existsSync(storageStatePath)) {
            contextOptions.storageState = storageStatePath;
        }

        this.context = await this.browser.newContext(contextOptions);

        // Stealth script injection
        await this.context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        return { browser: this.browser, context: this.context };
    }

    getSessionFilePath(platform) {
        return path.join(this.sessionsDir, `${platform.toLowerCase()}_state.json`);
    }

    async saveSessionState(platform) {
        if (!this.context) return;
        const savePath = this.getSessionFilePath(platform);
        await this.context.storageState({ path: savePath });
        return savePath;
    }

    async hasSession(platform) {
        const filePath = this.getSessionFilePath(platform);
        return fs.existsSync(filePath);
    }

    /**
     * Inspects cookies and active page URL to verify if user has completed login
     */
    async verifyPlatformLogin(context, page, platform) {
        if (!context) return false;
        try {
            const cookies = await context.cookies();
            const url = page && !page.isClosed() ? page.url().toLowerCase() : '';

            if (platform === 'linkedin') {
                const hasLiAt = cookies.some(c => c.name === 'li_at' && Boolean(c.value));
                const hasFeed = url.includes('linkedin.com/feed') || url.includes('/mynetwork') || url.includes('/jobs');
                return hasLiAt || hasFeed;
            } else if (platform === 'naukri') {
                const hasNaukriAuth = cookies.some(c => (c.name.includes('nk_') || c.name === 'USER' || c.name.includes('session')) && Boolean(c.value));
                const hasDashboard = url.includes('naukri.com') && !url.includes('/login') && !url.endsWith('.com/');
                return hasNaukriAuth || hasDashboard;
            } else if (platform === 'indeed') {
                const hasIndeedAuth = cookies.some(c => (c.name === 'SURF' || c.name === 'SHOE' || c.name === 'CSRF' || c.name === 'LOGGED_IN') && Boolean(c.value));
                const hasIndeedHome = url.includes('indeed.com') && !url.includes('/account/login') && !url.includes('/auth');
                return hasIndeedAuth || hasIndeedHome;
            }

            return cookies.length > 3;
        } catch (e) {
            return false;
        }
    }

    async captureScreenshot(page, prefix = 'proof') {
        const filename = `${prefix}_${Date.now()}.png`;
        const filepath = path.join(this.screenshotsDir, filename);
        await page.screenshot({ path: filepath, fullPage: true });
        return { filename, filepath };
    }

    async closeBrowser() {
        if (this.context) {
            await this.context.close().catch(() => {});
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close().catch(() => {});
            this.browser = null;
        }
    }
}

module.exports = new BrowserManager();
