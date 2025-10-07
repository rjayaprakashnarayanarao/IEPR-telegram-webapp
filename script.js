// IND EMPOWER - Frontend Application
// Enhanced with TON Connect, Purchase Flow, and Dashboard Integration

// Global state
let tonConnect = null;
let currentUser = null;
let walletAddress = null;
let isWalletConnected = false;
let referralLinkPollIntervalId = null;
let referralLinkCountdownIntervalId = null;
let referralLinkCountdownSecondsRemaining = 0;

// Local fallback referral code (when backend is unavailable)
function getOrCreateLocalReferralCode() {
	try {
		const key = 'localReferralCode';
		let code = localStorage.getItem(key);
		if (code && typeof code === 'string' && code.length >= 6) return code;
		// Generate simple deterministic-ish code based on time + random
		code = `loc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
		localStorage.setItem(key, code);
		return code;
	} catch {
		return `loc_${Math.random().toString(36).slice(2, 10)}`;
	}
}

// DOM elements
const screens = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.nav-btn');
const purchaseBtn = document.getElementById('purchaseBtn');
const claimTokensBtn = document.getElementById('claimTokensBtn');
const withdrawBtn = document.getElementById('withdrawBtn');
const withdrawAmountInput = document.getElementById('withdrawAmount');

// Initialize TON Connect
async function initializeTonConnect() {
    try {
        if (typeof TON_CONNECT_UI !== 'undefined') {
            tonConnect = new TON_CONNECT_UI.TonConnectUI({
                manifestUrl: `${window.location.origin}/tonconnect-manifest.json`,
                buttonRootId: 'walletStatus'
            });
            
            // Listen for wallet connection events
            tonConnect.onStatusChange((wallet) => {
                if (wallet && wallet.account) {
                    walletAddress = wallet.account.address;
                    isWalletConnected = true;
                    updateWalletStatus();
                    loadUserDashboard();
                    showToast('Wallet connected successfully!', 'success');
                } else {
                    walletAddress = null;
                    isWalletConnected = false;
                    updateWalletStatus();
                    showToast('Wallet disconnected', 'info');
                }
            });
            
            // Check if wallet is already connected
            const wallet = tonConnect.wallet;
            if (wallet && wallet.account) {
                walletAddress = wallet.account.address;
                isWalletConnected = true;
                updateWalletStatus();
                await loadUserDashboard();
            }
        } else {
            console.warn('TON Connect SDK not available');
        }
    } catch (error) {
        console.error('Failed to initialize TON Connect:', error);
    }
}

// Wallet connection is now handled automatically by TON Connect UI

// Update wallet status display
function updateWalletStatus() {
    if (isWalletConnected && walletAddress) {
        // Enable purchase button when wallet is connected
        if (purchaseBtn) {
            purchaseBtn.disabled = false;
            purchaseBtn.innerHTML = `
                <span class="btn-text">Purchase Package</span>
                <span class="btn-icon">💳</span>
            `;
        }
    } else {
        // Disable purchase button when wallet is not connected
        if (purchaseBtn) {
            purchaseBtn.disabled = true;
            purchaseBtn.innerHTML = `
                <span class="btn-text">Purchase Package</span>
                <span class="btn-icon">💳</span>
            `;
        }
    }
}

// Wallet disconnection is handled automatically by TON Connect UI

// Load user dashboard data
async function loadUserDashboard() {
    if (!walletAddress) return;
    
    try {
        const response = await fetch(`/api/referrals/dashboard?walletAddress=${encodeURIComponent(walletAddress)}`);
        if (!response.ok) {
            if (response.status === 404) {
                // User not found, show purchase option
                showPurchaseSection();
                return;
            }
            throw new Error('Failed to load dashboard');
        }
        
        const data = await response.json();
        currentUser = data;
        updateDashboard(data);
        showDashboardSection();
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        showToast('Failed to load dashboard data', 'error');
    }
}

// Update dashboard with user data
function updateDashboard(data) {
    const { profile, tokens, rewards, referrals } = data;
    
    // Package status
    document.getElementById('packageActive').textContent = profile.packageActive ? 'Active' : 'Inactive';
    document.getElementById('packageExpiry').textContent = profile.packageExpiry 
        ? new Date(profile.packageExpiry).toLocaleDateString() 
        : '-';
    document.getElementById('userId').textContent = profile.userId || '-';
    
    // Token distribution
    document.getElementById('tokensEntitled').textContent = tokens.entitled || 0;
    document.getElementById('tokensClaimed').textContent = tokens.claimed || 0;
    document.getElementById('tokensRemaining').textContent = tokens.remaining || 0;
    document.getElementById('monthlyClaimable').textContent = `${tokens.monthlyClaimable || 0} IEPR`;
    
    // Monthly claim info
    const monthlyClaimInfo = document.getElementById('monthlyClaimInfo');
    if (monthlyClaimInfo) {
        const lastClaim = tokens.lastMonthlyClaim 
            ? new Date(tokens.lastMonthlyClaim).toLocaleDateString() 
            : 'Never';
        monthlyClaimInfo.textContent = `Last claim: ${lastClaim}. Monthly claimable: ${tokens.monthlyClaimable || 0} IEPR.`;
    }
    
    // USDT rewards
    document.getElementById('rewardsBalanceUSDT').textContent = `$${(rewards.balanceUSDT || 0).toFixed(2)}`;
    document.getElementById('totalEarnings').textContent = `$${(rewards.balanceUSDT || 0).toFixed(2)}`;
    
    // Referral stats
    document.getElementById('l1Count').textContent = referrals.level1Count || 0;
    document.getElementById('l2Count').textContent = referrals.level2Count || 0;
    
    // Update claim and withdraw buttons
    if (claimTokensBtn) {
        claimTokensBtn.disabled = !profile.packageActive || (tokens.monthlyClaimable || 0) <= 0;
    }
    
    if (withdrawBtn) {
        withdrawBtn.disabled = (rewards.balanceUSDT || 0) <= 0;
    }

	// Referral link handling on Friends screen
	const referralLinkAnchor = document.getElementById('referralLinkAnchor');
	if (referralLinkAnchor) {
		if (profile && profile.referralLink) {
			stopReferralLinkWait();
			referralLinkAnchor.href = profile.referralLink;
			referralLinkAnchor.textContent = profile.referralLink;
		} else {
			startReferralLinkWait();
		}
	}
}

// Show purchase section
function showPurchaseSection() {
    const purchaseSection = document.getElementById('purchaseSection');
    if (purchaseSection) {
        purchaseSection.style.display = 'block';
    }
}

// Show dashboard section
function showDashboardSection() {
    const purchaseSection = document.getElementById('purchaseSection');
    if (purchaseSection) {
        purchaseSection.style.display = 'none';
    }
}

// Start countdown + polling until referral link is available
function startReferralLinkWait(timeoutSeconds = 15, pollEveryMs = 1500) {
	const referralLinkAnchor = document.getElementById('referralLinkAnchor');
	if (!referralLinkAnchor) return;

	// Avoid duplicating timers
	if (referralLinkPollIntervalId || referralLinkCountdownIntervalId) return;

	referralLinkCountdownSecondsRemaining = timeoutSeconds;
	referralLinkAnchor.textContent = `Generating… (${referralLinkCountdownSecondsRemaining}s)`;

	// Countdown UI updater
	referralLinkCountdownIntervalId = setInterval(() => {
		referralLinkCountdownSecondsRemaining -= 1;
		if (referralLinkCountdownSecondsRemaining > 0) {
			referralLinkAnchor.textContent = `Generating… (${referralLinkCountdownSecondsRemaining}s)`;
			return;
		}
		// Timeout reached
		stopReferralLinkWait();
		// Fallback: show a locally generated referral link so users can still share something
		const fallbackCode = getOrCreateLocalReferralCode();
		const fallbackLink = `${window.location.origin}/?ref=${fallbackCode}`;
		referralLinkAnchor.href = fallbackLink;
		referralLinkAnchor.textContent = fallbackLink;
		console.error('Referral link not available within the expected time window. Displaying local fallback link.');
	}, 1000);

	// Poll dashboard for referralLink (only when wallet is available)
	let lastStatus = null;
	let lastErrorMessage = null;
	referralLinkPollIntervalId = setInterval(async () => {
		if (!walletAddress) return; // wait until wallet is connected
		try {
			const res = await fetch(`/api/referrals/dashboard?walletAddress=${encodeURIComponent(walletAddress)}`);
			lastStatus = res.status;
			if (res.ok) {
				const data = await res.json();
				const link = data && data.profile && data.profile.referralLink;
				if (link) {
					stopReferralLinkWait();
					referralLinkAnchor.href = link;
					referralLinkAnchor.textContent = link;
					return;
				}
				// Fallback: if we have a userId, try the specific referral-link endpoint
				const userId = data && data.profile && data.profile.userId;
				if (userId) {
					try {
						const linkRes = await fetch(`/api/referrals/users/${encodeURIComponent(userId)}/referral-link`);
						if (linkRes.ok) {
							const linkJson = await linkRes.json();
							if (linkJson && linkJson.referralLink) {
								stopReferralLinkWait();
								referralLinkAnchor.href = linkJson.referralLink;
								referralLinkAnchor.textContent = linkJson.referralLink;
								return;
							}
						}
						lastStatus = linkRes.status;
					} catch (innerErr) {
						lastErrorMessage = innerErr && innerErr.message ? innerErr.message : String(innerErr);
					}
				}
			} else {
				// Keep polling; remember last error for timeout logging
				try {
					const errJson = await res.json();
					lastErrorMessage = errJson && (errJson.error || errJson.message) ? (errJson.error || errJson.message) : null;
				} catch {}
			}
		} catch (e) {
			lastErrorMessage = e && e.message ? e.message : String(e);
		}
	}, pollEveryMs);
}

function stopReferralLinkWait() {
	if (referralLinkPollIntervalId) {
		clearInterval(referralLinkPollIntervalId);
		referralLinkPollIntervalId = null;
	}
	if (referralLinkCountdownIntervalId) {
		clearInterval(referralLinkCountdownIntervalId);
		referralLinkCountdownIntervalId = null;
	}
}

// Purchase package
async function purchasePackage() {
    if (!isWalletConnected || !walletAddress) {
        showToast('Please connect your wallet first', 'error');
        return;
    }
    
    try {
        purchaseBtn.disabled = true;
        purchaseBtn.innerHTML = `
            <span class="btn-text">Processing...</span>
            <span class="btn-icon">⏳</span>
        `;
        
        showToast('Please complete the payment in your wallet', 'info');
        
        // In a real implementation, you would:
        // 1. Trigger a TON transaction for 30 USDT
        // 2. Get the transaction hash
        // 3. Send it to the backend for verification
        
        // For demo purposes, we'll simulate a transaction
        const mockTxHash = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const response = await fetch('/api/referrals/purchase', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                walletAddress: walletAddress,
                txHash: mockTxHash,
                referralCode: getReferralCodeFromUrl()
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Purchase failed');
        }
        
        const result = await response.json();
        showToast('Package purchased successfully!', 'success');
        
        // Reload dashboard
        await loadUserDashboard();
        
    } catch (error) {
        console.error('Purchase failed:', error);
        showToast(error.message || 'Purchase failed', 'error');
    } finally {
        purchaseBtn.disabled = false;
        purchaseBtn.innerHTML = `
            <span class="btn-text">Purchase Package</span>
            <span class="btn-icon">💳</span>
        `;
    }
}

// Claim tokens
async function claimTokens() {
    if (!currentUser || !walletAddress) {
        showToast('Please connect your wallet first', 'error');
        return;
    }
    
    try {
        claimTokensBtn.disabled = true;
        claimTokensBtn.innerHTML = `
            <span class="btn-text">Claiming...</span>
            <span class="btn-icon">⏳</span>
        `;
        
        const response = await fetch('/api/referrals/claim-tokens', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                walletAddress: walletAddress
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Token claim failed');
        }
        
        const result = await response.json();
        showToast(`Successfully claimed ${result.claimed} IEPR tokens!`, 'success');
        
        // Reload dashboard
        await loadUserDashboard();
        
    } catch (error) {
        console.error('Token claim failed:', error);
        showToast(error.message || 'Token claim failed', 'error');
    } finally {
        claimTokensBtn.disabled = false;
        claimTokensBtn.innerHTML = `
            <span class="btn-text">Claim Tokens</span>
            <span class="btn-icon">🎯</span>
        `;
    }
}

// Withdraw USDT
async function withdrawUSDT() {
    if (!currentUser || !walletAddress) {
        showToast('Please connect your wallet first', 'error');
        return;
    }
    
    const amount = parseFloat(withdrawAmountInput.value);
    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }
    
    if (amount > (currentUser.rewards?.balanceUSDT || 0)) {
        showToast('Insufficient balance', 'error');
        return;
    }
    
    try {
        withdrawBtn.disabled = true;
        withdrawBtn.innerHTML = `
            <span class="btn-text">Withdrawing...</span>
            <span class="btn-icon">⏳</span>
        `;
        
        const response = await fetch('/api/referrals/withdraw', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentUser.profile?.userId,
                amountUSDT: amount,
                toWalletAddress: walletAddress
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Withdrawal failed');
        }
        
        const result = await response.json();
        showToast(`Successfully withdrew ${result.withdrawn} USDT!`, 'success');
        
        // Clear input and reload dashboard
        withdrawAmountInput.value = '';
        await loadUserDashboard();
        
    } catch (error) {
        console.error('Withdrawal failed:', error);
        showToast(error.message || 'Withdrawal failed', 'error');
    } finally {
        withdrawBtn.disabled = false;
        withdrawBtn.innerHTML = `
            <span class="btn-text">Withdraw</span>
            <span class="btn-icon">💸</span>
        `;
    }
}

// Get referral code from URL
function getReferralCodeFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('ref') || null;
}

// Screen navigation
function switchScreen(targetScreenId) {
    navButtons.forEach(btn => btn.classList.remove('active'));
    screens.forEach(screen => screen.classList.remove('active-screen'));
    
    const targetButton = document.getElementById(targetScreenId + 'Btn');
    const targetScreen = document.getElementById(targetScreenId);
    
    if (targetButton && targetScreen) {
        targetButton.classList.add('active');
        setTimeout(() => {
            targetScreen.classList.add('active-screen');
        }, 50);

		// If navigating to Friends, ensure referral link UI is updated or countdown starts
		if (targetScreenId === 'friends') {
			const referralLinkAnchor = document.getElementById('referralLinkAnchor');
			if (referralLinkAnchor) {
				const existingLink = currentUser && currentUser.profile && currentUser.profile.referralLink;
				if (existingLink) {
					stopReferralLinkWait();
					referralLinkAnchor.href = existingLink;
					referralLinkAnchor.textContent = existingLink;
				} else {
					startReferralLinkWait();
				}
			}
		}
    }
}

// Update page title
function updatePageTitle(screenId) {
    const titles = {
        'home': 'IND EMPOWER - Home',
        'friends': 'IND EMPOWER - Referrals',
        'rewards': 'IND EMPOWER - Dashboard'
    };
    document.title = titles[screenId] || 'IND EMPOWER';
}

// Toast notification system
function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 10);
    
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

// Event listeners
// Copy to clipboard function
async function copyToClipboard() {
    const referralLinkAnchor = document.getElementById('referralLinkAnchor');
    if (referralLinkAnchor && referralLinkAnchor.href !== '#') {
        try {
            await navigator.clipboard.writeText(referralLinkAnchor.href);
            showToast('Referral link copied to clipboard!', 'success');
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = referralLinkAnchor.href;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('Referral link copied to clipboard!', 'success');
        }
    } else {
        showToast('Referral link not available yet', 'error');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize TON Connect
    await initializeTonConnect();
    
    // Navigation
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const screenId = btn.id.replace('Btn', '');
            switchScreen(screenId);
            updatePageTitle(screenId);
        });
    });
    
    // Wallet connection is handled by TON Connect UI automatically
    
    // Purchase
    if (purchaseBtn) {
        purchaseBtn.addEventListener('click', purchasePackage);
    }
    
    // Token claim
    if (claimTokensBtn) {
        claimTokensBtn.addEventListener('click', claimTokens);
    }
    
    // Withdrawal
    if (withdrawBtn) {
        withdrawBtn.addEventListener('click', withdrawUSDT);
    }
    
    // Copy button
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyToClipboard);
    }
    
    // Initialize page
    updatePageTitle('home');
    
    // Add smooth transitions
    screens.forEach(screen => {
        screen.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    });
    
    // Add loading animations
    const cards = document.querySelectorAll('.blog-card, .purchase-card, .rewards-container');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            card.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100 + (index * 100));
    });
});

// Telegram WebApp integration
if (window.Telegram && window.Telegram.WebApp) {
    const webApp = window.Telegram.WebApp;
    webApp.ready();
    
    if (webApp.expand) {
        webApp.expand();
    }
    
    // Parse referral code from start parameter
    const startParam = webApp.initDataUnsafe?.start_param;
    if (startParam && startParam.startsWith('ref_')) {
        const referralCode = startParam.substring(4);
        // Store referral code for later use
        window.referralCode = referralCode;
    }
}
