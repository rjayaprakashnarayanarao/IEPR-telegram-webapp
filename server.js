const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ENABLE_TELEGRAM_BOT = process.env.ENABLE_TELEGRAM_BOT === 'true';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.')); // Serve static files from current directory

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/iepr_referral_system';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    bufferCommands: false, // Disable mongoose buffering
});

const db = mongoose.connection;
db.on('error', (error) => {
    console.error('MongoDB connection error:', error);
    console.log('Make sure MongoDB is running on your system');
});
db.once('open', () => {
    console.log('Connected to MongoDB successfully!');
    console.log('Database:', db.name);
});

// Import routes
const referralRoutes = require('./routes/referralRoutes');

// Use routes
app.use('/api/referrals', referralRoutes);

// Basic route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Frontend available at: http://localhost:${PORT}`);
    if (ENABLE_TELEGRAM_BOT) {
        try {
            // Lazy-require bot to avoid slowing normal startup if disabled
            const { startTelegramBot } = require('./telegram/bot');
            startTelegramBot();
        } catch (err) {
            console.error('Failed to start Telegram bot:', err.message);
        }
    } else {
        console.log('Telegram bot disabled. Set ENABLE_TELEGRAM_BOT=true to enable.');
    }
});
