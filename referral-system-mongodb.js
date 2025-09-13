// MongoDB-based Referral System
class ReferralSystemMongoDB {
    constructor() {
        // Use current origin by default so it works behind Cloudflare Tunnel/HTTPS
        try {
            const origin = window.location && window.location.origin ? window.location.origin : '';
            const override = window.__API_BASE__ || '';
            this.apiBase = (override || `${origin}/api/referrals`).replace(/\/$/, '');
        } catch (e) {
            this.apiBase = 'http://localhost:3000/api/referrals';
        }
        this.currentUserId = null;
        try {
            const storedId = localStorage.getItem('currentUserId');
            if (storedId) {
                this.currentUserId = storedId;
            }
        } catch {}
    }

    // Create a new user
    async createUser(telegramId = null, referrerId = null, username = null) {
        try {
            const response = await fetch(`${this.apiBase}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    telegramId,
                    referrerId,
                    username
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create user');
            }

            const user = await response.json();
            if (!this.currentUserId) {
                this.currentUserId = user._id;
                try { localStorage.setItem('currentUserId', this.currentUserId); } catch {}
            }
            return user;
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    // Get user statistics
    async getUserStats(userId = this.currentUserId) {
        try {
            const response = await fetch(`${this.apiBase}/users/${userId}/stats`);
            if (response.status === 404) {
                // User not found: clear stale current user
                try { localStorage.removeItem('currentUserId'); } catch {}
                this.currentUserId = null;
                return null;
            }
            if (!response.ok) {
                throw new Error('Failed to get user stats');
            }
            return await response.json();
        } catch (error) {
            console.error('Error getting user stats:', error);
            return null;
        }
    }

    // Get users by level
    async getUsersByLevel(userId, level) {
        try {
            const response = await fetch(`${this.apiBase}/users/${userId}/level/${level}`);
            if (!response.ok) {
                throw new Error('Failed to get users by level');
            }
            return await response.json();
        } catch (error) {
            console.error('Error getting users by level:', error);
            return [];
        }
    }

    // Get referral link
    async getReferralLink(userId = this.currentUserId) {
        try {
            if (!userId) {
                console.warn('getReferralLink: no current user');
                return null;
            }
            const response = await fetch(`${this.apiBase}/users/${userId}/referral-link`);
            if (response.status === 404) {
                try { localStorage.removeItem('currentUserId'); } catch {}
                this.currentUserId = null;
                return null;
            }
            if (!response.ok) {
                throw new Error('Failed to get referral link');
            }
            const data = await response.json();
            return data.referralLink;
        } catch (error) {
            console.error('Error getting referral link:', error);
            return null;
        }
    }

    // Monthly claim status
    async getMonthlyClaimStatus(userId = this.currentUserId) {
        try {
            const response = await fetch(`${this.apiBase}/users/${userId}/monthly-claim`);
            if (response.status === 404) {
                try { localStorage.removeItem('currentUserId'); } catch {}
                this.currentUserId = null;
                return null;
            }
            if (!response.ok) throw new Error('Failed to get monthly claim');
            return await response.json();
        } catch (error) {
            console.error('Error getting monthly claim:', error);
            return null;
        }
    }

    // Claim monthly coins
    async claimMonthlyCoins(userId = this.currentUserId) {
        try {
            const response = await fetch(`${this.apiBase}/users/${userId}/monthly-claim`, {
                method: 'POST'
            });
            if (!response.ok) throw new Error('Failed to claim monthly coins');
            return await response.json();
        } catch (error) {
            console.error('Error claiming monthly coins:', error);
            throw error;
        }
    }

    // Process referral code (for Telegram integration)
    async processReferral(telegramId, referralCode = null, username = null) {
        try {
            const response = await fetch(`${this.apiBase}/process-referral`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    telegramId,
                    referralCode,
                    username
                })
            });

            if (!response.ok) {
                throw new Error('Failed to process referral');
            }

            const data = await response.json();
            
            // Always set current user from API response
            if (data && data.user && data.user._id) {
                this.currentUserId = data.user._id;
                try { localStorage.setItem('currentUserId', this.currentUserId); } catch {}
            }
            
            return data;
        } catch (error) {
            console.error('Error processing referral:', error);
            throw error;
        }
    }

    // Get all users (for admin)
    async getAllUsers() {
        try {
            const response = await fetch(`${this.apiBase}/users`);
            if (!response.ok) {
                throw new Error('Failed to get all users');
            }
            return await response.json();
        } catch (error) {
            console.error('Error getting all users:', error);
            return [];
        }
    }

    // Update user's wallet info
    async updateUserWallet(userId = this.currentUserId, walletInfo = {}) {
        try {
            if (!userId) throw new Error('No user id');
            const response = await fetch(`${this.apiBase}/users/${userId}/wallet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(walletInfo)
            });
            if (!response.ok) throw new Error('Failed to update wallet');
            return await response.json();
        } catch (e) {
            console.error('Error updating user wallet:', e);
            throw e;
        }
    }

    // Get all trees (for admin)
    async getAllTrees() {
        try {
            const response = await fetch(`${this.apiBase}/trees`);
            if (!response.ok) {
                throw new Error('Failed to get all trees');
            }
            return await response.json();
        } catch (error) {
            console.error('Error getting all trees:', error);
            return [];
        }
    }

    // Set current user ID
    setCurrentUser(userId) {
        this.currentUserId = userId;
        try { localStorage.setItem('currentUserId', this.currentUserId); } catch {}
    }

    // Get current user ID
    getCurrentUser() {
        return this.currentUserId;
    }

    // Ensure there is a current user; do not create or auto-select in production
    async ensureCurrentUser() {
        if (this.currentUserId) return this.currentUserId;
        try {
            const users = await this.getAllUsers();
            if (Array.isArray(users) && users.length > 0) {
                // In real mode, do not auto-pick a user silently
                return null;
            }
            return null;
        } catch (e) {
            console.error('ensureCurrentUser failed:', e);
            return null;
        }
    }
}

// Initialize MongoDB referral system
const referralSystemMongoDB = new ReferralSystemMongoDB();

// Export for use in other files
window.referralSystemMongoDB = referralSystemMongoDB;
