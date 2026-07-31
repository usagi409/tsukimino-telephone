const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Renderの休眠打破（叩き起こし）用の軽量ヘルスチェックエンドポイント
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// ルームごとの参加者を管理する簡易マップ
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`ユーザーが接続しました: ${socket.id}`);

  // ルーム参加
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`ユーザー ${socket.id} がルーム ${roomId} に参加しました`);

    // 同じ部屋にいる他のメンバーを通知（自分以外の既存メンバー）
    const clientsInRoom = io.sockets.adapter.rooms.get(roomId);
    const users = clientsInRoom ? Array.from(clientsInRoom).filter(id => id !== socket.id) : [];
    
    // 部屋にいる既存のメンバーに、新しく入ってきた人を伝える
    socket.to(roomId).emit('user-joined', socket.id);
    
    // 本人には現在のルームメンバーリストを返す
    socket.emit('all-users', users);
  });

  // WebRTCのシグナリング中継 (Offer / Answer / ICE Candidate)
  socket.on('signal', (data) => {
    // data: { to, signal }
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal
    });
  });

  // 切断時
  socket.on('disconnect', () => {
    console.log(`ユーザーが切断しました: ${socket.id}`);
    // 各部屋から自動で退出扱いになるため、ルーム内の他の人に知らせるならここに書く
    socket.broadcast.emit('user-left', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`シグナリングサーバーがポート ${PORT} で起動しました`);
});
