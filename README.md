IEPR Referral System – Render Deployment Notes

Environment Variables (Render)
- MONGODB_URI: your MongoDB connection string
- BOT_USERNAME: your Telegram bot username (optional)
- ENABLE_TELEGRAM_BOT: true/false (default false)

Healthchecks
- HTTP Path: /healthz (200 OK)

Start Command
- npm start

Build Command
- npm run render-build

