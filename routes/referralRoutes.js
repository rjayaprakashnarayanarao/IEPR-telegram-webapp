const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const crypto = require('crypto');
const { PaymentVerifier } = require('../services/paymentVerifier');
const { JettonTransferService } = require('../services/jettonTransfer');
const { validatePurchase, validateClaimTokens, validateWithdraw, validateDashboard, validateUserIdParam } = require('../middleware/validators');
const { asyncHandler } = require('../middleware/errorHandler');

// Telegram bot username for building referral links
const BOT_USERNAME = process.env.BOT_USERNAME || 'YourBotUsername';

// Referral System Configuration (aligned with spec)
const REFERRAL_CONFIG = {
    INVESTMENT_AMOUNT: 30, // $30 package
    COINS_PER_USER: 300,   // 300 IEPR entitlement
    L1_REWARD_PERCENTAGE: 20, // 20% L1 = $6
    L2_REWARD_PERCENTAGE: 10, // 10% L2 = $3
    LEADERSHIP_BONUS_PERCENTAGE: 5, // 5% extra if leader (>=5 active directs)
    LEADERSHIP_THRESHOLD: 5, // 5 active directs
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

// Generate business userId like IEPR12345
async function ensureUniqueBusinessUserId() {
    while (true) {
        const candidate = `IEPR${Math.floor(10000 + Math.random() * 90000)}`;
        const exists = await User.findOne({ userId: candidate }).lean();
        if (!exists) return candidate;
    }
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

// POST /purchase → Verify 30 USDT payment, activate package, generate referral
router.post('/purchase', validatePurchase, async (req, res) => {
    try {
        const { walletAddress, txHash, referralCode, telegramId, username } = req.body || {};

        if (!txHash) return res.status(400).json({ error: 'txHash is required' });
        if (!walletAddress && !telegramId) return res.status(400).json({ error: 'walletAddress or telegramId required' });

        // Verify on-chain payment
        const verifier = new PaymentVerifier();
        const verification = await verifier.verifyPurchaseTx(txHash, walletAddress || undefined);
        const txRecordBase = {
            txHash,
            type: 'packagePurchase',
            amount: { value: REFERRAL_CONFIG.INVESTMENT_AMOUNT, currency: 'USDT' },
            status: verification.ok ? 'success' : 'failed',
            walletAddressFrom: verification.details?.from || null,
            walletAddressTo: verification.details?.to || process.env.TREASURY_WALLET_ADDRESS || null,
            metadata: { referralCodeProvided: referralCode || null }
        };

        if (!verification.ok) {
            try { await Transaction.create(txRecordBase); } catch {}
            return res.status(400).json({ error: 'Payment verification failed', reason: verification.reason, details: verification.details || undefined });
        }

        // Find or create user
        let user = null;
        if (walletAddress) {
            user = await User.findOne({ walletAddress });
        }
        if (!user && telegramId) {
            user = await User.findOne({ telegramId: String(telegramId) });
        }

        if (!user) {
            const newReferralCode = await ensureUniqueReferralCode();
            const businessUserId = await ensureUniqueBusinessUserId();
            user = new User({
                userId: businessUserId,
                telegramId: telegramId ? String(telegramId) : null,
                username: username || null,
                walletAddress: walletAddress || null,
                investment: REFERRAL_CONFIG.INVESTMENT_AMOUNT,
                coins: 0,
                coinLimitTotal: 300,
                coinLimitClaimed: 0,
                referralCode: newReferralCode
            });
        } else {
            // ensure fields are up to date
            if (!user.userId) user.userId = await ensureUniqueBusinessUserId();
            if (!user.referralCode) user.referralCode = await ensureUniqueReferralCode();
            if (walletAddress && !user.walletAddress) user.walletAddress = walletAddress;
            if (telegramId && !user.telegramId) user.telegramId = String(telegramId);
            if (username && user.username !== username) user.username = username;
        }

        // Link referrer if provided and not already linked
        if (referralCode && !user.referrerId) {
            const referrer = await User.findOne({ referralCode });
            if (referrer && String(referrer._id) !== String(user._id)) {
                user.referrerId = referrer._id;
                // Maintain both legacy and new arrays
                if (!Array.isArray(referrer.referrals.L1)) referrer.referrals.L1 = [];
                referrer.referrals.L1.push(user._id);
                if (!Array.isArray(referrer.directReferrals)) referrer.directReferrals = [];
                referrer.directReferrals.push(user._id);
                await referrer.save();
            }
        }

        // Activate package (12 months)
        const now = new Date();
        const expiry = new Date(now);
        expiry.setMonth(expiry.getMonth() + 12);
        user.packageActive = true;
        user.packageExpiry = expiry;
        user.tokensEntitled = 300;
        user.tokensClaimed = 0;
        user.referralLink = `${process.env.APP_URL || 'https://indempower.com'}/?ref=${user.referralCode}`;

        await user.save();

        // Record transaction
        try {
            await Transaction.create({
                ...txRecordBase,
                status: 'success',
                userId: user.userId || null,
                userObjectId: user._id
            });
        } catch {}

        // Distribute referral rewards on successful purchase
        if (user.referrerId) {
            try {
                await distributeReferralRewards(user.referrerId, user._id);
            } catch (e) {
                console.warn('Reward distribution failed but purchase succeeded:', e?.message || e);
            }
        }

        return res.status(200).json({
            activated: true,
            userId: user.userId,
            referralLink: user.referralLink,
            packageExpiry: user.packageExpiry
        });
    } catch (error) {
        console.error('Error in /purchase:', error);
        return res.status(500).json({ error: 'Failed to process purchase' });
    }
});

// Get user statistics
router.get('/users/:userId/stats', validateUserIdParam, async (req, res) => {
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
router.get('/users/:userId/monthly-claim', validateUserIdParam, async (req, res) => {
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
router.post('/users/:userId/monthly-claim', validateUserIdParam, async (req, res) => {
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

// POST /claim-tokens → Claim 25 IEPR tokens per month
router.post('/claim-tokens', validateClaimTokens, async (req, res) => {
    try {
        const { userId, walletAddress } = req.body || {};
        if (!userId && !walletAddress) return res.status(400).json({ error: 'userId or walletAddress required' });

        const user = userId
            ? await User.findById(userId)
            : await User.findOne({ walletAddress });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Check package status
        if (!user.packageActive) {
            return res.status(400).json({ error: 'Package not active. Please purchase a package first.' });
        }

        if (!user.packageExpiry || new Date(user.packageExpiry) < new Date()) {
            return res.status(400).json({ error: 'Package expired. Please renew your package.' });
        }

        const monthlyAmount = 25; // IEPR per month
        const entitled = Number(user.tokensEntitled || 300);
        const claimed = Number(user.tokensClaimed || 0);
        const remaining = Math.max(0, entitled - claimed);
        
        if (remaining <= 0) {
            return res.status(400).json({ error: 'No tokens remaining to claim' });
        }

        // Enforce monthly cadence based on lastMonthlyClaim
        const now = new Date();
        const last = user.lastMonthlyClaim ? new Date(user.lastMonthlyClaim) : null;
        let canClaim = false;
        
        if (!last || isNaN(last.getTime())) {
            // First claim - can claim immediately
            canClaim = true;
        } else {
            // Check if at least 1 month has passed
            const monthsDiff = (now.getFullYear() - last.getFullYear()) * 12 + (now.getMonth() - last.getMonth());
            canClaim = monthsDiff >= 1;
        }
        
        if (!canClaim) {
            const nextClaimDate = last ? new Date(last.getFullYear(), last.getMonth() + 1, last.getDate()) : null;
            return res.status(400).json({ 
                error: 'Monthly claim not available yet',
                nextClaimDate: nextClaimDate?.toISOString()
            });
        }

        const toClaim = Math.min(monthlyAmount, remaining);

        // Transfer IEPR (simulate by default)
        const transfer = new JettonTransferService();
        const send = await transfer.sendIEPR(user.walletAddress, toClaim);
        if (!send.ok) {
            return res.status(502).json({ error: 'Token transfer failed', reason: send.reason });
        }

        // Update user counters
        user.tokensClaimed = claimed + toClaim;
        user.lastMonthlyClaim = now;
        await user.save();

        // Record transaction
        try {
            await Transaction.create({
                txHash: send.txHash || `claim_${Date.now()}`,
                type: 'tokenClaim',
                amount: { value: toClaim, currency: 'IEPR' },
                status: 'success',
                userId: user.userId || null,
                userObjectId: user._id,
                walletAddressFrom: null,
                walletAddressTo: user.walletAddress || null,
                metadata: { monthly: true }
            });
        } catch {}

        return res.status(200).json({ claimed: toClaim, txHash: send.txHash || null, remaining: Math.max(0, entitled - user.tokensClaimed) });
    } catch (e) {
        console.error('Error in /claim-tokens:', e);
        return res.status(500).json({ error: 'Failed to claim tokens' });
    }
});

// POST /withdraw → Withdraw USDT rewards balance to user's TON wallet
router.post('/withdraw', validateWithdraw, async (req, res) => {
    try {
        const { userId, amountUSDT, toWalletAddress } = req.body || {};
        if (!userId) return res.status(400).json({ error: 'userId is required' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const amount = Number(amountUSDT);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const balance = Number(user.rewardsBalanceUSDT || 0);
        if (amount > balance) {
            return res.status(400).json({ error: 'Insufficient rewards balance' });
        }

        const destination = (toWalletAddress && String(toWalletAddress).trim()) || user.walletAddress;
        if (!destination) return res.status(400).json({ error: 'Missing destination wallet address' });

        const transfer = new JettonTransferService();
        const send = await transfer.sendUSDT(destination, amount);
        if (!send.ok) {
            return res.status(502).json({ error: 'Withdraw transfer failed', reason: send.reason });
        }

        user.rewardsBalanceUSDT = Math.max(0, balance - amount);
        await user.save();

        try {
            await Transaction.create({
                txHash: send.txHash || `wd_${Date.now()}`,
                type: 'rewardWithdraw',
                amount: { value: amount, currency: 'USDT' },
                status: 'success',
                userId: user.userId || null,
                userObjectId: user._id,
                walletAddressFrom: null,
                walletAddressTo: destination,
                metadata: { requestedAmount: amount }
            });
        } catch {}

        return res.status(200).json({ withdrawn: amount, txHash: send.txHash || null, balance: user.rewardsBalanceUSDT });
    } catch (e) {
        console.error('Error in /withdraw:', e);
        return res.status(500).json({ error: 'Failed to process withdrawal' });
    }
});

// GET /dashboard → profile, tokens, rewards, referrals snapshot
router.get('/dashboard', validateDashboard, async (req, res) => {
    try {
        const { userId, walletAddress } = req.query || {};
        if (!userId && !walletAddress) return res.status(400).json({ error: 'userId or walletAddress required' });

        let user = userId
            ? await User.findById(userId)
            : await User.findOne({ walletAddress });
        // Auto-create a minimal user when queried by walletAddress and not found, so clients can obtain referral link
        if (!user && walletAddress) {
            try {
                const newReferralCode = await ensureUniqueReferralCode();
                user = new User({
                    walletAddress,
                    referralCode: newReferralCode,
                    packageActive: false,
                    packageExpiry: null,
                    tokensEntitled: 300,
                    tokensClaimed: 0,
                    rewardsBalanceUSDT: 0
                });
                await user.save();
            } catch (creationErr) {
                console.error('Failed to auto-create user on /dashboard:', creationErr);
            }
        }
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Compute monthly claimable IEPR
        const now = new Date();
        const last = user.lastMonthlyClaim ? new Date(user.lastMonthlyClaim) : null;
        let canClaim = false;
        if (!last || isNaN(last.getTime())) {
            canClaim = true;
        } else {
            const months = (now.getFullYear() - last.getFullYear()) * 12 + (now.getMonth() - last.getMonth());
            canClaim = Number.isFinite(months) && months >= 1;
        }
        const entitled = Number(user.tokensEntitled || 300);
        const claimed = Number(user.tokensClaimed || 0);
        const remainingTokens = Math.max(0, entitled - claimed);
        const monthlyClaimable = canClaim ? Math.min(REFERRAL_CONFIG.MONTHLY_BASE_COINS, remainingTokens) : 0;

        // Referral counts
        const l1Count = Array.isArray(user.directReferrals) ? user.directReferrals.length : 0;
        const l2Count = Array.isArray(user.indirectReferrals) ? user.indirectReferrals.length : 0;

        // Always compute referralLink from referralCode as a fallback so clients can show/share it
        const computedReferralLink = `${process.env.APP_URL || 'https://indempower.com'}/?ref=${user.referralCode}`;
        const profile = {
            userId: user.userId,
            walletAddress: user.walletAddress,
            referralLink: user.referralLink || computedReferralLink,
            packageActive: !!user.packageActive,
            packageExpiry: user.packageExpiry
        };
        const tokens = {
            entitled,
            claimed,
            monthlyClaimable,
            remaining: remainingTokens,
            lastMonthlyClaim: user.lastMonthlyClaim || null
        };
        const rewards = {
            balanceUSDT: Number(user.rewardsBalanceUSDT || 0)
        };
        const referrals = {
            level1Count: l1Count,
            level2Count: l2Count
        };

        return res.json({ profile, tokens, rewards, referrals });
    } catch (e) {
        console.error('Error in /dashboard:', e);
        return res.status(500).json({ error: 'Failed to load dashboard' });
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
        
        const referralLink = `${process.env.APP_URL || 'https://indempower.com'}/?ref=${user.referralCode}`;
        res.json({ 
            referralLink,
            referralCode: user.referralCode
        });
    } catch (error) {
        console.error('Error getting referral link:', error);
        res.status(500).json({ error: 'Failed to get referral link' });
    }
});

// Package renewal endpoint
router.post('/renew-package', validatePurchase, async (req, res) => {
    try {
        const { walletAddress, txHash, userId } = req.body || {};

        if (!txHash) return res.status(400).json({ error: 'txHash is required' });
        if (!walletAddress && !userId) return res.status(400).json({ error: 'walletAddress or userId required' });

        // Verify on-chain payment
        const verifier = new PaymentVerifier();
        const verification = await verifier.verifyPurchaseTx(txHash, walletAddress || undefined);
        
        if (!verification.ok) {
            return res.status(400).json({ error: 'Payment verification failed', reason: verification.reason });
        }

        // Find user
        const user = userId
            ? await User.findById(userId)
            : await User.findOne({ walletAddress });
        
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Check if package is expired
        if (user.packageActive && user.packageExpiry && new Date(user.packageExpiry) > new Date()) {
            return res.status(400).json({ error: 'Package is still active. Cannot renew yet.' });
        }

        // Renew package (12 months from now)
        const now = new Date();
        const expiry = new Date(now);
        expiry.setMonth(expiry.getMonth() + 12);
        
        user.packageActive = true;
        user.packageExpiry = expiry;
        user.tokensEntitled = 300; // Reset token entitlement
        user.tokensClaimed = 0; // Reset claimed tokens
        user.lastMonthlyClaim = null; // Reset monthly claim timer

        await user.save();

        // Record transaction
        try {
            await Transaction.create({
                txHash,
                type: 'packagePurchase',
                amount: { value: REFERRAL_CONFIG.INVESTMENT_AMOUNT, currency: 'USDT' },
                status: 'success',
                userId: user.userId || null,
                userObjectId: user._id,
                walletAddressFrom: verification.details?.from || null,
                walletAddressTo: verification.details?.to || process.env.TREASURY_WALLET_ADDRESS || null,
                metadata: { renewal: true }
            });
        } catch {}

        return res.status(200).json({
            renewed: true,
            userId: user.userId,
            packageExpiry: user.packageExpiry,
            tokensEntitled: user.tokensEntitled
        });
    } catch (error) {
        console.error('Error in /renew-package:', error);
        return res.status(500).json({ error: 'Failed to renew package' });
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
        
        console.log('Processing referral:', { telegramId, referralCode, username });
        
        if (!telegramId) {
            return res.status(400).json({ error: 'Telegram ID is required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ telegramId });
        if (existingUser) {
            console.log('User already exists:', existingUser._id);
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
                console.log('Found referrer:', referrerId, 'for code:', referralCode);
            } else {
                console.log('Referrer not found for code:', referralCode);
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
        console.log('Created new user:', user._id, 'with referrer:', referrerId);

        // Process referral rewards if user has a referrer
        if (referrerId) {
            console.log('Processing referral rewards for referrer:', referrerId, 'new user:', user._id);
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

// Distribute referral rewards for purchase (L1 and L2)
async function distributeReferralRewards(referrerId, newUserId) {
    try {
        const l1 = await User.findById(referrerId);
        if (!l1) return false;

        // Add to L1 referrals
        if (!l1.directReferrals.includes(newUserId)) {
            l1.directReferrals.push(newUserId);
        }
        if (!l1.referrals.L1.includes(newUserId)) {
            l1.referrals.L1.push(newUserId);
        }

        // Calculate L1 reward (20% of $30 = $6)
        const l1Base = REFERRAL_CONFIG.INVESTMENT_AMOUNT * REFERRAL_CONFIG.L1_REWARD_PERCENTAGE / 100;
        const l1Bonus = l1.leadershipStatus ? (REFERRAL_CONFIG.INVESTMENT_AMOUNT * REFERRAL_CONFIG.LEADERSHIP_BONUS_PERCENTAGE / 100) : 0;
        const l1Total = l1Base + l1Bonus;
        
        l1.rewardsBalanceUSDT = Number(l1.rewardsBalanceUSDT || 0) + l1Total;
        l1.earnings += l1Total;
        l1.totalEarnings += l1Total;

        // Check leadership status (5+ direct referrals)
        if (!l1.leadershipStatus && l1.directReferrals.length >= REFERRAL_CONFIG.LEADERSHIP_THRESHOLD) {
            l1.leadershipStatus = true;
        }

        await l1.save();

        // Process L2 referral (referrer's referrer)
        if (l1.referrerId) {
            const l2 = await User.findById(l1.referrerId);
            if (l2) {
                // Add to L2 referrals
                if (!l2.indirectReferrals.includes(newUserId)) {
                    l2.indirectReferrals.push(newUserId);
                }
                if (!l2.referrals.L2.includes(newUserId)) {
                    l2.referrals.L2.push(newUserId);
                }

                // Calculate L2 reward (10% of $30 = $3)
                const l2Base = REFERRAL_CONFIG.INVESTMENT_AMOUNT * REFERRAL_CONFIG.L2_REWARD_PERCENTAGE / 100;
                const l2Bonus = l2.leadershipStatus ? (REFERRAL_CONFIG.INVESTMENT_AMOUNT * REFERRAL_CONFIG.LEADERSHIP_BONUS_PERCENTAGE / 100) : 0;
                const l2Total = l2Base + l2Bonus;
                
                l2.rewardsBalanceUSDT = Number(l2.rewardsBalanceUSDT || 0) + l2Total;
                l2.earnings += l2Total;
                l2.totalEarnings += l2Total;

                // Check leadership status for L2
                if (!l2.leadershipStatus && l2.directReferrals.length >= REFERRAL_CONFIG.LEADERSHIP_THRESHOLD) {
                    l2.leadershipStatus = true;
                }

                await l2.save();
            }
        }

        return true;
    } catch (error) {
        console.error('Error distributing referral rewards:', error);
        return false;
    }
}

// Process referral rewards when a new user joins (legacy function)
async function processReferralRewards(referrerId, newUserId) {
    try {
        console.log('processReferralRewards called with:', { referrerId, newUserId });
        
        const referrer = await User.findById(referrerId);
        if (!referrer) {
            console.log('Referrer not found:', referrerId);
            return false;
        }

        console.log('Referrer found:', referrer._id, 'Current L1 count:', referrer.referrals.L1.length);

        // Add new user to referrer's L1 referrals
        referrer.referrals.L1.push(newUserId);
        if (!referrer.directReferrals.includes(newUserId)) {
            referrer.directReferrals.push(newUserId);
        }
        await referrer.save();
        
        console.log('Added new user to L1 referrals. New L1 count:', referrer.referrals.L1.length);

        // Calculate and distribute L1 reward (20% of $30 = $6)
        const l1Reward = REFERRAL_CONFIG.INVESTMENT_AMOUNT * REFERRAL_CONFIG.L1_REWARD_PERCENTAGE / 100;
        referrer.rewardsBalanceUSDT = Number(referrer.rewardsBalanceUSDT || 0) + l1Reward;
        // Keep earnings as informational USD earnings if desired
        referrer.earnings += l1Reward;
        referrer.totalEarnings += l1Reward;
        await referrer.save();
        
        console.log('Updated referrer earnings:', {
            earnings: referrer.earnings,
            totalEarnings: referrer.totalEarnings,
            rewardsBalanceUSDT: referrer.rewardsBalanceUSDT
        });

        // Leadership toggle when 5 active directs
        const l1Count = referrer.directReferrals.length;
        if (!referrer.leadershipStatus && l1Count >= REFERRAL_CONFIG.LEADERSHIP_THRESHOLD) {
            referrer.leadershipStatus = true;
            await referrer.save();
        }

        console.log('Referral rewards processed successfully');
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
        // No milestone coin changes per new spec; L2 rewards are per-purchase via second-level processing

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
