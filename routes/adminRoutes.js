const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { requireAuth, requireRole } = require('../middleware/auth');
const { audit } = require('../middleware/audit');
const { OTPService } = require('../services/otpService');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AdminUser = require('../models/AdminUser');

const otpService = new OTPService();

// Send OTP to admin phone number
router.post('/send-otp', async (req, res) => {
    try {
        const { phoneNumber } = req.body || {};
        if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });

        if (!otpService.isAdminPhone(phoneNumber)) {
            return res.status(403).json({ error: 'Unauthorized phone number' });
        }

        const result = await otpService.sendOTP(phoneNumber);
        if (result.success) {
            res.json({ message: 'OTP sent successfully' });
        } else {
            res.status(400).json({ error: result.message });
        }
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// Verify OTP and login
router.post('/verify-otp', async (req, res) => {
    try {
        const { phoneNumber, otp } = req.body || {};
        if (!phoneNumber || !otp) return res.status(400).json({ error: 'Phone number and OTP are required' });

        if (!otpService.isAdminPhone(phoneNumber)) {
            return res.status(403).json({ error: 'Unauthorized phone number' });
        }

        const verification = otpService.verifyOTP(phoneNumber, otp);
        if (!verification.valid) {
            return res.status(401).json({ error: verification.reason });
        }

        // Create or update admin user
        let admin = await AdminUser.findOne({ username: 'admin' });
        if (!admin) {
            admin = new AdminUser({
                username: 'admin',
                role: 'admin',
                createdBy: 'otp-system'
            });
        }
        
        admin.lastLoginAt = new Date();
        await admin.save();

        // Generate JWT token
        const payload = { username: admin.username, role: admin.role, phoneNumber };
        const jwtToken = jwt.sign(payload, process.env.ADMIN_JWT_SECRET || 'change-me', { expiresIn: '8h' });
        
        res.json({ 
            token: jwtToken,
            message: 'Login successful'
        });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ error: 'Failed to verify OTP' });
    }
});

// Admin: list users
router.get('/users', requireAuth, requireRole('admin'), audit('list_users', 'users'), async (req, res) => {
    try {
        const { q, page = 1, limit = 50 } = req.query;
        const filter = {};
        if (q) {
            filter.$or = [
                { userId: new RegExp(q, 'i') },
                { walletAddress: new RegExp(q, 'i') },
                { username: new RegExp(q, 'i') },
                { telegramId: new RegExp(q, 'i') }
            ];
        }
        const skip = (Number(page) - 1) * Number(limit);
        const [users, total] = await Promise.all([
            User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
            User.countDocuments(filter)
        ]);
        res.json({ users, total, page: Number(page), limit: Number(limit) });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Admin: list payments/transactions
router.get('/payments', requireAuth, requireRole('admin'), audit('list_payments', 'transactions'), async (req, res) => {
    try {
        const { type, status, page = 1, limit = 50 } = req.query;
        const filter = {};
        if (type) filter.type = type;
        if (status) filter.status = status;
        const skip = (Number(page) - 1) * Number(limit);
        const [transactions, total] = await Promise.all([
            Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
            Transaction.countDocuments(filter)
        ]);
        res.json({ transactions, total, page: Number(page), limit: Number(limit) });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

// Admin: get system stats
router.get('/stats', requireAuth, requireRole('admin'), audit('view_stats', 'system'), async (req, res) => {
    try {
        const [
            totalUsers,
            activeUsers,
            totalTransactions,
            totalRevenue,
            totalReferrals
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ packageActive: true }),
            Transaction.countDocuments({ status: 'success' }),
            Transaction.aggregate([
                { $match: { type: 'packagePurchase', status: 'success' } },
                { $group: { _id: null, total: { $sum: '$amount.value' } } }
            ]),
            User.aggregate([
                { $group: { _id: null, total: { $sum: { $size: '$directReferrals' } } } }
            ])
        ]);

        res.json({
            totalUsers,
            activeUsers,
            totalTransactions,
            totalRevenue: totalRevenue[0]?.total || 0,
            totalReferrals: totalReferrals[0]?.total || 0
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Admin: update user package status
router.post('/users/:userId/package', requireAuth, requireRole('admin'), audit('update_user_package', 'users'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { active, expiry } = req.body;
        
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (active !== undefined) user.packageActive = active;
        if (expiry) user.packageExpiry = new Date(expiry);

        await user.save();
        res.json({ success: true, user: { packageActive: user.packageActive, packageExpiry: user.packageExpiry } });
    } catch (e) {
        res.status(500).json({ error: 'Failed to update user package' });
    }
});

// Admin: manual token distribution
router.post('/users/:userId/tokens', requireAuth, requireRole('admin'), audit('manual_token_distribution', 'users'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { amount, reason } = req.body;
        
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.tokensClaimed = (user.tokensClaimed || 0) + amount;
        await user.save();

        // Record transaction
        await Transaction.create({
            txHash: `admin_${Date.now()}`,
            type: 'tokenClaim',
            amount: { value: amount, currency: 'IEPR' },
            status: 'success',
            userId: user.userId,
            userObjectId: user._id,
            metadata: { admin: true, reason: reason || 'Manual distribution' }
        });

        res.json({ success: true, tokensClaimed: user.tokensClaimed });
    } catch (e) {
        res.status(500).json({ error: 'Failed to distribute tokens' });
    }
});

module.exports = router;


