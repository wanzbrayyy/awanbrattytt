const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const config = require('./config');
const bot = require('./telegram');
const TrackedLink = require('./models/trackedLink');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

mongoose.Promise = require('bluebird');
mongoose.connect(config.mongodbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
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

app.get('/track/:alias', async (req, res) => {
    try {
        const { alias } = req.params;
        const linkData = await TrackedLink.findOne({ alias: alias });

        if (!linkData) {
            return res.status(404).send('Tautan tidak ditemukan atau telah kedaluwarsa.');
        }

        // Kirim notifikasi ke pembuat tautan
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];

        let notificationMessage = `🔔 *Tautan Dilacak Terbuka!*\n\n` +
                                  `🔗 **Tautan Asli:** ${linkData.originalLink}\n` +
                                  `👤 **Dibuka oleh:**\n` +
                                  `   - **IP:** \`${ip}\`\n` +
                                  `   - **User Agent:** \`${userAgent}\``;

        try {
            const geoResponse = await axios.get(`http://ip-api.com/json/${ip}`);
            const geoData = geoResponse.data;
            if (geoData.status === 'success') {
                notificationMessage += `\n\n📍 *Lokasi Perkiraan:*\n` +
                                       `   - **Negara:** ${geoData.country}\n` +
                                       `   - **Wilayah:** ${geoData.regionName}\n` +
                                       `   - **Kota:** ${geoData.city}\n` +
                                       `   - **ZIP:** ${geoData.zip}\n` +
                                       `   - **ISP:** ${geoData.isp}`;
            }
        } catch (geoError) {
            console.error("Gagal mendapatkan info geolokasi:", geoError);
        }

        await bot.sendMessage(linkData.creatorChatId, notificationMessage, { parse_mode: 'Markdown' });

        // Alihkan ke tautan asli
        res.redirect(linkData.originalLink);

    } catch (error) {
        console.error("Kesalahan pada endpoint pelacakan:", error);
        res.status(500).send('Terjadi kesalahan internal.');
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
