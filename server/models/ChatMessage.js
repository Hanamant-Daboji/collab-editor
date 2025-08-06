const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
    },
    username: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
