# Testing Guide for TON Connect USDT Payments

## Quick Test Setup

### 1. Environment Variables
Create a `.env` file with these variables:

```env
# For Development Testing
TRANSFER_MODE=simulate
NODE_ENV=development
PURCHASE_AMOUNT_USDT=30

# For Live Testing (use real addresses)
TRANSFER_MODE=live
TREASURY_WALLET_ADDRESS=EQD... # Your actual treasury wallet
USDT_JETTON_ADDRESS=EQD... # USDT jetton master contract
TONAPI_BASE=https://tonapi.io
TONAPI_KEY=your_tonapi_key # Optional but recommended
```

### 2. Test Scenarios

#### Development Mode (Simulated)
1. Set `TRANSFER_MODE=simulate`
2. Click "Purchase Package"
3. Should create mock transaction
4. Backend should accept and activate package

#### Live Mode (Real Transactions)
1. Set `TRANSFER_MODE=live`
2. Configure real wallet addresses
3. Connect real TON wallet
4. Click "Purchase Package"
5. Confirm transaction in wallet
6. Backend should verify and activate package

### 3. Testing Checklist

#### Frontend Tests
- [ ] Wallet connection works
- [ ] Purchase button is enabled when wallet connected
- [ ] Purchase button is disabled when wallet disconnected
- [ ] Error messages display correctly
- [ ] Loading states work properly

#### Backend Tests
- [ ] Config endpoint returns correct values
- [ ] Jetton wallet endpoint works
- [ ] Payment verification works
- [ ] User package activation works
- [ ] Error handling works

#### Integration Tests
- [ ] Full payment flow works in development mode
- [ ] Full payment flow works in live mode
- [ ] Error scenarios are handled gracefully
- [ ] User dashboard updates after purchase

### 4. Debug Commands

#### Check Environment
```bash
curl http://localhost:3000/api/referrals/debug-env
```

#### Check Config
```bash
curl http://localhost:3000/api/referrals/config
```

#### Test Jetton Wallet
```bash
curl -X POST http://localhost:3000/api/referrals/jetton-wallet \
  -H "Content-Type: application/json" \
  -d '{"userWalletAddress":"EQD...","jettonMasterAddress":"EQD..."}'
```

### 5. Common Test Issues

#### Wallet Connection Issues
- Ensure you're using HTTPS in production
- Check TON Connect manifest configuration
- Try different wallets (Tonkeeper, Wallet, etc.)

#### Transaction Issues
- Check gas amount (0.1 TON should be sufficient)
- Verify user has sufficient USDT balance
- Check jetton contract address

#### Verification Issues
- Check TON API configuration
- Verify treasury wallet address
- Check USDT jetton address

### 6. Production Testing

Before going live:
1. Test with small amounts first
2. Verify all environment variables
3. Test with different wallets
4. Monitor transaction verification
5. Check error handling

### 7. Monitoring

Monitor these logs:
- Frontend console logs
- Backend application logs
- TON API responses
- Transaction verification results
