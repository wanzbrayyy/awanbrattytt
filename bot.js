const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const config = require('./config');
const bot = require('./telegram');

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
