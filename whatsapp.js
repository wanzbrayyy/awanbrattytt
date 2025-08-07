const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    makeCacheableSignalKeyStore
} = require('@adiwajshing/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// Helper function to clean up session files
const cleanupSession = (phoneNumber) => {
    const authDir = path.join(__dirname, 'whatsapp_sessions', phoneNumber);
    if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
    }
};

async function getWhatsAppPairingCode(phoneNumber) {
    const authDir = path.join(__dirname, 'whatsapp_sessions', phoneNumber);

    // Clean up any previous session files for this number to ensure a fresh start
    cleanupSession(phoneNumber);

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const logger = pino({ level: 'silent' });

    const client = makeWASocket({
        logger,
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
    });

    return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
            client.end();
            cleanupSession(phoneNumber);
            reject(new Error('Failed to get pairing code within 30 seconds.'));
        }, 30000);

        let pairingCodeRequested = false;

        client.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if (connection === 'open') {
                // This is where we request the code
                if (!pairingCodeRequested) {
                    pairingCodeRequested = true;
                    try {
                        await delay(2000); // Give it a moment to stabilize
                        const code = await client.requestPairingCode(phoneNumber);
                        console.log(`Pairing code for ${phoneNumber}: ${code}`);
                        clearTimeout(timeout);
                        client.end();
                        cleanupSession(phoneNumber); // Clean up after getting the code
                        resolve(code);
                    } catch (error) {
                        clearTimeout(timeout);
                        client.end();
                        cleanupSession(phoneNumber);
                        reject(new Error(`Could not request pairing code: ${error.message}`));
                    }
                }
            }

            if (connection === 'close') {
                clearTimeout(timeout);
                // Only reject if we haven't already resolved the promise
                // This prevents rejecting after a successful code retrieval
                if (pairingCodeRequested) {
                    // It's normal for the connection to close after we end it.
                } else {
                   cleanupSession(phoneNumber);
                   reject(new Error('Connection closed unexpectedly.'));
                }
            }
        });

        client.ev.on('creds.update', saveCreds);
    });
}

module.exports = { getWhatsAppPairingCode };
