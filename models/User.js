const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        default: null
    },
    telegramId: {
        type: String,
        unique: true,
        sparse: true
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
    coins: {
        type: Number,
        default: 0 // coins start at 0; drip monthly from coinLimitTotal
    },
    // Monthly claim tracking
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
    // Coins cap and progress
    coinLimitTotal: {
        type: Number,
        default: 300 // base 300 coins cap
    },
    coinLimitClaimed: {
        type: Number,
        default: 0 // how many from the cap have been claimed
    },
    // Wallet connection (TON / Telegram WebApp)
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
    // Track milestone bonuses
    l1MilestoneBonuses: {
        type: Number,
        default: 0 // Count of 5-L1 milestones reached
    },
    l2MilestoneBonuses: {
        type: Number,
        default: 0 // Count of 25-L2 milestones reached
    },
    // Unique referral link for each user
    referralCode: {
        type: String,
        unique: true,
        required: true
    }
}, {
    timestamps: true
});

// Index for faster queries
userSchema.index({ telegramId: 1 });
userSchema.index({ referrerId: 1 });
userSchema.index({ referralCode: 1 });

module.exports = mongoose.model('User', userSchema);
