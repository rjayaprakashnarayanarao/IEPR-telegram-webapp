// Telegram Bot Integration Example
// This file shows how to integrate the referral system with a Telegram bot

// Example Telegram Bot API integration
class TelegramBotIntegration {
    constructor(botToken) {
        this.botToken = botToken;
        this.apiUrl = `https://api.telegram.org/bot${botToken}`;
    }

    // Handle /start command with referral parameter
    async handleStart(chatId, username, startParam) {
        try {
            // Initialize user in referral system
            const user = window.telegramIntegration.initBot(chatId.toString(), startParam);
            
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
        const stats = window.telegramIntegration.getUserStats(chatId.toString());
        
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
            await this.sendMessage(chatId, "No statistics available.");
        }
    }

    // Show user referrals by level
    async showReferrals(chatId) {
        const stats = window.telegramIntegration.getUserStats(chatId.toString());
        
        if (stats && stats.totalReferrals > 0) {
            let referralsMessage = "👥 Your Referrals:\n\n";
            
            if (stats.level1Count > 0) {
                referralsMessage += `Level 1 (${stats.level1Count}/3):\n`;
                // Get actual referral users
                for (const [userId, user] of window.referralSystem.users) {
                    if (user.telegramId === chatId.toString()) {
                        const level1Users = window.referralSystem.getUsersByLevel(userId, 1);
                        level1Users.forEach(refUser => {
                            referralsMessage += `• User ${refUser.id} (${refUser.joined})\n`;
                        });
                        break;
                    }
                }
                referralsMessage += "\n";
            }
            
            if (stats.level2Count > 0) {
                referralsMessage += `Level 2 (${stats.level2Count}/9):\n`;
                for (const [userId, user] of window.referralSystem.users) {
                    if (user.telegramId === chatId.toString()) {
                        const level2Users = window.referralSystem.getUsersByLevel(userId, 2);
                        level2Users.forEach(refUser => {
                            referralsMessage += `• User ${refUser.id} (${refUser.joined})\n`;
                        });
                        break;
                    }
                }
                referralsMessage += "\n";
            }
            
            if (stats.level3Count > 0) {
                referralsMessage += `Level 3 (${stats.level3Count}/27):\n`;
                for (const [userId, user] of window.referralSystem.users) {
                    if (user.telegramId === chatId.toString()) {
                        const level3Users = window.referralSystem.getUsersByLevel(userId, 3);
                        level3Users.forEach(refUser => {
                            referralsMessage += `• User ${refUser.id} (${refUser.joined})\n`;
                        });
                        break;
                    }
                }
            }
            
            await this.sendMessage(chatId, referralsMessage);
        } else {
            await this.sendMessage(chatId, "You don't have any referrals yet. Share your referral link to start earning!");
        }
    }

    // Show earnings
    async showEarnings(chatId) {
        const stats = window.telegramIntegration.getUserStats(chatId.toString());
        
        if (stats) {
            const earningsMessage = `
💰 Your Earnings:

Total Earned: ${stats.earnings.toFixed(2)} TON
Level 1 Earnings: ${(stats.level1Count * 0.05).toFixed(2)} TON
Level 2 Earnings: ${(stats.level2Count * 0.03).toFixed(2)} TON
Level 3 Earnings: ${(stats.level3Count * 0.01).toFixed(2)} TON

Keep referring users to earn more!
            `;
            
            await this.sendMessage(chatId, earningsMessage);
        } else {
            await this.sendMessage(chatId, "No earnings data available.");
        }
    }

    // Share referral link
    async shareReferralLink(chatId) {
        const referralLink = window.telegramIntegration.getReferralLink(chatId.toString());
        
        if (referralLink) {
            const shareMessage = `
🔗 Share Your Referral Link:

${referralLink}

When someone joins using your link, you'll earn rewards!

Level 1: 0.05 TON per referral
Level 2: 0.03 TON per referral  
Level 3: 0.01 TON per referral
            `;
            
            await this.sendMessage(chatId, shareMessage);
        } else {
            await this.sendMessage(chatId, "Unable to generate referral link.");
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
