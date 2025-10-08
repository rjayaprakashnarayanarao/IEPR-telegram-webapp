# IND EMPOWER - Deployment Guide

## Prerequisites

1. **Node.js 18+** installed
2. **MongoDB Atlas** account for database
3. **Render** account for hosting
4. **TON API Keys** for blockchain integration

## Environment Setup

1. Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

2. Required environment variables:

### Database
- `MONGODB_URI`: Your MongoDB Atlas connection string

### Security
- `ADMIN_JWT_SECRET`: Generate a strong secret key
- `BCRYPT_ROUNDS`: Password hashing rounds (default: 12)

### TON Blockchain
- `TONCENTER_ENDPOINT`: https://toncenter.com/api/v2
- `TONCENTER_API_KEY`: Your TON Center API key
- `TONAPI_BASE`: https://tonapi.io
- `TONAPI_KEY`: Your TON API key

### Treasury & Tokens
- `TREASURY_WALLET_ADDRESS`: Your treasury wallet address
- `USDT_JETTON_ADDRESS`: USDT Jetton master address
- `IEPR_JETTON_ADDRESS`: IEPR Jetton master address

### Application
- `APP_URL`: Your production URL (e.g., https://iepr-telegram-webapp.onrender.com)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set up admin user:
```bash
node scripts/setup-admin.js
```

3. Start development server:
```bash
npm run dev
```

## Production Deployment (Render)

1. **Connect Repository**: Connect your GitHub repository to Render

2. **Create Web Service**:
   - Name: `ind-empower-iepr-system`
   - Environment: Node
   - Plan: Starter (or higher)
   - Build Command: `npm install && npm run render-build`
   - Start Command: `npm start`

3. **Set Environment Variables** in Render dashboard:
   - Copy all variables from your `.env` file
   - Set `NODE_ENV=production`
   - Set `APP_URL` to your Render URL

4. **Create MongoDB Database**:
   - Create a MongoDB Atlas cluster
   - Get connection string
   - Set `MONGODB_URI` in Render

5. **Deploy**: Render will automatically deploy on push to main branch

## Post-Deployment Setup

1. **Admin Access**:
   - Admin login uses OTP system
   - Phone number: 9390866948
   - OTP codes are displayed in server console for development
   - For production, integrate with SMS service

2. **Configure TON Integration**:
   - Get TON API keys from tonapi.io and toncenter.com
   - Set up treasury wallet
   - Deploy IEPR Jetton contract
   - Update environment variables

3. **Test the System**:
   - Visit your deployed URL
   - Test wallet connection
   - Test purchase flow (in simulate mode)
   - Test admin panel

## Security Checklist

- [ ] Change default admin password
- [ ] Set strong JWT secret
- [ ] Configure CORS properly
- [ ] Set up rate limiting
- [ ] Enable HTTPS
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy

## Monitoring

- Check Render logs for errors
- Monitor MongoDB Atlas metrics
- Set up uptime monitoring
- Configure error tracking (Sentry, etc.)

## Maintenance

- Regular database backups
- Monitor token balances
- Update dependencies regularly
- Review and rotate API keys
- Monitor referral system performance

## Troubleshooting

### Common Issues

1. **Database Connection Failed**:
   - Check MongoDB URI
   - Verify network access in Atlas
   - Check IP whitelist

2. **TON API Errors**:
   - Verify API keys
   - Check rate limits
   - Verify wallet addresses

3. **Admin Login Issues**:
   - Run setup-admin.js script
   - Check 2FA configuration
   - Verify JWT secret

4. **Payment Verification Failed**:
   - Check treasury wallet address
   - Verify USDT Jetton address
   - Test with simulate mode first

### Support

For technical support, check:
- Application logs in Render
- MongoDB Atlas logs
- TON API documentation
- This repository's issues section
