// Enhanced Tab Navigation with smooth transitions
const screens = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.nav-btn');

// Enhanced user data with new 2-level referral system integration
const levelUsers = {
    L1: [],
    L2: []
};

// Ensure there is a user selected/created (dev-friendly)
function setReferralLinkMessage(message) {
    try {
        const anchor = document.getElementById('referralLinkAnchor');
        if (anchor) {
            anchor.textContent = message;
            anchor.removeAttribute('href');
        } else {
            const linkTextElement = document.querySelector('.link-text');
            if (linkTextElement) linkTextElement.textContent = message;
        }
    } catch {}
}

async function ensureUserExists() {
    try {
        let currentUserId = window.referralSystemMongoDB.getCurrentUser();
        if (currentUserId) return currentUserId;
        
        // Don't create users in Telegram WebApp context - that should be handled by Telegram integration
        if (window.Telegram && window.Telegram.WebApp) {
            console.log('ensureUserExists: Skipping user creation in Telegram WebApp context');
            return null;
        }
        
        // For non-Telegram contexts, create a basic user
        const user = await window.referralSystemMongoDB.createUser(null, null, null);
        return user && user._id ? user._id : window.referralSystemMongoDB.getCurrentUser();
    } catch (e) {
        console.warn('ensureUserExists failed:', e);
        // If API is not ready (e.g., 503 from guarded backend), inform the user visibly
        setReferralLinkMessage('Server initializing. Please try again shortly.');
        return null;
    }
}

// Function to update user data from referral system
async function updateUserDataFromReferralSystem() {
    try {
        // Get or create current user ID
        let currentUserId = window.referralSystemMongoDB.getCurrentUser();
        if (!currentUserId) {
            currentUserId = await ensureUserExists();
            if (!currentUserId) return;
        }

        const userStats = await window.referralSystemMongoDB.getUserStats(currentUserId);
        
        if (userStats) {
            // Update level data for new 2-level system
            levelUsers.L1 = await window.referralSystemMongoDB.getUsersByLevel(currentUserId, 1);
            levelUsers.L2 = await window.referralSystemMongoDB.getUsersByLevel(currentUserId, 2);
            
            // Update stats display
            const statNumber = document.querySelector('.stat-number');
            if (statNumber) {
                statNumber.textContent = userStats.totalReferrals;
            }
            
            // Update earnings display
            updateEarningsDisplay(userStats);
            
            // Update level counts
            updateLevelCounts();
            
            // Load referral link
            await loadReferralLink();
        }
    } catch (error) {
        console.error('Error updating user data:', error);
    }
}

// Add loading states and transitions
function switchScreen(targetScreenId) {
    // Remove active state from all screens and buttons
    navButtons.forEach(btn => btn.classList.remove('active'));
    screens.forEach(screen => {
        screen.classList.remove('active-screen');
    });
    
    // Add active state to target elements
    const targetButton = document.getElementById(targetScreenId + 'Btn');
    const targetScreen = document.getElementById(targetScreenId);
    
    if (targetButton && targetScreen) {
        targetButton.classList.add('active');
        
        // Add slight delay for smooth transition
        setTimeout(() => {
            targetScreen.classList.add('active-screen');
        }, 50);
    }
}

// Enhanced navigation with haptic feedback simulation
navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Add click animation
        const target = e.currentTarget;
        if (target && target instanceof HTMLElement) {
            target.style.transform = 'translateY(0) scale(0.95)';
            setTimeout(() => {
                target.style.transform = '';
            }, 150);
        }
        
        const screenId = btn.id.replace('Btn', '');
        switchScreen(screenId);
        
        // Update page title based on active screen
        updatePageTitle(screenId);
    });
});

// Update page title function
function updatePageTitle(screenId) {
    const titles = {
        'home': 'IEPR Smart Network - Home',
        'friends': 'IEPR Smart Network - Friends',
        'rewards': 'IEPR Smart Network - Rewards'
    };
    document.title = titles[screenId] || 'IEPR Smart Network';
}

// TON Connect integration (UI SDK)
const openWalletBtn = document.getElementById('openWalletBtn');
let tonConnect;
try {
    // eslint-disable-next-line no-undef
    tonConnect = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: `${window.location.origin}/tonconnect-manifest.json`
    });
} catch (e) {
    console.warn('TON Connect SDK not available yet:', e);
}

async function connectTonWallet() {
    try {
        if (!tonConnect) return;
        // Open UI modal and connect
        await tonConnect.connectWallet();

        // Try to read connected wallet info from UI instance
        const wallet = tonConnect.wallet || (tonConnect.account ? { account: tonConnect.account } : null);
        if (wallet && wallet.account && wallet.account.address) {
            console.log('TON wallet connected:', {
                address: wallet.account.address,
                appName: wallet.device && wallet.device.appName ? wallet.device.appName : 'Unknown'
            });
            showToast('Wallet connected', 'success');

            // Persist wallet to backend for current user
            try {
                const userId = window.referralSystemMongoDB.getCurrentUser();
                if (userId) {
                    await window.referralSystemMongoDB.updateUserWallet(userId, {
                        address: wallet.account.address,
                        network: wallet.account.chain || wallet.account.network || null,
                        provider: (wallet.device && wallet.device.appName) ? wallet.device.appName : 'TON_CONNECT_UI'
                    });
                }
            } catch (persistError) {
                console.warn('Failed to persist wallet:', persistError);
            }
        }
    } catch (err) {
        console.error('TON Connect error:', err);
        showToast('Wallet connect failed', 'error');
    }
}

if (openWalletBtn) {
    openWalletBtn.addEventListener('click', connectTonWallet);
}

// Enhanced Friends Level System with better UX
const levelButtons = document.querySelectorAll('.level-btn');
const referralList = document.getElementById('referralList');

// Enhanced function to display users with better formatting
function displayUsers(level) {
    const users = levelUsers[level];
    if (users && users.length > 0) {
        const userItems = users.map(user => `
            <div class="user-item" title="Click to view details">
                <div class="user-info">
                    <div class="user-name">${user.name}</div>
                    <div class="user-meta">
                        <span class="joined-date">Joined ${user.joined}</span>
                        <span class="earnings">Earned ${user.earnings}</span>
                    </div>
                </div>
            </div>
        `).join('');
        
        referralList.innerHTML = `
            <h4>
                <span class="level-icon">👥</span>
                ${level} Network (${users.length})
            </h4>
            <div class="user-list">
                ${userItems}
            </div>
        `;
        
    } else {
        referralList.innerHTML = `
            <div class="empty-referrals">
                <div class="empty-icon">🔍</div>
                <h4>No ${level} referrals yet</h4>
                <p>Share your referral link to start building your network</p>
            </div>
        `;
    }
}

// Add enhanced styles for user items
const userItemStyles = `
    .user-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    
    .user-name {
        font-weight: 500;
        font-size: 14px;
    }
    
    .user-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        opacity: 0.7;
    }
    
    .earnings {
        color: var(--color-accent);
        font-weight: 500;
    }
    
    .level-icon {
        font-size: 16px;
        margin-right: 8px;
    }
    
    .empty-referrals {
        text-align: center;
        padding: 32px 16px;
        opacity: 0.6;
    }
    
    .empty-referrals .empty-icon {
        font-size: 32px;
        margin-bottom: 12px;
    }
    
    .empty-referrals h4 {
        font-size: 16px;
        margin-bottom: 8px;
        color: var(--color-text-secondary);
    }
    
    .empty-referrals p {
        font-size: 12px;
        color: var(--color-text-muted);
    }
`;

// Add the styles to the document
const userItemStyleSheet = document.createElement('style');
userItemStyleSheet.textContent = userItemStyles;
document.head.appendChild(userItemStyleSheet);

// Initialize L1 users when page loads
displayUsers('L1');

// Enhanced level button interactions
levelButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        // Remove active state from all buttons
        levelButtons.forEach(btn => btn.classList.remove('active'));
        
        // Add active state to clicked button
        button.classList.add('active');
        
        // Add click animation
        button.style.transform = 'translateY(0) scale(0.95)';
        setTimeout(() => {
            button.style.transform = '';
        }, 150);
        
        const level = button.dataset.level;
        displayUsers(level);
        
        // Update stats
        updateReferralStats();
        // Also refresh per-level counts
        updateLevelCounts();
    });
});

// Function to update referral stats
function updateReferralStats() {
    const totalReferrals = Object.values(levelUsers).flat().length;
    const statNumber = document.querySelector('.stat-number');
    if (statNumber) {
        statNumber.textContent = totalReferrals;
    }
    // Keep level counts in sync whenever stats update
    updateLevelCounts();
}

// Update per-level counts shown on the level buttons
function updateLevelCounts() {
    const buttons = document.querySelectorAll('.level-btn');
    buttons.forEach(button => {
        const level = button.dataset.level;
        const countEl = button.querySelector('.level-count');
        if (countEl && level) {
            const usersForLevel = levelUsers[level];
            const count = Array.isArray(usersForLevel) ? usersForLevel.length : 0;
            countEl.textContent = String(count);
        }
    });
}

// Update earnings display in rewards screen
function updateEarningsDisplay(userStats) {
    const currentEarningsEl = document.getElementById('currentEarnings');
    const totalEarningsEl = document.getElementById('totalEarnings');
    const investmentEl = document.getElementById('investment');
    const coinsEl = document.getElementById('coins');
    const l1MilestonesEl = document.getElementById('l1Milestones');
    const l2MilestonesEl = document.getElementById('l2Milestones');
    const monthlyClaimInfo = document.getElementById('monthlyClaimInfo');
    const claimMonthlyBtn = document.getElementById('claimMonthlyBtn');

    if (currentEarningsEl) currentEarningsEl.textContent = `$${(userStats.earnings || 0).toFixed(2)}`;
    if (totalEarningsEl) totalEarningsEl.textContent = `$${(userStats.totalEarnings || 0).toFixed(2)}`;
    if (investmentEl) investmentEl.textContent = `$${userStats.investment || 30}`;
    if (coinsEl) coinsEl.textContent = userStats.coins || 300;
    if (l1MilestonesEl) l1MilestonesEl.textContent = userStats.l1MilestoneBonuses || 0;
    if (l2MilestonesEl) l2MilestonesEl.textContent = userStats.l2MilestoneBonuses || 0;

    // Update monthly claim section if present
    if (monthlyClaimInfo && claimMonthlyBtn && userStats.monthlyClaim) {
        const last = userStats.monthlyClaim.lastClaim ? new Date(userStats.monthlyClaim.lastClaim) : null;
        const lastText = last ? last.toLocaleDateString() : 'Never';
        monthlyClaimInfo.textContent = `Last claim: ${lastText}. Pending bonus: ${userStats.monthlyClaim.pending || 0} coins.`;
        // Check real-time claim availability
        refreshMonthlyClaimStatus();
    }
}

// Refresh monthly claim status (base + pending) and enable/disable claim button
async function refreshMonthlyClaimStatus() {
    try {
        let userId = window.referralSystemMongoDB.getCurrentUser();
        const infoEl = document.getElementById('monthlyClaimInfo');
        const btn = document.getElementById('claimMonthlyBtn');
        if (!infoEl || !btn) return;
        if (!userId) {
            userId = await ensureUserExists();
            if (!userId) {
                infoEl.textContent = 'Sign in to see your monthly claim status.';
                btn.disabled = true;
                return;
            }
        }
        const status = await window.referralSystemMongoDB.getMonthlyClaimStatus(userId);
        if (!status) return;
        infoEl.textContent = `Claimable now: ${status.totalClaimable} coins (Base: ${status.base}, Bonus: ${status.pending}).`;
        btn.disabled = !status.canClaim || status.totalClaimable <= 0;
    } catch (e) {
        console.warn('Failed to refresh monthly claim status', e);
    }
}

// Load and display user-specific referral link
async function loadReferralLink() {
    try {
        let userId = window.referralSystemMongoDB.getCurrentUser();
        if (!userId) {
            // Attempt to auto-create from Telegram WebApp
            try {
                if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
                    const u = window.Telegram.WebApp.initDataUnsafe.user;
                    const telegramId = u && u.id ? String(u.id) : null;
                    if (telegramId) {
                        await window.referralSystemMongoDB.processReferral(telegramId, null);
                        userId = window.referralSystemMongoDB.getCurrentUser();
                    }
                }
            } catch (e) {
                console.warn('Auto-create before loading referral link (no user) failed:', e);
            }
            if (!userId) {
                setReferralLinkMessage('Server initializing. Please try again shortly.');
                return;
            }
        }
        let link = await window.referralSystemMongoDB.getReferralLink(userId);
        if (!link) {
            // try to auto-create user via Telegram WebApp and retry
            try {
                if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
                    const u = window.Telegram.WebApp.initDataUnsafe.user;
                    const telegramId = u && u.id ? String(u.id) : null;
                    if (telegramId) {
                        await window.referralSystemMongoDB.processReferral(telegramId, null);
                        userId = window.referralSystemMongoDB.getCurrentUser();
                        if (userId) {
                            link = await window.referralSystemMongoDB.getReferralLink(userId);
                        }
                    }
                }
            } catch (e) {
                console.warn('Auto-create before loading referral link failed:', e);
            }
        }
        const linkTextElement = document.querySelector('.link-text');
        const anchor = document.getElementById('referralLinkAnchor');
        if (anchor && link) {
            anchor.textContent = link;
            anchor.href = link;
        } else if (linkTextElement && link) {
            linkTextElement.textContent = link;
        } else if (!link) {
            setReferralLinkMessage('Server initializing. Please try again shortly.');
        }
    } catch (error) {
        console.error('Error loading referral link:', error);
        const linkTextElement = document.querySelector('.link-text');
        if (linkTextElement) {
            linkTextElement.textContent = 'Server initializing. Please try again shortly.';
        }
    }
}

// Copy to clipboard functionality with enhanced feedback
async function copyToClipboard() {
    try {
        let referralLink = await window.referralSystemMongoDB.getReferralLink();
        if (!referralLink) {
            // attempt to auto-create user via Telegram WebApp and retry once
            try {
                if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
                    const u = window.Telegram.WebApp.initDataUnsafe.user;
                    const telegramId = u && u.id ? String(u.id) : null;
                    const username = u && u.username ? String(u.username) : undefined;
                    if (telegramId) {
                        await window.referralSystemMongoDB.processReferral(telegramId, null);
                        referralLink = await window.referralSystemMongoDB.getReferralLink();
                    }
                }
            } catch (autoErr) {
                console.warn('Auto-create before copy failed:', autoErr);
            }
        }
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(referralLink).then(() => {
                showCopyFeedback();
            }).catch(() => {
                fallbackCopyToClipboard(referralLink);
            });
        } else {
            fallbackCopyToClipboard(referralLink || '');
        }
    } catch (error) {
        console.error('Error copying referral link:', error);
        showToast('Failed to get referral link', 'error');
    }
}

// Fallback copy method for older browsers
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showCopyFeedback();
    } catch (err) {
        console.error('Failed to copy text: ', err);
        showCopyFeedback(false);
    }
    
    document.body.removeChild(textArea);
}

// Enhanced copy feedback with better UX
function showCopyFeedback(success = true) {
    const copyBtn = document.querySelector('.copy-btn');
    if (!copyBtn) return;
    
    const originalText = copyBtn.textContent;
    
    if (success) {
        copyBtn.textContent = '✅';
        copyBtn.style.background = 'rgba(76, 175, 80, 0.2)';
        copyBtn.style.borderColor = 'rgba(76, 175, 80, 0.3)';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.background = '';
            copyBtn.style.borderColor = '';
        }, 2000);
        
        // Show toast notification
        showToast('Link copied to clipboard!', 'success');
    } else {
        copyBtn.textContent = '❌';
        copyBtn.style.background = 'rgba(244, 67, 54, 0.2)';
        copyBtn.style.borderColor = 'rgba(244, 67, 54, 0.3)';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.background = '';
            copyBtn.style.borderColor = '';
        }, 2000);
        
        showToast('Failed to copy link', 'error');
    }
}

// Toast notification system
function showToast(message, type = 'info') {
    // Remove existing toast if any
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Toast styles
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: type === 'success' ? 'var(--color-success)' : 
                   type === 'error' ? 'var(--color-error)' : 'var(--color-info)',
        color: 'white',
        padding: '12px 24px',
        borderRadius: 'var(--radius-xl)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-medium)',
        zIndex: '300',
        opacity: '0',
        transition: 'all 0.3s ease',
        boxShadow: 'var(--shadow-lg)',
        maxWidth: '90%',
        textAlign: 'center'
    });
    
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 10);
    
    // Remove toast after delay
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Initialize referral stats on page load
updateReferralStats();

// Debug function to view stored data
async function debugReferralData() {
    try {
        console.log('=== MONGODB REFERRAL SYSTEM DEBUG ===');
        
        const allUsers = await window.referralSystemMongoDB.getAllUsers();
        const currentUserId = window.referralSystemMongoDB.getCurrentUser();
        const userStats = currentUserId ? await window.referralSystemMongoDB.getUserStats(currentUserId) : null;
        
        console.log('All Users:', allUsers);
        console.log('Current User ID:', currentUserId);
        console.log('User Stats:', userStats);
        
        // Check for referral relationships
        if (allUsers && allUsers.length > 0) {
            console.log('=== REFERRAL RELATIONSHIPS ===');
            allUsers.forEach(user => {
                console.log(`User ${user._id} (${user.telegramId || 'No Telegram ID'}):`, {
                    referrerId: user.referrerId,
                    L1Referrals: user.referrals?.L1?.length || 0,
                    L2Referrals: user.referrals?.L2?.length || 0,
                    referralCode: user.referralCode
                });
            });
        }
        console.log('=====================================');
    } catch (error) {
        console.error('Error in debug function:', error);
    }
}

// Make debug function available globally
window.debugReferralData = debugReferralData;

// Add smooth scrolling for better UX
document.addEventListener('DOMContentLoaded', async () => {
    // Telegram WebApp integration: parse startapp param if available
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            const webApp = window.Telegram.WebApp;
            webApp.ready();
            // Expand app to full height
            if (webApp.expand) webApp.expand();
            
            // Get user data from Telegram
            const fromUser = webApp.initDataUnsafe?.user;
            const telegramId = fromUser?.id ? String(fromUser.id) : null;
            const username = fromUser?.username || null;
            const startParam = webApp.initDataUnsafe?.start_param;
            let refCode = null;
            
            // Parse referral code from start_param
            if (startParam && startParam.startsWith('ref_')) {
                refCode = startParam.substring(4);
            }
            
            console.log('Telegram WebApp data:', {
                user: fromUser,
                startParam,
                refCode,
                telegramId,
                username
            });
            
            // If we have Telegram data, process referral first (this handles both new and existing users)
            if (telegramId) {
                try {
                    await window.referralSystemMongoDB.processReferral(telegramId, refCode, username);
                    await updateUserDataFromReferralSystem();
                    await loadReferralLink();
                } catch (e) {
                    console.error('Failed processing Telegram user:', e);
                    // Fallback to ensureUserExists if Telegram processing fails
                    await ensureUserExists();
                    await updateUserDataFromReferralSystem();
                    await loadReferralLink();
                }
            } else {
                // No Telegram data, use fallback
                await ensureUserExists();
                await updateUserDataFromReferralSystem();
                await loadReferralLink();
            }
        } else {
            // No Telegram WebApp, use fallback
            await ensureUserExists();
            await updateUserDataFromReferralSystem();
            await loadReferralLink();
        }
    } catch (e) {
        console.warn('Telegram WebApp init failed, using fallback:', e);
        // Fallback to ensureUserExists if Telegram processing fails
        await ensureUserExists();
        await updateUserDataFromReferralSystem();
        await loadReferralLink();
    }
    
    // Add smooth transitions to all screens
    screens.forEach(screen => {
        screen.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    });
    
    // Initialize page title
    updatePageTitle('home');
    // Sync level counts with data on load
    updateLevelCounts();

    // Wire monthly claim button
    const claimMonthlyBtn = document.getElementById('claimMonthlyBtn');
    if (claimMonthlyBtn) {
        claimMonthlyBtn.addEventListener('click', async () => {
            try {
                const userId = window.referralSystemMongoDB.getCurrentUser();
                if (!userId) return;
                claimMonthlyBtn.disabled = true;
                claimMonthlyBtn.textContent = 'Claiming...';
                const result = await window.referralSystemMongoDB.claimMonthlyCoins(userId);
                showToast(`Claimed ${result.claimed} coins`, 'success');
                // Refresh stats and claim status
                await updateUserDataFromReferralSystem();
                await refreshMonthlyClaimStatus();
            } catch (e) {
                console.error(e);
                showToast('Failed to claim coins', 'error');
            } finally {
                claimMonthlyBtn.disabled = false;
                claimMonthlyBtn.textContent = 'Claim Monthly Coins';
            }
        });
        // Initial status
        await refreshMonthlyClaimStatus();
    }
    
    // Add loading animation to cards
    const cards = document.querySelectorAll('.blog-card, .referral-section, .rewards-container');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            card.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100 + (index * 100));
    });

    // Initialize blog-card collapse/expand with internal scroll
    const blogCard = document.querySelector('.blog-card');
    if (blogCard) {
        // Wrap the paragraph content into a container for clamping
        const paragraph = blogCard.querySelector('p');
        if (paragraph && !paragraph.classList.contains('blog-content')) {
            paragraph.classList.add('blog-content');
        }

        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'blog-toggle';
        toggleBtn.type = 'button';
        toggleBtn.textContent = 'See more';

        // Start collapsed
        blogCard.classList.add('collapsed');
        
        // Insert toggle after the paragraph
        const header = blogCard.querySelector('.card-header');
        if (paragraph && paragraph.parentNode) {
            paragraph.parentNode.insertBefore(toggleBtn, paragraph.nextSibling);
        } else if (header && header.parentNode) {
            header.parentNode.appendChild(toggleBtn);
        }

        toggleBtn.addEventListener('click', () => {
            const isCollapsed = blogCard.classList.contains('collapsed');
            if (isCollapsed) {
                blogCard.classList.remove('collapsed');
                blogCard.classList.add('expanded');
                toggleBtn.textContent = 'See less';
            } else {
                blogCard.classList.remove('expanded');
                blogCard.classList.add('collapsed');
                toggleBtn.textContent = 'See more';
            }
        });
    }
});

// Enhanced performance monitoring
if ('performance' in window) {
    window.addEventListener('load', () => {
        setTimeout(() => {
            const perfData = performance.getEntriesByType('navigation')[0];
            if (perfData) {
                console.log(`Page loaded in ${perfData.loadEventEnd - perfData.fetchStart}ms`);
            }
        }, 0);
    });
}

// Add support for browser back/forward navigation
window.addEventListener('popstate', (event) => {
    // Handle browser navigation if needed
    const currentScreen = document.querySelector('.screen.active-screen');
    if (currentScreen) {
        const screenId = currentScreen.id;
        updatePageTitle(screenId);
    }
});

