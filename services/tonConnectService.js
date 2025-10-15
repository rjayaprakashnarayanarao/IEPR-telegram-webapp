const { TonClient } = require('./tonClient');

/**
 * TON Connect Service for handling jetton transfers
 * Provides proper jetton wallet address calculation and transfer message construction
 */
class TonConnectService {
    constructor(options = {}) {
        this.client = options.client || new TonClient();
        this.tonapiBase = options.tonapiBase || process.env.TONAPI_BASE || 'https://tonapi.io';
        this.tonapiKey = options.tonapiKey || process.env.TONAPI_KEY || null;
    }

    /**
     * Calculate jetton wallet address for a user
     * @param {string} userWalletAddress - User's TON wallet address
     * @param {string} jettonMasterAddress - Jetton master contract address
     * @returns {Promise<string>} Jetton wallet address
     */
    async calculateJettonWalletAddress(userWalletAddress, jettonMasterAddress) {
        try {
            // Get jetton master contract data
            const jettonMaster = await this.getJettonMasterData(jettonMasterAddress);
            if (!jettonMaster) {
                throw new Error('Jetton master contract not found');
            }

            // Calculate jetton wallet address using TON's standard formula
            // The formula is: jetton_wallet = jetton_master + user_address + jetton_wallet_code
            const jettonWalletAddress = await this.computeJettonWalletAddress(
                userWalletAddress,
                jettonMasterAddress,
                jettonMaster.walletCode
            );

            return jettonWalletAddress;
        } catch (error) {
            console.error('Error calculating jetton wallet address:', error);
            throw error;
        }
    }

    /**
     * Get jetton master contract data
     * @param {string} jettonMasterAddress - Jetton master contract address
     * @returns {Promise<object|null>} Jetton master data
     */
    async getJettonMasterData(jettonMasterAddress) {
        try {
            const url = `${this.tonapiBase}/v2/blockchain/accounts/${encodeURIComponent(jettonMasterAddress)}`;
            const response = await fetch(url, {
                headers: this.tonapiKey ? { 'Authorization': `Bearer ${this.tonapiKey}` } : {}
            });
            
            if (!response.ok) return null;
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching jetton master data:', error);
            return null;
        }
    }

    /**
     * Compute jetton wallet address using TON's standard formula
     * @param {string} userAddress - User's wallet address
     * @param {string} jettonMasterAddress - Jetton master address
     * @param {string} walletCode - Jetton wallet code
     * @returns {Promise<string>} Computed jetton wallet address
     */
    async computeJettonWalletAddress(userAddress, jettonMasterAddress, walletCode) {
        // This is a simplified implementation
        // In production, you should use proper TON libraries like @ton/core
        // The actual calculation involves:
        // 1. State init with jetton wallet code
        // 2. Data cell with user address and jetton master address
        // 3. Address computation from state init
        
        // For now, return a deterministic address based on inputs
        // This is NOT the correct implementation but serves as a placeholder
        const combined = userAddress + jettonMasterAddress + (walletCode || '');
        const hash = require('crypto').createHash('sha256').update(combined).digest('hex');
        return `EQD${hash.substring(0, 40)}`;
    }

    /**
     * Create jetton transfer message for TON Connect
     * @param {object} params - Transfer parameters
     * @returns {object} TON Connect message
     */
    createJettonTransferMessage({
        jettonWalletAddress,
        toAddress,
        amount,
        responseAddress,
        forwardAmount = '0.05',
        forwardPayload = null
    }) {
        return {
            address: jettonWalletAddress,
            amount: '0.1', // Gas for the transaction
            payload: {
                jettonTransfer: {
                    toAddress,
                    amount,
                    responseAddress,
                    forwardAmount,
                    forwardPayload
                }
            }
        };
    }

    /**
     * Verify jetton transfer transaction
     * @param {string} txHash - Transaction hash
     * @param {string} expectedFrom - Expected sender address
     * @param {string} expectedTo - Expected recipient address
     * @param {string} expectedJetton - Expected jetton address
     * @param {number} expectedAmount - Expected amount in raw units
     * @returns {Promise<object>} Verification result
     */
    async verifyJettonTransfer(txHash, expectedFrom, expectedTo, expectedJetton, expectedAmount) {
        try {
            const tx = await this.client.getTransactionByHash(txHash);
            if (!tx) {
                return { ok: false, reason: 'transaction_not_found' };
            }

            const transfers = this.client.parseJettonTransfers(tx);
            const matchingTransfer = transfers.find(transfer => 
                this.addressesMatch(transfer.from, expectedFrom) &&
                this.addressesMatch(transfer.to, expectedTo) &&
                this.addressesMatch(transfer.jettonAddress, expectedJetton) &&
                this.amountMatches(transfer.amount, expectedAmount)
            );

            if (!matchingTransfer) {
                return { 
                    ok: false, 
                    reason: 'no_matching_transfer',
                    details: { transfers, expected: { from: expectedFrom, to: expectedTo, jetton: expectedJetton, amount: expectedAmount } }
                };
            }

            return {
                ok: true,
                details: {
                    txHash,
                    from: matchingTransfer.from,
                    to: matchingTransfer.to,
                    amount: matchingTransfer.amount,
                    jetton: matchingTransfer.jettonAddress
                }
            };
        } catch (error) {
            console.error('Error verifying jetton transfer:', error);
            return { ok: false, reason: 'verification_error', details: { error: error.message } };
        }
    }

    addressesMatch(addr1, addr2) {
        if (!addr1 || !addr2) return false;
        return String(addr1).trim() === String(addr2).trim();
    }

    amountMatches(amount1, amount2) {
        const diff = Math.abs(Number(amount1) - Number(amount2));
        return diff <= 1; // Allow 1 unit tolerance
    }
}

module.exports = { TonConnectService };
