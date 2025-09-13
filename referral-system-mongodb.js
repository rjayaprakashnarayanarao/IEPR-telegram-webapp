// MongoDB-based Referral System
class ReferralSystemMongoDB {
    constructor() {
        // Set API base URL
        try {
            const origin = window.location?.origin || '';
            const override = window.__API_BASE__ || '';
            this.apiBase = (override || `${origin}/api/referrals`).replace(/\/$/, '');
        } catch {
            this.apiBase = 'http://localhost:3000/api/referrals';
        }
        
        // Load current user from localStorage
        this.currentUserId = null;
        try {
            this.currentUserId = localStorage.getItem('currentUserId');
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
                this.setCurrentUser(user._id);
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
                this.setCurrentUser(null);
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
                this.setCurrentUser(null);
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
                this.setCurrentUser(null);
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
            if (data?.user?._id) {
                this.setCurrentUser(data.user._id);
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
        } catch (error) {
            console.error('Error updating user wallet:', error);
            throw error;
        }
    }


    // Set current user ID
    setCurrentUser(userId) {
        this.currentUserId = userId;
        try {
            if (userId) {
                localStorage.setItem('currentUserId', userId);
            } else {
                localStorage.removeItem('currentUserId');
            }
        } catch {}
    }

    // Get current user ID
    getCurrentUser() {
        return this.currentUserId;
    }

}

// Initialize MongoDB referral system
const referralSystemMongoDB = new ReferralSystemMongoDB();

// Export for use in other files
window.referralSystemMongoDB = referralSystemMongoDB;
