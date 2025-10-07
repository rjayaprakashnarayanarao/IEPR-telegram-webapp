const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ['admin', 'auditor'], default: 'admin', index: true },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: String, default: 'system' }
}, { timestamps: true });

module.exports = mongoose.model('AdminUser', adminUserSchema);


