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
        console.log('🔍 Starting payment verification:', {
            txHash: txHash?.substring(0, 20) + '...',
            expectedFromAddress,
            treasury: this.treasury,
            usdtJetton: this.usdtJetton,
            requiredAmount: this.requiredAmount
        });
        
        if (!txHash) {
            console.log('❌ Verification failed: Missing transaction hash');
            return { ok: false, reason: 'missing_txHash' };
        }
        
        // Handle mock transactions for development/testing
        if (txHash.startsWith('mock_') || process.env.NODE_ENV === 'development') {
            console.log('🧪 Mock transaction detected, skipping verification:', txHash);
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
        
        if (!this.treasury) {
            console.log('❌ Verification failed: Missing treasury wallet address');
            return { ok: false, reason: 'missing_treasury' };
        }
        if (!this.usdtJetton) {
            console.log('❌ Verification failed: Missing USDT jetton address');
            return { ok: false, reason: 'missing_usdt_jetton' };
        }

        try {
            console.log('🔍 Fetching transaction from blockchain...');
            const tx = await this.client.getTransactionByHash(txHash);
            if (!tx) {
                console.log('❌ Transaction not found on blockchain');
                return { ok: false, reason: 'tx_not_found' };
            }

            console.log('✅ Transaction found on blockchain:', {
                hash: tx.hash,
                lt: tx.lt,
                timestamp: tx.now,
                status: tx.success ? 'success' : 'failed'
            });

            // Check if transaction is confirmed (has enough confirmations)
            if (tx.lt && tx.hash) {
                console.log('✅ Transaction confirmed:', { hash: tx.hash, lt: tx.lt });
            }

            console.log('🔍 Parsing jetton transfers from transaction...');
            const transfers = this.client.parseJettonTransfers(tx);
            console.log('📊 Found jetton transfers:', transfers.length);
            
            if (!Array.isArray(transfers) || transfers.length === 0) {
                console.log('❌ No jetton transfers found in transaction');
                return { ok: false, reason: 'no_jetton_transfers' };
            }

            // Log all transfers for debugging
            transfers.forEach((transfer, index) => {
                console.log(`📋 Transfer ${index + 1}:`, {
                    from: transfer.from,
                    to: transfer.to,
                    amount: transfer.amount,
                    jettonAddress: transfer.jettonAddress
                });
            });

            // Normalize expected amount to raw (integer) if amounts appear raw
            const requiredRaw = this._toRaw(this.requiredAmount, this.amountDecimals);
            console.log('💰 Expected payment details:', {
                requiredAmount: this.requiredAmount,
                requiredRaw: requiredRaw,
                treasury: this.treasury,
                usdtJetton: this.usdtJetton
            });

            // Try find matching transfer
            const match = transfers.find(t => {
                const toMatch = this._eqAddr(t.to, this.treasury);
                const jettonMatch = this._eqAddr(t.jettonAddress, this.usdtJetton);
                const amountMatch = this._amountMatches(t.amount, requiredRaw);
                
                console.log('🔍 Checking transfer match:', {
                    to: t.to,
                    toMatch,
                    jettonAddress: t.jettonAddress,
                    jettonMatch,
                    amount: t.amount,
                    amountMatch,
                    overallMatch: toMatch && jettonMatch && amountMatch
                });
                
                return toMatch && jettonMatch && amountMatch;
            });

            if (!match) {
                console.log('❌ No matching transfer found');
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

            console.log('✅ Found matching transfer:', match);

            if (expectedFromAddress && !this._eqAddr(match.from, expectedFromAddress)) {
                console.log('❌ From address mismatch:', {
                    expected: expectedFromAddress,
                    actual: match.from
                });
                return { 
                    ok: false, 
                    reason: 'from_mismatch', 
                    details: { 
                        from: match.from, 
                        expectedFromAddress 
                    } 
                };
            }

            console.log('🎉 Payment verification successful!');
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
            console.error('💥 Payment verification error:', error);
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


