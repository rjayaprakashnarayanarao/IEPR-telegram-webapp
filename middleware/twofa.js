const otplib = require('otplib');
const AdminUser = require('../models/AdminUser');

async function verifyTwoFA(req, res, next) {
    try {
        const { username, token } = req.body || req.query || {};
        if (!username || !token) return res.status(400).json({ error: '2FA required' });
        const admin = await AdminUser.findOne({ username });
        if (!admin || !admin.twoFAEnabled || !admin.twoFASecret) return res.status(401).json({ error: 'Invalid 2FA' });
        const isValid = otplib.authenticator.check(String(token), admin.twoFASecret);
        if (!isValid) return res.status(401).json({ error: 'Invalid 2FA token' });
        req.twofa = { username };
        next();
    } catch (e) {
        return res.status(401).json({ error: '2FA validation failed' });
    }
}

module.exports = { verifyTwoFA };


