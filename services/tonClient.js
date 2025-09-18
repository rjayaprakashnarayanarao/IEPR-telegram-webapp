const fetch = require('node-fetch');

/**
 * Lightweight TON API client with TonAPI support for transaction lookups by hash.
 * Falls back gracefully and returns null on network/API errors.
 */
class TonClient {
    constructor(options = {}) {
        this.tonapiBase = options.tonapiBase || process.env.TONAPI_BASE || 'https://tonapi.io';
        this.tonapiKey = options.tonapiKey || process.env.TONAPI_KEY || null;
    }

    /**
     * Fetch a transaction by its hash using TonAPI v2.
     * @param {string} txHash
     * @returns {Promise<object|null>} TonAPI tx object or null
     */
    async getTransactionByHash(txHash) {
        if (!txHash) return null;
        const url = `${this.tonapiBase}/v2/blockchain/transactions/${encodeURIComponent(txHash)}`;
        try {
            const res = await fetch(url, {
                headers: this.tonapiKey ? { 'Authorization': `Bearer ${this.tonapiKey}` } : {}
            });
            if (!res.ok) return null;
            const data = await res.json();
            return data || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Extract jetton transfers from a TonAPI transaction payload (best-effort parser).
     * Returns a normalized list: [{ from, to, amount, jettonAddress }]
     */
    parseJettonTransfers(tx) {
        const transfers = [];
        if (!tx || !tx.in_msg && !tx.out_msgs && !tx.actions) return transfers;

        // TonAPI v2 often includes parsed actions
        const actions = Array.isArray(tx.actions) ? tx.actions : [];
        for (const act of actions) {
            try {
                if (act.type === 'JettonTransfer' || act.type === 'JettonTransferBounced' || (act.JettonTransfer)) {
                    const j = act.JettonTransfer || act;
                    const meta = j.jetton || j.jetton_master || {};
                    const amountStr = String(j.amount || j.JettonTransfer?.amount || '0');
                    const amount = Number(amountStr);
                    const from = this._safeAddr(j.sender || j.sender_address || j.from);
                    const to = this._safeAddr(j.recipient || j.recipient_address || j.to);
                    const jettonAddress = this._safeAddr(meta.address || meta);
                    transfers.push({ from, to, amount, jettonAddress });
                }
            } catch {}
        }

        // Best-effort: also check top-level convenience fields if present
        const jts = Array.isArray(tx.jetton_transfers) ? tx.jetton_transfers : [];
        for (const jt of jts) {
            try {
                const from = this._safeAddr(jt.sender?.address || jt.sender || jt.from);
                const to = this._safeAddr(jt.recipient?.address || jt.recipient || jt.to);
                const jettonAddress = this._safeAddr(jt.jetton?.master?.address || jt.jetton?.address || jt.jetton);
                const amount = Number(jt.amount || 0);
                transfers.push({ from, to, amount, jettonAddress });
            } catch {}
        }
        return transfers;
    }

    _safeAddr(addr) {
        if (!addr) return null;
        return String(addr);
    }
}

module.exports = { TonClient };


