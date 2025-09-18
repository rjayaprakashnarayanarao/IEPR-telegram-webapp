/**
 * Jetton transfer service for IEPR and USDT.
 * IMPORTANT: Do not store private keys in code or repo. Use secure KMS/Env in runtime only.
 * This module supports a simulation mode for environments without signer setup.
 *
 * Env:
 * - IEPR_JETTON_ADDRESS
 * - USDT_JETTON_ADDRESS
 * - TRANSFER_MODE = 'simulate' | 'disabled' | 'live' (default: 'simulate')
 */

class JettonTransferService {
    constructor(options = {}) {
        this.mode = options.mode || process.env.TRANSFER_MODE || 'simulate';
        this.ieprJetton = options.ieprJetton || process.env.IEPR_JETTON_ADDRESS || null;
        this.usdtJetton = options.usdtJetton || process.env.USDT_JETTON_ADDRESS || null;
        this.rpcEndpoint = options.rpcEndpoint || process.env.TONCENTER_ENDPOINT || process.env.TON_RPC_ENDPOINT || null;
        this.apiKey = options.apiKey || process.env.TONCENTER_API_KEY || null;
        this.signerSecret = options.signerSecret || process.env.TRANSFER_SIGNER_SECRET || null; // seed/private key via KMS/env
        this.signerWorkchain = Number(options.signerWorkchain || process.env.TRANSFER_SIGNER_WORKCHAIN || 0);
        this.jettonDecimals = {
            IEPR: Number(process.env.IEPR_DECIMALS || 9),
            USDT: Number(process.env.USDT_DECIMALS || 6)
        };
    }

    /**
     * Send IEPR jetton to a wallet address.
     * @param {string} toAddress
     * @param {number} amountIEPR - human units, not raw
     * @returns {Promise<{ok:boolean, txHash?:string, reason?:string}>}
     */
    async sendIEPR(toAddress, amountIEPR) {
        if (!toAddress) return { ok: false, reason: 'missing_to_address' };
        if (!Number.isFinite(Number(amountIEPR)) || amountIEPR <= 0) return { ok: false, reason: 'invalid_amount' };
        if (!this.ieprJetton) return { ok: false, reason: 'missing_iepr_jetton' };

        if (this.mode === 'disabled') {
            return { ok: false, reason: 'transfers_disabled' };
        }

        if (this.mode === 'simulate') {
            // Generate pseudo tx hash
            const txHash = `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
            return { ok: true, txHash };
        }

        // Live mode
        return await this._sendJetton({
            jettonMasterAddress: this.ieprJetton,
            toAddress,
            humanAmount: amountIEPR,
            decimals: this.jettonDecimals.IEPR
        });
    }

    /**
     * Send USDT jetton to a wallet address.
     * @param {string} toAddress
     * @param {number} amountUSDT - human units
     * @returns {Promise<{ok:boolean, txHash?:string, reason?:string}>}
     */
    async sendUSDT(toAddress, amountUSDT) {
        if (!toAddress) return { ok: false, reason: 'missing_to_address' };
        if (!Number.isFinite(Number(amountUSDT)) || amountUSDT <= 0) return { ok: false, reason: 'invalid_amount' };
        if (!this.usdtJetton) return { ok: false, reason: 'missing_usdt_jetton' };

        if (this.mode === 'disabled') {
            return { ok: false, reason: 'transfers_disabled' };
        }

        if (this.mode === 'simulate') {
            const txHash = `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
            return { ok: true, txHash };
        }

        // Live mode
        return await this._sendJetton({
            jettonMasterAddress: this.usdtJetton,
            toAddress,
            humanAmount: amountUSDT,
            decimals: this.jettonDecimals.USDT
        });
    }

    async _sendJetton({ jettonMasterAddress, toAddress, humanAmount, decimals }) {
        try {
            if (!this.rpcEndpoint) return { ok: false, reason: 'missing_rpc_endpoint' };
            if (!this.signerSecret) return { ok: false, reason: 'missing_signer_secret' };

            const TonWeb = require('tonweb');
            const tonweb = new TonWeb(new TonWeb.HttpProvider(this.rpcEndpoint, {
                apiKey: this.apiKey || undefined
            }));

            // Build keypair from secret seed (ed25519)
            let keyPair;
            try {
                const secret = Buffer.from(this.signerSecret, 'hex');
                keyPair = TonWeb.utils.nacl.sign.keyPair.fromSeed(secret);
            } catch (e) {
                return { ok: false, reason: 'invalid_signer_secret' };
            }

            const WalletClass = TonWeb.wallet.all.v3R2;
            const wallet = new WalletClass(tonweb.provider, {
                publicKey: keyPair.publicKey,
                wc: this.signerWorkchain
            });

            const walletAddress = await wallet.getAddress();

            // Jetton transfer via standard Jetton Wallet contract
            const master = new TonWeb.token.jetton.JettonMaster(tonweb.provider, {
                address: new TonWeb.utils.Address(jettonMasterAddress)
            });
            const userWalletAddress = await master.getJettonWalletAddress(walletAddress);
            const userWallet = new TonWeb.token.jetton.JettonWallet(tonweb.provider, {
                address: userWalletAddress
            });

            const amountRaw = this._toRaw(humanAmount, decimals);

            const body = TonWeb.token.jetton.createTransferBody({
                queryId: Date.now(),
                amount: TonWeb.utils.toNano('0.01'), // forward amount in TON for gas on recipient; adjust as needed
                toAddress: new TonWeb.utils.Address(toAddress),
                responseAddress: walletAddress,
                forwardAmount: new TonWeb.utils.BN(0),
                forwardPayload: new Uint8Array([]),
                jettonAmount: new TonWeb.utils.BN(amountRaw)
            });

            const seqno = await wallet.methods.seqno().call();
            const transfer = wallet.methods.transfer({
                secretKey: keyPair.secretKey,
                toAddress: userWallet.address,
                amount: TonWeb.utils.toNano('0.05'), // TON for fees; tune per network
                seqno,
                payload: body,
                sendMode: 3
            });

            const tx = await transfer.send();
            const txHash = tx && tx.transaction && tx.transaction.hash ? String(tx.transaction.hash) : `live_${Date.now()}`;
            return { ok: true, txHash };
        } catch (e) {
            return { ok: false, reason: e?.message || 'transfer_error' };
        }
    }

    _toRaw(amount, decimals) {
        const factor = Math.pow(10, decimals);
        return Math.round(Number(amount) * factor);
    }
}

module.exports = { JettonTransferService };


