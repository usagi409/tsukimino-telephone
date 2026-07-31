const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

// HTTPリクエストに対するCORSを許可（ping等用）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// ルームごとの参加者情報を管理 (socket.id -> { id, name, avatar })
const roomUsers = new Map();

io.on('connection', (socket) => {
  console.log(`ユーザーが接続しました: ${socket.id}`);

  socket.on('join-room', ({ roomId, name, avatar }) => {
    socket.join(roomId);
    
    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Map());
    }
    // avatar（アイコン画像URL）も追加で保持
    roomUsers.get(roomId).set(socket.id, { id: socket.id, name, avatar });

    console.log(`ユーザー ${name} (${socket.id}) がルーム ${roomId} に参加しました`);

    // 同じ部屋のメンバー一覧を作成
    const roomMap = roomUsers.get(roomId);
    const users = Array.from(roomMap.values());

    // 部屋全体のメンバーリストを全員に通知
    io.to(roomId).emit('room-users', users);

    // 自分以外の既存メンバーリストを本人に返す
    const otherUsers = users.filter(u => u.id !== socket.id);
    socket.emit('all-users', otherUsers);

    // 自分が入ってきたことを他の人に通知
    socket.to(roomId).emit('user-joined', { id: socket.id, name, avatar });
  });

  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal
    });
  });

  socket.on('disconnect', () => {
    console.log(`ユーザーが切断しました: ${socket.id}`);
    
    // どの部屋にいたか探して削除
    for (const [roomId, roomMap] of roomUsers.entries()) {
      if (roomMap.has(socket.id)) {
        const user = roomMap.get(socket.id);
        roomMap.delete(socket.id);
        
        // 残ったメンバーに通知
        const users = Array.from(roomMap.values());
        io.to(roomId).emit('room-users', users);
        socket.to(roomId).emit('user-left', { id: socket.id, name: user.name });

        if (roomMap.size === 0) {
          roomUsers.delete(roomId);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`シグナリングサーバーがポート ${PORT} で起動しました`);
});
