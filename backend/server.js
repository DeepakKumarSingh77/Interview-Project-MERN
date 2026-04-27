const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const http = require('http'); // 1. Import HTTP
const { Server } = require('socket.io'); // 2. Import Socket.io
const resumeRoutes = require('./routes/resumeRoutes.js');
const chatController = require('./controllers/chatController.js');
const { clearSession } = chatController;
const ConnectDB = require("./config/db.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const rateLimit = require("express-rate-limit");

const app = express();

app.use(cors({
  origin: "https://interview-project-mern-br45.vercel.app",
  credentials: true
}));
app.use(express.json());

ConnectDB();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // max requests per IP
});

app.use("/api", limiter);
app.use('/api/resume', resumeRoutes);

const server = http.createServer(app); 
const io = new Server(server, {
    cors: { 
        origin: "https://interview-project-mern-br45.vercel.app",
        methods: ["GET", "POST"],
        credentials: true
    }
});

io.on('connection', (socket) => {
    console.log('⚡ User connected:', socket.id);

    socket.on('user_message', async (text) => {
        console.log('👤 User said:', text);
    });

    socket.on('user_message', async (text) => {
       console.log('👤 User:', text);
       await chatController.handleInterview(socket, text);
    });

    socket.on('start_interview', async () => {
       console.log('🏁 Interview Started');
       await chatController.initializeInterview(socket);
    });

    socket.on('disconnect', () => {
        clearSession(socket.id);
        console.log('🔥 User disconnected');
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server and Socket running on port ${PORT}`);
});
