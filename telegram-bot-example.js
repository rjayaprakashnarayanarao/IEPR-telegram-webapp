// Telegram Bot Integration Example
// This file shows how to integrate the referral system with a Telegram bot
// 
// NOTE: This example uses the old localStorage-based system for demonstration purposes.
// In production, use the MongoDB-based system (referral-system-mongodb.js) with API calls.

// Example Telegram Bot API integration
class TelegramBotIntegration {
    constructor(botToken) {
        this.botToken = botToken;
        this.apiUrl = `https://api.telegram.org/bot${botToken}`;
    }

    // Handle /start command with referral parameter
    async handleStart(chatId, username, startParam) {
        try {
        // Initialize user in referral system (using MongoDB system)
        // Note: This example uses the old localStorage system for demonstration
        // In production, use the MongoDB-based system via API calls
            
            const welcomeMessage = `
🎉 Welcome to IEPR Smart Network!

Your referral link: ${window.telegramIntegration.getReferralLink(chatId.toString())}

Share this link to earn rewards!
            `;
            
            await this.sendMessage(chatId, welcomeMessage);
            
            // Send inline keyboard with main menu
            const keyboard = {
                inline_keyboard: [
                    [{ text: "📊 My Stats", callback_data: "stats" }],
                    [{ text: "👥 My Referrals", callback_data: "referrals" }],
                    [{ text: "💰 Earnings", callback_data: "earnings" }],
                    [{ text: "🔗 Share Link", callback_data: "share" }]
                ]
            };
            
            await this.sendMessage(chatId, "Choose an option:", keyboard);
            
        } catch (error) {
            console.error('Error handling start command:', error);
            await this.sendMessage(chatId, "Sorry, something went wrong. Please try again.");
        }
    }

    // Handle callback queries (button clicks)
    async handleCallbackQuery(chatId, callbackData) {
        try {
            switch (callbackData) {
                case 'stats':
                    await this.showStats(chatId);
                    break;
                case 'referrals':
                    await this.showReferrals(chatId);
                    break;
                case 'earnings':
                    await this.showEarnings(chatId);
                    break;
                case 'share':
                    await this.shareReferralLink(chatId);
                    break;
                default:
                    await this.sendMessage(chatId, "Unknown option selected.");
            }
        } catch (error) {
            console.error('Error handling callback query:', error);
        }
    }

    // Show user statistics
    async showStats(chatId) {
        // Note: This example uses the old localStorage system for demonstration
        // In production, use the MongoDB-based system via API calls
        const stats = window.telegramIntegration?.getUserStats?.(chatId.toString());
        
        if (stats) {
            const statsMessage = `
📊 Your Statistics:

Total Referrals: ${stats.totalReferrals}
Level 1: ${stats.level1Count}/3
Level 2: ${stats.level2Count}/9
Level 3: ${stats.level3Count}/27
Total Earnings: ${stats.earnings.toFixed(2)} TON
Tree ID: ${stats.treeId}
Your Level: ${stats.level}
            `;
            
            await this.sendMessage(chatId, statsMessage);
        } else {
            await this.sendMessage(chatId, "No statistics available. Use the MongoDB-based system for production.");
        }
    }

    // Show user referrals by level
    async showReferrals(chatId) {
        // Note: This example uses the old localStorage system for demonstration
        // In production, use the MongoDB-based system via API calls
        const stats = window.telegramIntegration?.getUserStats?.(chatId.toString());
        
        if (stats && stats.totalReferrals > 0) {
            let referralsMessage = "👥 Your Referrals:\n\n";
            referralsMessage += "Note: This is a demo using the old system.\n";
            referralsMessage += "In production, use the MongoDB-based system.\n\n";
            
            referralsMessage += `Total Referrals: ${stats.totalReferrals}\n`;
            referralsMessage += `Level 1: ${stats.level1Count}/3\n`;
            referralsMessage += `Level 2: ${stats.level2Count}/9\n`;
            referralsMessage += `Level 3: ${stats.level3Count}/27\n`;
            
            await this.sendMessage(chatId, referralsMessage);
        } else {
            await this.sendMessage(chatId, "You don't have any referrals yet. Share your referral link to start earning!");
        }
    }

    // Show earnings
    async showEarnings(chatId) {
        // Note: This example uses the old localStorage system for demonstration
        // In production, use the MongoDB-based system via API calls
        const stats = window.telegramIntegration?.getUserStats?.(chatId.toString());
        
        if (stats) {
            const earningsMessage = `
💰 Your Earnings:

Total Earned: ${stats.earnings.toFixed(2)} TON
Level 1 Earnings: ${(stats.level1Count * 0.05).toFixed(2)} TON
Level 2 Earnings: ${(stats.level2Count * 0.03).toFixed(2)} TON
Level 3 Earnings: ${(stats.level3Count * 0.01).toFixed(2)} TON

Note: This is a demo using the old system.
In production, use the MongoDB-based system.

Keep referring users to earn more!
            `;
            
            await this.sendMessage(chatId, earningsMessage);
        } else {
            await this.sendMessage(chatId, "No earnings data available. Use the MongoDB-based system for production.");
        }
    }

    // Share referral link
    async shareReferralLink(chatId) {
        // Note: This example uses the old localStorage system for demonstration
        // In production, use the MongoDB-based system via API calls
        const referralLink = window.telegramIntegration?.getReferralLink?.(chatId.toString());
        
        if (referralLink) {
            const shareMessage = `
🔗 Share Your Referral Link:

${referralLink}

When someone joins using your link, you'll earn rewards!

Level 1: 0.05 TON per referral
Level 2: 0.03 TON per referral  
Level 3: 0.01 TON per referral

Note: This is a demo using the old system.
In production, use the MongoDB-based system.
            `;
            
            await this.sendMessage(chatId, shareMessage);
        } else {
            await this.sendMessage(chatId, "Unable to generate referral link. Use the MongoDB-based system for production.");
        }
    }

    // Send message to Telegram
    async sendMessage(chatId, text, replyMarkup = null) {
        const payload = {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        };
        
        if (replyMarkup) {
            payload.reply_markup = JSON.stringify(replyMarkup);
        }
        
        const response = await fetch(`${this.apiUrl}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        return response.json();
    }

    // Webhook handler for incoming updates
    async handleWebhook(update) {
        try {
            if (update.message) {
                const { chat, text, from } = update.message;
                
                if (text === '/start') {
                    const startParam = update.message.text.split(' ')[1];
                    await this.handleStart(chat.id, from.username, startParam);
                }
            } else if (update.callback_query) {
                const { message, data } = update.callback_query;
                await this.handleCallbackQuery(message.chat.id, data);
            }
        } catch (error) {
            console.error('Error handling webhook:', error);
        }
    }
}

// Example usage:
// const bot = new TelegramBotIntegration('YOUR_BOT_TOKEN');

// Webhook endpoint example (for Express.js):
/*
app.post('/webhook', async (req, res) => {
    try {
        await bot.handleWebhook(req.body);
        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Error');
    }
});
*/

// Export for use in other files
window.TelegramBotIntegration = TelegramBotIntegration;
