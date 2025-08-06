import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { initSocket } from '../socket';
import './ChatPage.css';

const ChatPage = () => {
    const { roomId } = useParams();
    const location = useLocation();
    const username = location.state?.username;
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState('');
    const socketRef = useRef(null);
    const bottomRef = useRef(null);

    useEffect(() => {
        const setupSocket = async () => {
            socketRef.current = await initSocket();

            socketRef.current.emit('join', { roomId, username });

            socketRef.current.on('chat-history', (history) => {
                setMessages(history);
            });

            socketRef.current.on('chat-message', ({ username, message, timestamp }) => {
                setMessages((prev) => [
                    ...prev,
                    { username, message, timestamp: timestamp || new Date().toISOString() },
                ]);
            });
        };

        setupSocket();

        return () => {
            socketRef.current.disconnect();
            socketRef.current.off('chat-message');
            socketRef.current.off('chat-history');
        };
    }, [roomId, username]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = () => {
        if (message.trim() !== '') {
            socketRef.current.emit('chat-message', { roomId, username, message });
            setMessage('');
        }
    };

    return (
        <div className="chat-container">
            <div className="chat-header">Room: {roomId}</div>
            <div className="chat-box">
                {messages.map((msg, idx) => (
                    <div key={idx} className="message">
                        <strong>{msg.username}:</strong> {msg.message}
                        <div className="timestamp">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
            <div className="input-area">
                <input
                    className="input"
                    type="text"
                    value={message}
                    placeholder="Type a message..."
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button className="send-btn" onClick={sendMessage}>
                    Send
                </button>
            </div>
        </div>

    );
};

export default ChatPage;
