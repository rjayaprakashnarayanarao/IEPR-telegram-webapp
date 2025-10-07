/**
 * OTP Service for Admin Login
 * Handles OTP generation, storage, and verification
 */

const crypto = require('crypto');

class OTPService {
    constructor() {
        this.otpStore = new Map(); // In production, use Redis or database
        this.otpExpiry = 5 * 60 * 1000; // 5 minutes
        this.adminPhoneNumber = '9390866948';
    }

    /**
     * Generate a 6-digit OTP
     */
    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    /**
     * Store OTP with expiry
     */
    storeOTP(phoneNumber, otp) {
        const expiry = Date.now() + this.otpExpiry;
        this.otpStore.set(phoneNumber, { otp, expiry });
        
        // Clean up expired OTPs
        setTimeout(() => {
            this.otpStore.delete(phoneNumber);
        }, this.otpExpiry);
    }

    /**
     * Verify OTP
     */
    verifyOTP(phoneNumber, otp) {
        const stored = this.otpStore.get(phoneNumber);
        if (!stored) {
            return { valid: false, reason: 'OTP not found or expired' };
        }

        if (Date.now() > stored.expiry) {
            this.otpStore.delete(phoneNumber);
            return { valid: false, reason: 'OTP expired' };
        }

        if (stored.otp !== otp) {
            return { valid: false, reason: 'Invalid OTP' };
        }

        // OTP is valid, remove it
        this.otpStore.delete(phoneNumber);
        return { valid: true };
    }

    /**
     * Send OTP to admin phone number
     * In production, integrate with SMS service like Twilio, AWS SNS, etc.
     */
    async sendOTP(phoneNumber) {
        if (phoneNumber !== this.adminPhoneNumber) {
            return { success: false, message: 'Unauthorized phone number' };
        }

        const otp = this.generateOTP();
        this.storeOTP(phoneNumber, otp);

        // For development, we'll log the OTP to console
        // In production, send actual SMS
        console.log(`\n📱 OTP for ${phoneNumber}: ${otp}`);
        console.log('⏰ OTP expires in 5 minutes');
        console.log('🔐 Use this code to login to admin panel\n');

        return { 
            success: true, 
            message: 'OTP sent successfully',
            otp: otp // Only for development - remove in production
        };
    }

    /**
     * Check if phone number is admin
     */
    isAdminPhone(phoneNumber) {
        return phoneNumber === this.adminPhoneNumber;
    }
}

module.exports = { OTPService };
