const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const ACTIONS = require('./utils/Actions');
const ChatMessage = require('./models/ChatMessage');
const CodeRoom = require('./models/CodeRoom');

require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ✅ Enable CORS for REST API
app.use(
    cors({
        origin: process.env.CLIENT_URL || '*', // frontend URL
        methods: ['GET', 'POST'],
        credentials: true,
    })
);

// ✅ Socket.IO with CORS
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || '*', // frontend URL
        methods: ['GET', 'POST'],
    },
});

// ✅ MongoDB connection
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        await mongoose.connection.db.admin().ping();
        res.json({ status: 'ok', mongo: 'connected' });
    } catch {
        res.status(500).json({ status: 'fail', mongo: 'disconnected' });
    }
});

const userSocketMap = {};
function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => ({
            socketId,
            username: userSocketMap[socketId],
        })
    );
}

io.on('connection', (socket) => {
    console.log('📡 Socket connected:', socket.id);

    socket.on(ACTIONS.JOIN, async ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);

        // Send last saved code
        try {
            const existingRoom = await CodeRoom.findOne({ roomId });
            if (existingRoom) {
                socket.emit(ACTIONS.CODE_CHANGE, { code: existingRoom.content });
            }
        } catch (err) {
            console.error('❌ Error fetching code from DB:', err);
        }

        // Send chat history
        try {
            const history = await ChatMessage.find({ roomId })
                .sort({ timestamp: 1 })
                .lean();
            socket.emit('chat-history', history);
        } catch (err) {
            console.error('❌ Error fetching chat history:', err);
        }

        // Notify all in room
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    // Broadcast and save code
    socket.on(ACTIONS.CODE_CHANGE, async ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
        try {
            await CodeRoom.findOneAndUpdate(
                { roomId },
                { content: code, updatedAt: Date.now() },
                { upsert: true }
            );
        } catch (err) {
            console.error('❌ Error saving code to DB:', err);
        }
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on('chat-message', async ({ roomId, username, message }) => {
        console.log(`📩 ${username} sent: ${message}`);
        try {
            const newMsg = new ChatMessage({ roomId, username, message });
            await newMsg.save();
            io.to(roomId).emit('chat-message', {
                username,
                message,
                timestamp: newMsg.timestamp,
            });
        } catch (err) {
            console.error('❌ Error saving chat message:', err);
        }
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        delete userSocketMap[socket.id];
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
