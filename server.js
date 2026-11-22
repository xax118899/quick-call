import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  pingInterval: 5000,
  pingTimeout: 10000,
});

app.use(express.static("public"));

// نگهداری اعضای هر اتاق: Map<roomId, Set<socketId>>
const rooms = new Map();

io.on("connection", (socket) => {
  socket.on("join-room", (roomId) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    const room = rooms.get(roomId);

    // اعمال سخت‌گیرانه ظرفیت حداکثر ۲ نفر
    if (room.size >= 2) {
      socket.emit("room-full");
      return;
    }

    room.add(socket.id);
    socket.join(roomId);
    socket.data.roomId = roomId;

    // با ورود نفر دوم، به نفر اول دستور شروع Offer می‌دهیم
    if (room.size === 2) {
      socket.to(roomId).emit("peer-joined");
    }
  });

  // ارسال پیام‌های سیگنالینگ (Offer, Answer, ICE) فقط به همتای دیگر در همان اتاق
  socket.on("signal", ({ roomId, data }) => {
    socket.to(roomId).emit("signal", data);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    room.delete(socket.id);
    socket.to(roomId).emit("peer-left");

    if (room.size === 0) {
      rooms.delete(roomId);
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});