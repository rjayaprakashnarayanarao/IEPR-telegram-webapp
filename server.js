const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const https = require('https');
const http = require('http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { logger, requestLogger } = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ENABLE_TELEGRAM_BOT = process.env.ENABLE_TELEGRAM_BOT === 'true';

// Middleware
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "https://telegram.org", "https://unpkg.com", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: [
                "'self'", 
                "https://tonapi.io", 
                "https://toncenter.com",
                "https://config.ton.org",
                "https://unpkg.com",
                "https://walletbot.me",
                "https://bridge.tonapi.io",
                "wss://bridge.tonapi.io"
            ]
        }
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing
app.use(bodyParser.json({ 
    limit: process.env.BODY_LIMIT || '200kb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(bodyParser.urlencoded({ extended: true, limit: '200kb' }));

// Request logging
app.use(requestLogger);

// Serve static files
app.use(express.static('.'));

// Rate limiting
const generalLimiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000)),
    max: Number(process.env.RATE_LIMIT_MAX || 500),
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per window
    message: { error: 'Too many authentication attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Apply rate limiting
app.use('/api/', generalLimiter);
app.use('/api/admin/login', strictLimiter);
app.use('/api/referrals/purchase', strictLimiter);

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
        logger.info('Connected to MongoDB successfully!', { database: db.name });
    } catch (error) {
        logger.error('MongoDB connection error:', error);
        logger.warn('Continuing to run server. Set a valid MONGODB_URI to enable database.');
    }
}

connectToMongo();

// Import routes
const referralRoutes = require('./routes/referralRoutes');
const adminRoutes = require('./routes/adminRoutes');

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
app.use('/api/admin', requireDatabase, adminRoutes);

// Health check (for Render)
app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
});
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// TON Connect Manifest (dynamic for dev/prod)
app.get('/tonconnect-manifest.json', (req, res) => {
    const baseUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const manifest = {
        url: baseUrl,
        name: "IND EMPOWER",
        iconUrl: `${baseUrl}/images/1000166421.png`,
        termsOfUseUrl: `${baseUrl}/terms`,
        privacyPolicyUrl: `${baseUrl}/privacy`,
        bridgeUrl: "https://bridge.tonapi.io/bridge",
        universalLink: baseUrl,
        description: "IEPR Token - Membership System & Referral Rewards",
        version: "1.0.0"
    };
    res.json(manifest);
});

// Basic route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Frontend available at: http://0.0.0.0:${PORT}`);
    if (ENABLE_TELEGRAM_BOT) {
        try {
            // Lazy-require bot to avoid slowing normal startup if disabled
            const { startTelegramBot } = require('./telegram/bot');
            startTelegramBot();
        } catch (err) {
            logger.error('Failed to start Telegram bot:', err.message);
        }
    } else {
        logger.info('Telegram bot disabled. Set ENABLE_TELEGRAM_BOT=true to enable.');
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
                    logger.info(`Pinged server: Status Code ${res.statusCode}`);
                    // Consume response to free sockets
                    res.resume();
                });
                req.setTimeout(5000, () => {
                    req.destroy(new Error('Ping request timed out'));
                });
                req.on('error', (err) => {
                    logger.error('Error pinging server:', err.message);
                });
            } catch (e) {
                logger.error('Keep-alive ping failed to start:', e.message);
            }
        };
        // Initial ping and schedule every 12 minutes (adjust as needed for host policy)
        ping();
        setInterval(ping, 12 * 60 * 1000);
    } else {
        logger.info('KEEPALIVE_URL not set; skipping keep-alive pings.');
    }
});

// Configure server timeouts for Render
server.keepAliveTimeout = 120000; // 2 minutes
server.headersTimeout = 120000; // 2 minutes
server.timeout = 120000; // 2 minutes

// Handle server errors
server.on('error', (error) => {
    if (error.syscall !== 'listen') {
        throw error;
    }
    
    const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;
    
    switch (error.code) {
        case 'EACCES':
            logger.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            logger.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
    });
});
