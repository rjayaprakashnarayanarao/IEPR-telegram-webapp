const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Business identifier for users (e.g., IEPR12345)
    userId: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
        default: null
    },
    username: {
        type: String,
        default: null
    },
    telegramId: {
        type: String,
        unique: true,
        sparse: true
    },
    // Primary wallet on TON for the user
    walletAddress: {
        type: String,
        default: null,
        index: true
    },
    referrerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    joinDate: {
        type: Date,
        default: Date.now
    },
    investment: {
        type: Number,
        default: 30 // $30 investment
    },
    // IND EMPOWER spec fields
    referralLink: {
        type: String,
        default: null
    },
    packageActive: {
        type: Boolean,
        default: false
    },
    packageExpiry: {
        type: Date,
        default: null
    },
    tokensEntitled: {
        type: Number,
        default: 300
    },
    tokensClaimed: {
        type: Number,
        default: 0
    },
    directReferrals: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }],
    indirectReferrals: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }],
    rewardsBalanceUSDT: {
        type: Number,
        default: 0
    },
    leadershipStatus: {
        type: Boolean,
        default: false
    },
    // Legacy fields for backward compatibility
    coins: {
        type: Number,
        default: 0
    },
    lastMonthlyClaim: {
        type: Date,
        default: null
    },
    monthlyClaimPending: {
        type: Number,
        default: 0
    },
    earnings: {
        type: Number,
        default: 0
    },
    totalEarnings: {
        type: Number,
        default: 0
    },
    referrals: {
        L1: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        L2: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }]
    },
    coinLimitTotal: {
        type: Number,
        default: 300
    },
    coinLimitClaimed: {
        type: Number,
        default: 0
    },
    wallet: {
        address: {
            type: String,
            default: null
        },
        network: {
            type: String,
            default: null
        },
        provider: {
            type: String,
            default: null
        },
        updatedAt: {
            type: Date,
            default: null
        }
    },
    l1MilestoneBonuses: {
        type: Number,
        default: 0
    },
    l2MilestoneBonuses: {
        type: Number,
        default: 0
    },
    referralCode: {
        type: String,
        unique: true,
        required: true
    }
}, {
    timestamps: true
});

// Indexes for faster queries
userSchema.index({ telegramId: 1 });
userSchema.index({ referrerId: 1 });
userSchema.index({ referralCode: 1 });
userSchema.index({ walletAddress: 1 });
userSchema.index({ userId: 1 });
userSchema.index({ packageActive: 1 });
userSchema.index({ packageExpiry: 1 });
userSchema.index({ leadershipStatus: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'directReferrals': 1 });
userSchema.index({ 'indirectReferrals': 1 });
userSchema.index({ tokensClaimed: 1 });
userSchema.index({ rewardsBalanceUSDT: 1 });

module.exports = mongoose.model('User', userSchema);
