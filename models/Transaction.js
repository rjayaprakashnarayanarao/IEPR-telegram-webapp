const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    txHash: {
        type: String,
        required: true,
        index: true,
        unique: true
    },
    userId: {
        // Business userId (e.g., IEPR12345). Also store ObjectId for joins.
        type: String,
        index: true,
        required: false,
        default: null
    },
    userObjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
        default: null
    },
    type: {
        type: String,
        enum: ['packagePurchase', 'tokenClaim', 'rewardWithdraw'],
        required: true
    },
    amount: {
        // Store in smallest units? For now store human-readable numeric and currency for clarity
        value: { type: Number, required: true },
        currency: { type: String, required: true, enum: ['USDT', 'IEPR'] }
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'failed'],
        default: 'pending',
        index: true
    },
    walletAddressFrom: {
        type: String,
        default: null
    },
    walletAddressTo: {
        type: String,
        default: null
    },
    network: {
        type: String,
        default: 'ton-mainnet'
    },
    metadata: {
        type: Object,
        default: {}
    }
}, {
    timestamps: true
});

// Indexes for faster queries
transactionSchema.index({ 'amount.currency': 1, type: 1, status: 1 });
transactionSchema.index({ userId: 1, type: 1 });
transactionSchema.index({ userObjectId: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ walletAddressFrom: 1 });
transactionSchema.index({ walletAddressTo: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);


