require('dotenv').config();
const app = require('./app');
const http = require('http');
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"], // Support des deux ports fréquents de Vite
    methods: ["GET", "POST"]
  }
});

app.set("io", io);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  socket.on("join-admin", () => {
    socket.join("admin-room");
    console.log("Admin joined room:", socket.id);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});