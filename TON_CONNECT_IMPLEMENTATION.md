# Correct TON Connect Implementation for $30 USDT Payments

## Overview

This document explains the correct way to accept $30 (TON/USDT) payments in your Telegram WebApp using TON Connect SDK. The implementation follows TON Connect best practices for jetton transfers.

## Key Components

### 1. Frontend (script.js)
- **TON Connect SDK Integration**: Uses `@tonconnect/ui` for wallet connection
- **Jetton Transfer Messages**: Creates proper jetton transfer messages for USDT
- **Error Handling**: Comprehensive error handling and user feedback

### 2. Backend Services
- **TonConnectService**: Handles jetton wallet address calculation and verification
- **PaymentVerifier**: Verifies jetton transfers on the blockchain
- **Jetton Wallet Endpoint**: Provides user's jetton wallet address

### 3. TON Connect Manifest
- Properly configured manifest file for TON Connect integration

## Implementation Details

### Frontend Payment Flow

```javascript
// 1. User clicks "Purchase Package"
// 2. TON Connect opens user's wallet (Tonkeeper, Wallet, etc.)
// 3. Creates jetton transfer message with proper structure
// 4. Sends transaction via TON Connect
// 5. Backend verifies the transaction

const transferMessage = {
    address: appConfig.usdtJetton, // Jetton master contract
    amount: '0.1', // Gas for transaction
    payload: {
        jettonTransfer: {
            toAddress: appConfig.treasuryWallet,
            amount: jettonAmount, // 30 USDT in raw units
            responseAddress: walletAddress,
            forwardAmount: '0.05',
            forwardPayload: null
        }
    }
};
```

### Backend Verification

```javascript
// 1. Receives transaction hash from frontend
// 2. Fetches transaction from TON blockchain
// 3. Parses jetton transfers from transaction
// 4. Verifies amount, recipient, and jetton type
// 5. Activates user package if verification succeeds
```

## Environment Variables Required

```env
# TON Configuration
TREASURY_WALLET_ADDRESS=EQD... # Your treasury wallet address
USDT_JETTON_ADDRESS=EQD... # USDT jetton master contract address
PURCHASE_AMOUNT_USDT=30 # Amount in USDT
USDT_DECIMALS=6 # USDT has 6 decimal places

# TON API (for verification)
TONAPI_BASE=https://tonapi.io
TONAPI_KEY=your_tonapi_key # Optional but recommended

# App Configuration
TRANSFER_MODE=live # or 'simulate' for development
NODE_ENV=production
```

## How It Works

### Step 1: User Initiates Payment
1. User connects wallet via TON Connect
2. User clicks "Purchase Package" button
3. Frontend checks if wallet is connected

### Step 2: Create Jetton Transfer
1. Frontend creates jetton transfer message
2. TON Connect SDK handles jetton wallet address calculation
3. User's wallet (Tonkeeper, etc.) opens for confirmation

### Step 3: Transaction Execution
1. User confirms transaction in their wallet
2. Transaction is sent to TON blockchain
3. Frontend receives transaction hash (BOC)

### Step 4: Backend Verification
1. Frontend sends transaction hash to backend
2. Backend fetches transaction from TON blockchain
3. Backend verifies jetton transfer details
4. Backend activates user package if verification succeeds

## Key Features

### ✅ Proper Jetton Transfer
- Uses TON Connect SDK for jetton transfers
- Handles USDT jetton correctly (6 decimals)
- Proper gas estimation

### ✅ Secure Verification
- Verifies transaction on TON blockchain
- Checks amount, recipient, and jetton type
- Prevents double-spending

### ✅ User Experience
- Seamless wallet integration
- Clear error messages
- Loading states and feedback

### ✅ Error Handling
- Network error handling
- Transaction failure handling
- User-friendly error messages

## Testing

### Development Mode
Set `TRANSFER_MODE=simulate` to use mock transactions for testing.

### Live Mode
Set `TRANSFER_MODE=live` with proper environment variables for production.

## Security Considerations

1. **Transaction Verification**: Always verify transactions on-chain
2. **Amount Validation**: Verify exact amount (30 USDT)
3. **Jetton Validation**: Ensure correct USDT jetton contract
4. **Address Validation**: Verify recipient is your treasury wallet
5. **Double-spending Prevention**: Check transaction hasn't been used before

## Troubleshooting

### Common Issues

1. **Wallet Not Connecting**
   - Check TON Connect manifest configuration
   - Ensure HTTPS is used in production

2. **Transaction Fails**
   - Check gas amount (0.1 TON should be sufficient)
   - Verify jetton contract address
   - Check user has sufficient USDT balance

3. **Verification Fails**
   - Check TON API configuration
   - Verify treasury wallet address
   - Check USDT jetton address

### Debug Endpoints

- `/api/referrals/debug-env` - Check environment variables
- `/api/referrals/config` - Check app configuration

## Production Checklist

- [ ] Set `TRANSFER_MODE=live`
- [ ] Configure proper treasury wallet address
- [ ] Set correct USDT jetton address
- [ ] Test with small amounts first
- [ ] Monitor transaction verification
- [ ] Set up proper logging
- [ ] Configure TON API key for better reliability

## Support

For issues with this implementation:
1. Check the console logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test in development mode first
4. Check TON Connect documentation for wallet-specific issues
