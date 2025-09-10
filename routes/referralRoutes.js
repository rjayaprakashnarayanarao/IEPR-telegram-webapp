const express = require('express');
const router = express.Router();
const User = require('../models/User');
const crypto = require('crypto');

// Telegram bot username for building referral links
const BOT_USERNAME = process.env.BOT_USERNAME || 'YourBotUsername';

// New 2-Level Referral System Configuration
const REFERRAL_CONFIG = {
    INVESTMENT_AMOUNT: 30, // $30 investment per user
    COINS_PER_USER: 300,   // ~300 coins per user
    L1_REWARD_PERCENTAGE: 25, // 25% reward for L1 referrals
    L1_BONUS_PERCENTAGE: 10,  // 10% bonus every 5 L1 referrals
    L2_BONUS_PERCENTAGE: 10,  // 10% bonus for L2 milestones
    L1_MILESTONE_SIZE: 5,     // Every 5 L1 referrals = 1 milestone
    L2_MILESTONE_SIZE: 25,    // 25 L2 referrals = 1 milestone (5 L1 users × 5 L2 each)
    MONTHLY_BASE_COINS: 25
};

// Generate unique referral code
function generateReferralCode() {
    return crypto.randomBytes(8).toString('hex').toUpperCase();
}

// Ensure referral code is unique
async function ensureUniqueReferralCode() {
    let referralCode;
    let isUnique = false;
    
    while (!isUnique) {
        referralCode = generateReferralCode();
        const existingUser = await User.findOne({ referralCode });
        if (!existingUser) {
            isUnique = true;
        }
    }
    
    return referralCode;
}

// Create a new user
router.post('/users', async (req, res) => {
    try {
        const { telegramId, referrerId, username } = req.body;
        
        // Check if user already exists
        if (telegramId) {
            const existingUser = await User.findOne({ telegramId });
            if (existingUser) {
                // Update username if provided and changed
                if (username && username !== existingUser.username) {
                    existingUser.username = username;
                    await existingUser.save();
                }
                return res.json(existingUser);
            }
        }

        // Generate unique referral code
        const referralCode = await ensureUniqueReferralCode();

        const user = new User({
            telegramId,
            username: username || null,
            referrerId: referrerId || null,
            investment: REFERRAL_CONFIG.INVESTMENT_AMOUNT,
            coins: 0,
            coinLimitTotal: 300,
            coinLimitClaimed: 0,
            referralCode
        });

        await user.save();

        // Process referral rewards if user has a referrer
        if (referrerId) {
            await processReferralRewards(referrerId, user._id);
        }

        res.status(201).json(user);
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Get user statistics
router.get('/users/:userId/stats', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Calculate total L2 referrals (indirect referrals)
        const totalL2Referrals = await User.countDocuments({
            referrerId: { $in: user.referrals.L1 }
        });

        const stats = {
            totalReferrals: user.referrals.L1.length + totalL2Referrals,
            level1Count: user.referrals.L1.length,
            level2Count: totalL2Referrals,
            earnings: user.earnings,
            totalEarnings: user.totalEarnings,
            investment: user.investment,
            coins: user.coins,
            l1MilestoneBonuses: user.l1MilestoneBonuses,
            l2MilestoneBonuses: user.l2MilestoneBonuses,
            monthlyClaim: {
                lastClaim: user.lastMonthlyClaim,
                pending: user.monthlyClaimPending || 0
            },
            // Calculate potential earnings
            potentialL1Earnings: (user.referrals.L1.length * REFERRAL_CONFIG.INVESTMENT_AMOUNT * REFERRAL_CONFIG.L1_REWARD_PERCENTAGE / 100),
            potentialL1BonusEarnings: (user.l1MilestoneBonuses * REFERRAL_CONFIG.INVESTMENT_AMOUNT * REFERRAL_CONFIG.L1_BONUS_PERCENTAGE / 100),
            potentialL2BonusEarnings: (user.l2MilestoneBonuses * REFERRAL_CONFIG.INVESTMENT_AMOUNT * REFERRAL_CONFIG.L2_BONUS_PERCENTAGE / 100)
        };

        res.json(stats);
    } catch (error) {
        console.error('Error getting user stats:', error);
        res.status(500).json({ error: 'Failed to get user stats' });
    }
});

// Get monthly claim status
router.get('/users/:userId/monthly-claim', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).lean();
        if (!user) return res.status(404).json({ error: 'User not found' });

        const now = new Date();
        const last = user.lastMonthlyClaim ? new Date(user.lastMonthlyClaim) : null;
        let canClaim = false;
        if (!last || isNaN(last.getTime())) {
            canClaim = true;
        } else {
            const months = (now.getFullYear() - last.getFullYear()) * 12 + (now.getMonth() - last.getMonth());
            canClaim = Number.isFinite(months) && months >= 1;
        }

        const totalLimit = Number(user.coinLimitTotal || 300);
        const claimedSoFar = Number(user.coinLimitClaimed || 0);
        const remaining = Math.max(0, totalLimit - claimedSoFar);
        const monthlyTarget = Math.ceil(totalLimit / 12);
        const base = canClaim ? Math.min(monthlyTarget, remaining) : 0;
        const pending = 0; // pending no longer used; we compute by remaining vs monthly
        const totalClaimable = base;

        res.json({ canClaim, lastClaim: user.lastMonthlyClaim, base, pending, totalClaimable, remaining, totalLimit, claimedSoFar });
    } catch (e) {
        console.error('Error getting monthly claim:', e);
        res.status(500).json({ error: 'Failed to get monthly claim' });
    }
});

// Claim monthly coins
router.post('/users/:userId/monthly-claim', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const now = new Date();
        const last = user.lastMonthlyClaim ? new Date(user.lastMonthlyClaim) : null;
        let canClaim = false;
        if (!last || isNaN(last.getTime())) {
            canClaim = true;
        } else {
            const months = (now.getFullYear() - last.getFullYear()) * 12 + (now.getMonth() - last.getMonth());
            canClaim = Number.isFinite(months) && months >= 1;
        }
        if (!canClaim) {
            return res.status(400).json({ error: 'Monthly claim not available yet' });
        }

        const totalLimit = Number(user.coinLimitTotal || 300);
        const claimedSoFar = Number(user.coinLimitClaimed || 0);
        const remaining = Math.max(0, totalLimit - claimedSoFar);
        if (remaining <= 0) {
            return res.status(400).json({ error: 'No coins remaining to claim' });
        }
        const monthlyTarget = Math.ceil(totalLimit / 12);
        const toClaim = Math.min(monthlyTarget, remaining);

        user.coins = Number(user.coins || 0) + toClaim;
        user.coinLimitClaimed = claimedSoFar + toClaim;
        user.lastMonthlyClaim = now;
        await user.save();

        res.json({ claimed: toClaim, coins: user.coins, lastClaim: user.lastMonthlyClaim, remaining: Math.max(0, totalLimit - user.coinLimitClaimed) });
    } catch (e) {
        console.error('Error claiming monthly coins:', e);
        if (e.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid user id' });
        }
        res.status(500).json({ error: 'Failed to claim monthly coins' });
    }
});

// Get users by level
router.get('/users/:userId/level/:level', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const level = req.params.level;
        let referralUsers = [];

        if (level === '1') {
            // L1 referrals (direct referrals)
            referralUsers = await User.find({
                _id: { $in: user.referrals.L1 }
            }).select('telegramId joinDate earnings investment coins');
        } else if (level === '2') {
            // L2 referrals (indirect referrals - referrals of L1 users)
            referralUsers = await User.find({
                referrerId: { $in: user.referrals.L1 }
            }).select('telegramId joinDate earnings investment coins referrerId');
        } else {
            return res.status(400).json({ error: 'Invalid level. Only 1 and 2 are supported.' });
        }

        const formattedUsers = referralUsers.map(refUser => ({
            id: refUser._id,
            name: `User ${refUser._id}`,
            telegramId: refUser.telegramId,
            joined: formatJoinDate(refUser.joinDate),
            earnings: `${refUser.earnings.toFixed(2)} USD`,
            investment: refUser.investment,
            coins: refUser.coins,
            level: level
        }));

        res.json(formattedUsers);
    } catch (error) {
        console.error('Error getting users by level:', error);
        res.status(500).json({ error: 'Failed to get users by level' });
    }
});

// Get referral link
router.get('/users/:userId/referral-link', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Telegram Mini App deep-link uses startapp parameter
        const referralLink = `https://t.me/${BOT_USERNAME}?startapp=ref_${user.referralCode}`;
        res.json({ 
            referralLink,
            referralCode: user.referralCode
        });
    } catch (error) {
        console.error('Error getting referral link:', error);
        res.status(500).json({ error: 'Failed to get referral link' });
    }
});

// Update user's wallet information
router.post('/users/:userId/wallet', async (req, res) => {
    try {
        const { userId } = req.params;
        const { address, network, provider } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.wallet = user.wallet || {};
        if (address) user.wallet.address = address;
        if (network) user.wallet.network = network;
        if (provider) user.wallet.provider = provider;
        user.wallet.updatedAt = new Date();
        await user.save();

        res.json({ success: true, wallet: user.wallet });
    } catch (error) {
        console.error('Error updating wallet:', error);
        res.status(500).json({ error: 'Failed to update wallet' });
    }
});

// Get all users (for admin/dashboard)
router.get('/users', async (req, res) => {
    try {
        const users = await User.find().populate('referrerId', 'telegramId username');
        res.json(users);
    } catch (error) {
        console.error('Error getting all users:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Process referral code and create user
router.post('/process-referral', async (req, res) => {
    try {
        const { telegramId, referralCode, username } = req.body;
        
        if (!telegramId) {
            return res.status(400).json({ error: 'Telegram ID is required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ telegramId });
        if (existingUser) {
            // Update username if provided and different
            if (username && username !== existingUser.username) {
                existingUser.username = username;
                await existingUser.save();
            }
            return res.json({
                user: existingUser,
                message: 'User already exists',
                isNewUser: false
            });
        }

        let referrerId = null;
        
        // If referral code is provided, find the referrer
        if (referralCode) {
            const referrer = await User.findOne({ referralCode });
            if (referrer) {
                referrerId = referrer._id;
            }
        }

        // Generate unique referral code for new user
        const newUserReferralCode = await ensureUniqueReferralCode();

        const user = new User({
            telegramId,
            username: username || null,
            referrerId,
            investment: REFERRAL_CONFIG.INVESTMENT_AMOUNT,
            coins: 0,
            coinLimitTotal: 300,
            coinLimitClaimed: 0,
            referralCode: newUserReferralCode
        });

        await user.save();

        // Process referral rewards if user has a referrer
        if (referrerId) {
            await processReferralRewards(referrerId, user._id);
        }

        res.status(201).json({
            user,
            message: 'User created successfully',
            isNewUser: true
        });
    } catch (error) {
        console.error('Error processing referral:', error);
        res.status(500).json({ error: 'Failed to process referral' });
    }
});

// Get user by referral code
router.get('/referral-code/:code', async (req, res) => {
    try {
        const user = await User.findOne({ referralCode: req.params.code });
        if (!user) {
            return res.status(404).json({ error: 'Referral code not found' });
        }
        
        res.json({
            userId: user._id,
            telegramId: user.telegramId,
            referralCode: user.referralCode
        });
    } catch (error) {
        console.error('Error getting user by referral code:', error);
        res.status(500).json({ error: 'Failed to get user by referral code' });
    }
});

// Helper functions for new 2-level referral system

// Process referral rewards when a new user joins
async function processReferralRewards(referrerId, newUserId) {
    try {
        const referrer = await User.findById(referrerId);
        if (!referrer) return false;

        // Add new user to referrer's L1 referrals
        referrer.referrals.L1.push(newUserId);
        await referrer.save();

        // Calculate and distribute L1 reward (25% of $30 = $7.50)
        const l1Reward = REFERRAL_CONFIG.INVESTMENT_AMOUNT * REFERRAL_CONFIG.L1_REWARD_PERCENTAGE / 100;
        referrer.earnings += l1Reward;
        referrer.totalEarnings += l1Reward;
        // Increase coin limit by 75 coins (25% bonus of $30 -> 7.5$ -> 75 coins)
        referrer.coinLimitTotal = Number(referrer.coinLimitTotal || 0) + 75;
        await referrer.save();

        // Check for L1 milestone bonus (every 5 L1 referrals)
        const l1Count = referrer.referrals.L1.length;
        const newMilestones = Math.floor(l1Count / REFERRAL_CONFIG.L1_MILESTONE_SIZE);
        const bonusMilestones = newMilestones - referrer.l1MilestoneBonuses;

        if (bonusMilestones > 0) {
            const l1Bonus = bonusMilestones * REFERRAL_CONFIG.INVESTMENT_AMOUNT * REFERRAL_CONFIG.L1_BONUS_PERCENTAGE / 100;
            referrer.earnings += l1Bonus;
            referrer.totalEarnings += l1Bonus;
            referrer.l1MilestoneBonuses = newMilestones;
            // Add equivalent coins to cap: 10% of $30 = $3 => 30 coins per milestone
            const milestoneCoinIncrease = 30 * bonusMilestones;
            referrer.coinLimitTotal = Number(referrer.coinLimitTotal || 0) + milestoneCoinIncrease;
            await referrer.save();
        }

        // Check for L2 milestone bonus (when L1 users have 25 L2 referrals total)
        await checkL2MilestoneBonus(referrerId);

        return true;
    } catch (error) {
        console.error('Error processing referral rewards:', error);
        return false;
    }
}

// Check and award L2 milestone bonus
async function checkL2MilestoneBonus(userId) {
    try {
        const user = await User.findById(userId);
        if (!user) return false;

        // Count total L2 referrals (referrals of L1 users)
        const totalL2Referrals = await User.countDocuments({
            referrerId: { $in: user.referrals.L1 }
        });

        // Check if we have enough L2 referrals for a milestone
        const newL2Milestones = Math.floor(totalL2Referrals / REFERRAL_CONFIG.L2_MILESTONE_SIZE);
        const bonusL2Milestones = newL2Milestones - user.l2MilestoneBonuses;

        if (bonusL2Milestones > 0) {
            const l2Bonus = bonusL2Milestones * REFERRAL_CONFIG.INVESTMENT_AMOUNT * REFERRAL_CONFIG.L2_BONUS_PERCENTAGE / 100;
            user.earnings += l2Bonus;
            user.totalEarnings += l2Bonus;
            user.l2MilestoneBonuses = newL2Milestones;
            // Add equivalent coins to cap: 10% of $30 = $3 => 30 coins per milestone
            const l2MilestoneCoinIncrease = 30 * bonusL2Milestones;
            user.coinLimitTotal = Number(user.coinLimitTotal || 0) + l2MilestoneCoinIncrease;
            await user.save();
        }

        return true;
    } catch (error) {
        console.error('Error checking L2 milestone bonus:', error);
        return false;
    }
}

function formatJoinDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
}

module.exports = router;
