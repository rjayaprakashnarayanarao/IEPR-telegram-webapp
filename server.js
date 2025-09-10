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
const MONGODB_URI = process.env.MONGODB_URI || '';

async function connectToMongo() {
    if (!MONGODB_URI) {
        console.warn('MONGODB_URI is not set. API will run without database until provided.');
        return;
    }
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            bufferCommands: false,
        });
        const db = mongoose.connection;
        console.log('Connected to MongoDB successfully!');
        console.log('Database:', db.name);
    } catch (error) {
        console.error('MongoDB connection error:', error);
        console.log('Continuing to run server. Set a valid MONGODB_URI to enable database.');
    }
}

connectToMongo();

// Import routes
const referralRoutes = require('./routes/referralRoutes');

// Use routes
app.use('/api/referrals', referralRoutes);

// Health check (for Render)
app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
});
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

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
