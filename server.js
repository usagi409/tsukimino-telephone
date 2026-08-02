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
  },
  // パケットサイズの上限を5MBに拡大
  maxHttpBufferSize: 5 * 1024 * 1024
});

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// ルームごとの参加者情報を管理 (roomId -> Map(socket.id -> { id, name, avatar, isMuted, isDeafened }))
const roomUsers = new Map();

io.on('connection', (socket) => {
  console.log(`ユーザーが接続しました: ${socket.id}`);

  // join-room 時に mode ('create' または 'join') も受け取る
  socket.on('join-room', ({ roomId, name, avatar, mode }, callback) => {
    
    // 「部屋に入る」モードなのに、部屋が存在しない（または誰もいない）場合の判定
    if (mode === 'join' && (!roomUsers.has(roomId) || roomUsers.get(roomId).size === 0)) {
      console.log(`参加失敗: ルーム ${roomId} は存在しません (${name})`);
      if (typeof callback === 'function') {
        callback({ success: false, message: '指定されたルームIDは存在しないか、全員退出済みです！' });
      }
      return;
    }

    socket.join(roomId);
    
    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Map());
    }
    // 初期状態としてミュート・デフェンド情報も含めて登録
    roomUsers.get(roomId).set(socket.id, { id: socket.id, name, avatar, isMuted: false, isDeafened: false });

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

    // 成功したことを呼び出し元に通知
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });

  // ユーザーのミュート・スピーカーオフ状態の変更を同期
  socket.on('update-status', ({ isMuted, isDeafened }) => {
    for (const [roomId, roomMap] of roomUsers.entries()) {
      if (roomMap.has(socket.id)) {
        const user = roomMap.get(socket.id);
        user.isMuted = isMuted;
        user.isDeafened = isDeafened;

        // 更新されたメンバーリストを部屋全体にブロードキャスト
        const users = Array.from(roomMap.values());
        io.to(roomId).emit('room-users', users);
        break;
      }
    }
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
