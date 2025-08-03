const puppeteer = require('puppeteer');
const { faker } = require('@faker-js/faker');

async function executeView(url, watchTime) {
    let browser;
    try {
        // We need to launch puppeteer with no-sandbox args on linux
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // <- this one doesn't works in Windows
                '--disable-gpu'
            ]
        });
        const page = await browser.newPage();

        const headers = {
            'Accept-Language': faker.location.countryCode(),
            'User-Agent': faker.internet.userAgent(),
            'X-Forwarded-For': faker.internet.ip(),
            'X-Real-IP': faker.internet.ip(),
            'Referer': faker.internet.url(),
            'Origin': faker.internet.url(),
            'DNT': '1',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        await page.setExtraHTTPHeaders(headers);
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        await page.waitForSelector('video');
        await page.evaluate(() => {
            const video = document.querySelector('video');
            if (video) {
                video.muted = true;
                video.play();
            }
        });

        // Wait for the specified watch time
        await new Promise(resolve => setTimeout(resolve, watchTime * 1000));

        if (browser) {
            await browser.close();
        }

        // Send success message to parent process
        if (process.send) {
            process.send({ status: 'success' });
        }

    } catch (error) {
        console.error('Error in executeView:', error);
        if (browser) {
            await browser.close();
        }
        // Send error message to parent process
        if (process.send) {
            process.send({ status: 'error', message: error.message });
        }
    }
}

// This allows the script to be called directly from another file
// or executed as a child process
if (require.main === module) {
    // Executed as a child process
    process.on('message', async (message) => {
        const { url, watchTime } = message;
        await executeView(url, watchTime);
        process.exit();
    });
} else {
    // Required by another file
    module.exports = executeView;
}
