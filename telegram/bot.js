const fetch = require('node-fetch');
require('dotenv').config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = process.env.API_BASE || 'http://localhost:3000/api/referrals';

if (!TELEGRAM_BOT_TOKEN) {
    console.error('Missing TELEGRAM_BOT_TOKEN in environment');
}

const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId, text, replyMarkup = null) {
    const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
    const res = await fetch(`${apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return res.json();
}

async function setMyCommands() {
    try {
        await fetch(`${apiUrl}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                commands: [
                    { command: 'start', description: 'Start the bot' },
                    { command: 'link', description: 'Get my referral link' },
                    { command: 'stats', description: 'View my stats' }
                ]
            })
        });
    } catch {}
}

async function handleStart(chatId, startParam, from) {
    try {
        let referralCode = null;
        if (startParam && startParam.startsWith('ref_')) {
            referralCode = startParam.substring(4);
        }

        // Create or fetch user via API
        const resp = await fetch(`${API_BASE}/process-referral`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: String(chatId), referralCode, username: from && from.username ? String(from.username) : undefined })
        });
        const data = await resp.json();

        if (!resp.ok) {
            await sendMessage(chatId, 'Failed to initialize your account. Please try again.');
            return;
        }

        const welcome = `🎉 Welcome to IEPR Smart Network!\n\nYour account is ready.`;
        await sendMessage(chatId, welcome);

        // Fetch referral link
        const linkRes = await fetch(`${API_BASE}/users/${data.user._id}/referral-link`);
        const linkJson = await linkRes.json();
        if (linkRes.ok && linkJson.referralLink) {
            await sendMessage(chatId, `🔗 Your referral link:\n${linkJson.referralLink}`);
        }
    } catch (e) {
        await sendMessage(chatId, 'An error occurred. Please try again later.');
    }
}

async function handleTextMessage(message) {
    const chatId = message.chat.id;
    const text = message.text || '';
    const from = message.from || {};

    if (text.startsWith('/start')) {
        const parts = text.split(' ');
        const startParam = parts.length > 1 ? parts[1] : null;
        await handleStart(chatId, startParam, from);
        return;
    }

    if (text === '/link') {
        // attempt to fetch user via referral code lookup using telegramId
        const ensureResp = await fetch(`${API_BASE}/process-referral`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: String(chatId), username: from && from.username ? String(from.username) : undefined })
        });
        const ensure = await ensureResp.json();
        if (!ensureResp.ok) {
            await sendMessage(chatId, 'Unable to retrieve your account.');
            return;
        }
        const linkRes = await fetch(`${API_BASE}/users/${ensure.user._id}/referral-link`);
        const linkJson = await linkRes.json();
        if (linkRes.ok && linkJson.referralLink) {
            await sendMessage(chatId, `🔗 Your referral link:\n${linkJson.referralLink}`);
        } else {
            await sendMessage(chatId, 'Could not fetch your referral link.');
        }
        return;
    }

    if (text === '/stats') {
        const ensureResp = await fetch(`${API_BASE}/process-referral`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: String(chatId), username: from && from.username ? String(from.username) : undefined })
        });
        const ensure = await ensureResp.json();
        if (!ensureResp.ok) {
            await sendMessage(chatId, 'Unable to retrieve your account.');
            return;
        }
        const statsRes = await fetch(`${API_BASE}/users/${ensure.user._id}/stats`);
        const stats = await statsRes.json();
        if (statsRes.ok) {
            await sendMessage(chatId, `📊 Your Statistics:\n\nTotal Referrals: ${stats.totalReferrals}\nL1: ${stats.level1Count}\nL2: ${stats.level2Count}\nCurrent: $${(stats.earnings||0).toFixed(2)}\nTotal: $${(stats.totalEarnings||0).toFixed(2)}`);
        } else {
            await sendMessage(chatId, 'Could not fetch your stats.');
        }
        return;
    }

    await sendMessage(chatId, 'Use /start, /link, or /stats');
}

async function startTelegramBot() {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn('Telegram bot not started (no token).');
        return;
    }
    await setMyCommands();

    let offset = 0;
    console.log('Telegram bot started with polling');

    async function poll() {
        try {
            const res = await fetch(`${apiUrl}/getUpdates?timeout=30&offset=${offset}`);
            const data = await res.json();
            if (data.ok && Array.isArray(data.result)) {
                for (const update of data.result) {
                    offset = update.update_id + 1;
                    if (update.message) {
                        await handleTextMessage(update.message);
                    } else if (update.callback_query) {
                        // no inline keyboard for now; ignore or extend as needed
                    }
                }
            }
        } catch (e) {
            // Backoff on errors
            await new Promise(r => setTimeout(r, 3000));
        } finally {
            setImmediate(poll);
        }
    }

    poll();
}

module.exports = { startTelegramBot };


