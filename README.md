IEPR Smart Network - Deployment and Environment
================================================

Environment Variables
---------------------
Configure these in Render or a local `.env` file (not committed):

- Server
  - `PORT` (default 3000)
  - `NODE_ENV` (development|production)
  - `ALLOWED_ORIGINS` (comma-separated, e.g. http://localhost:3000)
  - `BODY_LIMIT` (default 200kb)
  - `RATE_LIMIT_WINDOW_MS` (default 900000)
  - `RATE_LIMIT_MAX` (default 500)

- MongoDB
  - `MONGODB_URI` (MongoDB Atlas connection string)

- Admin / Auth
  - `ADMIN_JWT_SECRET` (strong secret for admin JWT)

- Telegram (optional)
  - `ENABLE_TELEGRAM_BOT` (true|false)
  - `TELEGRAM_BOT_TOKEN`
  - `BOT_USERNAME`

- TON / Jettons
  - `TREASURY_WALLET_ADDRESS` (Treasury wallet that receives purchases)
  - `PURCHASE_AMOUNT_USDT` (default 30)
  - `USDT_JETTON_ADDRESS` (TON USDT Jetton master address)
  - `IEPR_JETTON_ADDRESS` (IEPR Jetton master address)
  - `USDT_DECIMALS` (default 6)
  - `IEPR_DECIMALS` (default 9)

- TonAPI (read-only tx verification)
  - `TONAPI_BASE` (default https://tonapi.io)
  - `TONAPI_KEY` (optional)

- Transfers (server-side signing)
  - `TRANSFER_MODE` (simulate|live|disabled; default simulate)
  - `TONCENTER_ENDPOINT` (or TON_RPC_ENDPOINT)
  - `TONCENTER_API_KEY` (if required)
  - `TRANSFER_SIGNER_SECRET` (32-byte hex seed; keep secret!)
  - `TRANSFER_SIGNER_WORKCHAIN` (default 0)

- Keepalive (optional)
  - `KEEPALIVE_URL` (set to service URL to keep warm)

- Logging
  - `LOG_LEVEL` (error|warn|info|debug; default: info)

Render Setup
------------
`render.yaml` includes all environment keys. Set values/secrets in the Render dashboard. Ensure `MONGODB_URI`, `ADMIN_JWT_SECRET`, treasury and jetton addresses are configured before switching `TRANSFER_MODE` to `live`.

Local Development
-----------------
1) `npm install`
2) Create `.env` with the variables above
3) `npm run dev`

Logging
-------
- Winston logger with daily rotation in `logs/` directory
- Admin actions logged to both database (`AuditLog`) and files
- Request logging for all HTTP requests
- Log levels: error, warn, info, debug