const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const https = require('https');
const http = require('http');
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
            dbName: 'iepr_system'
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

// Protect DB-dependent routes when DB is not connected/misconfigured
function requireDatabase(req, res, next) {
    if (!MONGODB_URI) {
        return res.status(503).json({ error: 'Database not configured. Set MONGODB_URI.' });
    }
    // 1 = connected, 2 = connecting, others mean not ready
    const state = mongoose.connection.readyState;
    if (state !== 1) {
        return res.status(503).json({ error: 'Database not connected. Please try again shortly.' });
    }
    next();
}

// Use routes (guarded by DB readiness)
app.use('/api/referrals', requireDatabase, referralRoutes);

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

    // Keep-alive ping to prevent server from idling
    const keepAliveUrl = process.env.KEEPALIVE_URL;
    if (keepAliveUrl) {
        const ping = () => {
            try {
                const isHttps = keepAliveUrl.startsWith('https://');
                const client = isHttps ? https : http;
                const req = client.get(keepAliveUrl, {
                    headers: { 'User-Agent': 'keepalive-pinger/1.0' }
                }, (res) => {
                    console.log(`Pinged server: Status Code ${res.statusCode}`);
                    // Consume response to free sockets
                    res.resume();
                });
                req.setTimeout(5000, () => {
                    req.destroy(new Error('Ping request timed out'));
                });
                req.on('error', (err) => {
                    console.error('Error pinging server:', err.message);
                });
            } catch (e) {
                console.error('Keep-alive ping failed to start:', e.message);
            }
        };
        // Initial ping and schedule every 12 minutes (adjust as needed for host policy)
        ping();
        setInterval(ping, 12 * 60 * 1000);
    } else {
        console.log('KEEPALIVE_URL not set; skipping keep-alive pings.');
    }
});
