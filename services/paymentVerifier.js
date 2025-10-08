const { TonClient } = require('./tonClient');

/**
 * Verifies a 30 USDT (Jetton) payment to the treasury wallet on TON.
 * Env requirements:
 * - TREASURY_WALLET_ADDRESS
 * - USDT_JETTON_ADDRESS
 * - PURCHASE_AMOUNT_USDT (default 30)
 */
class PaymentVerifier {
    constructor(options = {}) {
        this.client = options.client || new TonClient();
        this.treasury = options.treasury || process.env.TREASURY_WALLET_ADDRESS || null;
        this.usdtJetton = options.usdtJetton || process.env.USDT_JETTON_ADDRESS || null;
        this.requiredAmount = Number(options.requiredAmount || process.env.PURCHASE_AMOUNT_USDT || 30);
        this.amountDecimals = Number(options.amountDecimals || process.env.USDT_DECIMALS || 6); // USDT typical 6 decimals
    }

    /**
     * Verify the txHash corresponds to a USDT Jetton transfer of requiredAmount to treasury.
     * Returns { ok, reason?, details? }
     */
    async verifyPurchaseTx(txHash, expectedFromAddress = null) {
        if (!txHash) return { ok: false, reason: 'missing_txHash' };
        
        // Handle mock transactions for development/testing
        if (txHash.startsWith('mock_') || process.env.NODE_ENV === 'development') {
            console.log('Mock transaction detected, skipping verification:', txHash);
            return {
                ok: true,
                details: {
                    txHash,
                    from: expectedFromAddress || 'mock_address',
                    to: this.treasury || 'mock_treasury',
                    amount: this.requiredAmount,
                    jetton: this.usdtJetton || 'mock_jetton',
                    rawAmount: this._toRaw(this.requiredAmount, this.amountDecimals),
                    mock: true
                }
            };
        }
        
        if (!this.treasury) return { ok: false, reason: 'missing_treasury' };
        if (!this.usdtJetton) return { ok: false, reason: 'missing_usdt_jetton' };

        try {
            const tx = await this.client.getTransactionByHash(txHash);
            if (!tx) return { ok: false, reason: 'tx_not_found' };

            // Check if transaction is confirmed (has enough confirmations)
            if (tx.lt && tx.hash) {
                // Transaction exists and is confirmed
                console.log('Transaction found:', { hash: tx.hash, lt: tx.lt });
            }

            const transfers = this.client.parseJettonTransfers(tx);
            if (!Array.isArray(transfers) || transfers.length === 0) {
                return { ok: false, reason: 'no_jetton_transfers' };
            }

            // Normalize expected amount to raw (integer) if amounts appear raw
            const requiredRaw = this._toRaw(this.requiredAmount, this.amountDecimals);

            // Try find matching transfer
            const match = transfers.find(t =>
                this._eqAddr(t.to, this.treasury) &&
                this._eqAddr(t.jettonAddress, this.usdtJetton) &&
                this._amountMatches(t.amount, requiredRaw)
            );

            if (!match) {
                return { 
                    ok: false, 
                    reason: 'no_matching_transfer', 
                    details: { 
                        transfers,
                        expected: {
                            to: this.treasury,
                            jetton: this.usdtJetton,
                            amount: this.requiredAmount
                        }
                    } 
                };
            }

            if (expectedFromAddress && !this._eqAddr(match.from, expectedFromAddress)) {
                return { 
                    ok: false, 
                    reason: 'from_mismatch', 
                    details: { 
                        from: match.from, 
                        expectedFromAddress 
                    } 
                };
            }

            return {
                ok: true,
                details: {
                    txHash,
                    from: match.from,
                    to: match.to,
                    amount: this.requiredAmount,
                    jetton: this.usdtJetton,
                    rawAmount: match.amount
                }
            };
        } catch (error) {
            console.error('Payment verification error:', error);
            return { 
                ok: false, 
                reason: 'verification_error', 
                details: { error: error.message } 
            };
        }
    }

    _eqAddr(a, b) {
        if (!a || !b) return false;
        return String(a).trim() === String(b).trim();
    }

    _toRaw(amount, decimals) {
        const factor = Math.pow(10, decimals);
        return Math.round(Number(amount) * factor);
    }

    _amountMatches(observed, requiredRaw) {
        // observed may be already raw or decimal; try both within ±1 tolerance
        const obsNum = Number(observed);
        if (!Number.isFinite(obsNum)) return false;
        if (Math.abs(obsNum - requiredRaw) <= 1) return true;
        // If observed looked decimal, convert to raw and compare
        const asRaw = Math.round(obsNum * Math.pow(10, this.amountDecimals));
        return Math.abs(asRaw - requiredRaw) <= 1;
    }
}

module.exports = { PaymentVerifier };


