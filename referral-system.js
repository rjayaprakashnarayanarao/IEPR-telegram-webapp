// Referral System Configuration
const REFERRAL_CONFIG = {
    LEVEL_1_CAPACITY: 3,
    LEVEL_2_CAPACITY: 9,
    LEVEL_3_CAPACITY: 27,
    MAX_LEVELS: 3
};

// User Management System
class ReferralSystem {
    constructor() {
        this.users = new Map();
        this.trees = new Map();
        this.nextUserId = 1;
        this.nextTreeId = 1;
        this.loadFromStorage();
    }

    // Create a new user
    createUser(telegramId = null, referrerId = null) {
        const userId = this.nextUserId++;
        const user = {
            id: userId,
            telegramId: telegramId,
            referrerId: referrerId,
            level: 0,
            treeId: null,
            position: null,
            joinDate: new Date().toISOString(),
            earnings: 0,
            referrals: {
                L1: [],
                L2: [],
                L3: []
            }
        };

        this.users.set(userId, user);
        
        if (referrerId) {
            this.addReferral(referrerId, userId);
        } else {
            this.placeUserInTree(userId);
        }

        this.saveToStorage();
        return user;
    }

    // Add referral to existing user
    addReferral(referrerId, newUserId) {
        const referrer = this.users.get(referrerId);
        const newUser = this.users.get(newUserId);
        
        if (!referrer || !newUser) return false;

        // Find available position in referrer's tree
        const position = this.findAvailablePosition(referrerId);
        
        if (position) {
            newUser.treeId = referrer.treeId;
            newUser.level = position.level;
            newUser.position = position.position;
            
            // Add to referrer's referral list
            referrer.referrals[`L${position.level}`].push(newUserId);
            
            // Update tree structure
            this.updateTreeStructure(referrer.treeId, position, newUserId);
        } else {
            // If no position available, place in new tree
            this.placeUserInTree(newUserId);
        }

        this.saveToStorage();
        return true;
    }

    // Find available position in user's tree
    findAvailablePosition(userId, maxDepth = 3) {
        const user = this.users.get(userId);
        if (!user) return null;

        const tree = this.trees.get(user.treeId);
        if (!tree) return null;

        // Check each level for available positions
        for (let level = 1; level <= maxDepth; level++) {
            const levelKey = `L${level}`;
            const levelCapacity = REFERRAL_CONFIG[`LEVEL_${level}_CAPACITY`];
            
            if (user.referrals[levelKey].length < levelCapacity) {
                return {
                    level: level,
                    position: user.referrals[levelKey].length + 1
                };
            }
        }

        return null;
    }

    // Place user in available tree or create new one
    placeUserInTree(userId) {
        const user = this.users.get(userId);
        if (!user) return;

        // Find tree with available space
        let availableTree = null;
        for (const [treeId, tree] of this.trees) {
            if (tree.members.length < REFERRAL_CONFIG.LEVEL_1_CAPACITY) {
                availableTree = tree;
                break;
            }
        }

        if (!availableTree) {
            // Create new tree
            availableTree = this.createNewTree();
        }

        // Place user in tree
        user.treeId = availableTree.id;
        user.level = 0; // Root level
        user.position = availableTree.members.length + 1;
        availableTree.members.push(userId);

        this.saveToStorage();
    }

    // Create new tree
    createNewTree() {
        const treeId = this.nextTreeId++;
        const tree = {
            id: treeId,
            members: [],
            createdDate: new Date().toISOString(),
            level: 0
        };
        
        this.trees.set(treeId, tree);
        return tree;
    }

    // Update tree structure
    updateTreeStructure(treeId, position, userId) {
        const tree = this.trees.get(treeId);
        if (!tree) return;

        // Add user to tree at specified position
        tree.members.push(userId);
    }

    // Get user's referral statistics
    getUserStats(userId) {
        const user = this.users.get(userId);
        if (!user) return null;

        return {
            totalReferrals: user.referrals.L1.length + user.referrals.L2.length + user.referrals.L3.length,
            level1Count: user.referrals.L1.length,
            level2Count: user.referrals.L2.length,
            level3Count: user.referrals.L3.length,
            earnings: user.earnings,
            treeId: user.treeId,
            level: user.level
        };
    }

    // Get users by level for display
    getUsersByLevel(userId, level) {
        const user = this.users.get(userId);
        if (!user) return [];

        const levelKey = `L${level}`;
        const referralIds = user.referrals[levelKey];
        
        return referralIds.map(id => {
            const referralUser = this.users.get(id);
            if (!referralUser) return null;
            
            return {
                id: referralUser.id,
                name: `User ${referralUser.id}`,
                telegramId: referralUser.telegramId,
                joined: this.formatJoinDate(referralUser.joinDate),
                earnings: `${referralUser.earnings.toFixed(2)} TON`,
                level: referralUser.level
            };
        }).filter(Boolean);
    }

    // Format join date
    formatJoinDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) return '1 day ago';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        return `${Math.floor(diffDays / 30)} months ago`;
    }

    // Save to localStorage
    saveToStorage() {
        try {
            const data = {
                users: Array.from(this.users.entries()),
                trees: Array.from(this.trees.entries()),
                nextUserId: this.nextUserId,
                nextTreeId: this.nextTreeId
            };
            localStorage.setItem('referralSystem', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save referral system data:', error);
        }
    }

    // Load from localStorage
    loadFromStorage() {
        try {
            const data = localStorage.getItem('referralSystem');
            if (data) {
                const parsed = JSON.parse(data);
                this.users = new Map(parsed.users);
                this.trees = new Map(parsed.trees);
                this.nextUserId = parsed.nextUserId || 1;
                this.nextTreeId = parsed.nextTreeId || 1;
            }
        } catch (error) {
            console.error('Failed to load referral system data:', error);
        }
    }

    // Telegram integration methods
    createUserFromTelegram(telegramId, referrerId = null) {
        // Check if user already exists
        for (const [userId, user] of this.users) {
            if (user.telegramId === telegramId) {
                return user;
            }
        }
        
        return this.createUser(telegramId, referrerId);
    }

    // Get referral link for user
    getReferralLink(userId) {
        return `https://t.me/your_bot_username?start=ref_${userId}`;
    }

    // Process Telegram start parameter
    processTelegramStart(startParam) {
        if (startParam && startParam.startsWith('ref_')) {
            const referrerId = parseInt(startParam.substring(4));
            return referrerId;
        }
        return null;
    }
}

// Initialize referral system
const referralSystem = new ReferralSystem();

// Telegram Bot Integration Helper Functions
window.telegramIntegration = {
    // Initialize bot when user starts the bot
    initBot: function(telegramId, startParam) {
        const referrerId = referralSystem.processTelegramStart(startParam);
        const user = referralSystem.createUserFromTelegram(telegramId, referrerId);
        return user;
    },
    
    // Get user's referral link
    getReferralLink: function(telegramId) {
        for (const [userId, user] of referralSystem.users) {
            if (user.telegramId === telegramId) {
                return referralSystem.getReferralLink(userId);
            }
        }
        return null;
    },
    
    // Get user's referral stats
    getUserStats: function(telegramId) {
        for (const [userId, user] of referralSystem.users) {
            if (user.telegramId === telegramId) {
                return referralSystem.getUserStats(userId);
            }
        }
        return null;
    },
    
    // Add referral to user
    addReferral: function(telegramId, newUserTelegramId) {
        let referrerId = null;
        for (const [userId, user] of referralSystem.users) {
            if (user.telegramId === telegramId) {
                referrerId = userId;
                break;
            }
        }
        
        if (referrerId) {
            const newUser = referralSystem.createUserFromTelegram(newUserTelegramId, referrerId);
            return newUser;
        }
        return null;
    }
};

// Export for use in other files
window.referralSystem = referralSystem;
