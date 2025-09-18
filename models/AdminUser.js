const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'auditor'], default: 'admin', index: true },
    twoFAEnabled: { type: Boolean, default: true },
    twoFASecret: { type: String, default: null },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: String, default: 'system' }
}, { timestamps: true });

module.exports = mongoose.model('AdminUser', adminUserSchema);


