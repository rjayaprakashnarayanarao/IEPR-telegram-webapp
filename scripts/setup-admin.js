#!/usr/bin/env node

/**
 * Admin Setup Script for IND EMPOWER
 * Creates initial admin user with 2FA
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const AdminUser = require('../models/AdminUser');
require('dotenv').config();

async function setupAdmin() {
    try {
        // Connect to MongoDB
        const MONGODB_URI = process.env.MONGODB_URI;
        if (!MONGODB_URI) {
            console.error('MONGODB_URI is required');
            process.exit(1);
        }

        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        // Check if admin already exists
        const existingAdmin = await AdminUser.findOne({ username: 'admin' });
        if (existingAdmin) {
            console.log('Admin user already exists');
            process.exit(0);
        }

        // Generate 2FA secret
        const twoFASecret = authenticator.generateSecret();
        const twoFAQR = authenticator.keyuri('admin', 'IND EMPOWER', twoFASecret);

        // Hash password
        const password = process.env.ADMIN_PASSWORD || 'admin123';
        const passwordHash = await bcrypt.hash(password, 12);

        // Create admin user
        const admin = new AdminUser({
            username: 'admin',
            passwordHash,
            role: 'admin',
            twoFAEnabled: true,
            twoFASecret,
            createdBy: 'setup-script'
        });

        await admin.save();

        console.log('✅ Admin user created successfully!');
        console.log('Username: admin');
        console.log('Password:', password);
        console.log('2FA Secret:', twoFASecret);
        console.log('2FA QR Code URL:', twoFAQR);
        console.log('\n📱 Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)');
        console.log('🔐 Use the 6-digit code for 2FA login');

    } catch (error) {
        console.error('Error setting up admin:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

setupAdmin();
