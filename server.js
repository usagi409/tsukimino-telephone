// server.js をこれに置き換えて保存してください
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, { cors: { origin: "*" } });

io.on('connection', (socket) => {
    console.log('User joined:', socket.id);

    socket.on('join', (room) => {
        socket.join(room);
        console.log(`Room Join: ${socket.id} -> ${room}`);
    });

    socket.on('voice-stream', (data) => {
        // 同じ部屋の人に送る
        socket.to(data.room).emit('voice-stream', { audioData: data.audioData });
    });
});

server.listen(process.env.PORT || 3000);
