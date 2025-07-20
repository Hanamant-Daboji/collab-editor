const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const ACTIONS = require('./src/Actions');
const ChatMessage = require('./models/ChatMessage');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve React build
app.use(express.static('build'));
app.use((req, res, next) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// ✅ MongoDB connection
mongoose.connect('mongodb://localhost:27017/chat-sync', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('✅ MongoDB connected'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));

// Health route (optional)
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

    // 🔁 Join room
    socket.on(ACTIONS.JOIN, async ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);

        // 🧠 Fetch chat history from MongoDB
        try {
            const history = await ChatMessage.find({ roomId })
                .sort({ timestamp: 1 })
                .lean();
            socket.emit('chat-history', history);
        } catch (err) {
            console.error('❌ Error fetching chat history:', err);
        }

        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    // 💻 Code change broadcast
    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    // 🔁 Sync code to new user
    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    // 💬 Handle incoming chat message
    socket.on('chat-message', async ({ roomId, username, message }) => {
        console.log(`📩 ${username} sent message in room ${roomId}: ${message}`);
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


    // ❌ Handle disconnect
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

const PORT = process.env.PORT || 5500;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
