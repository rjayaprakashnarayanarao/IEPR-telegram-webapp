const { body, query, param, validationResult } = require('express-validator');

function validate(rules) {
    return async (req, res, next) => {
        await Promise.all(rules.map(rule => rule.run(req)));
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'validation_failed', details: errors.array() });
        }
        next();
    };
}

// Custom validation for purchase endpoint - either walletAddress or telegramId required
function validatePurchaseWithCustomLogic(rules) {
    return async (req, res, next) => {
        await Promise.all(rules.map(rule => rule.run(req)));
        const errors = validationResult(req);
        
        // Custom validation: either walletAddress or telegramId must be provided
        const { walletAddress, telegramId } = req.body || {};
        if (!walletAddress && !telegramId) {
            errors.array().push({
                field: 'walletAddress',
                message: 'Either walletAddress or telegramId is required',
                value: undefined
            });
        }
        
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'validation_failed', details: errors.array() });
        }
        next();
    };
}

// Common validators
const vWallet = body('walletAddress').optional().isString().isLength({ min: 5, max: 200 }).trim();
const vTxHash = body('txHash').isString().isLength({ min: 10, max: 200 }).trim();
const vReferralCode = body('referralCode').optional().isString().isLength({ min: 4, max: 64 }).trim();
const vTelegramId = body('telegramId').optional().isString().isLength({ min: 1, max: 64 }).trim();
const vUsername = body('username').optional().isString().isLength({ min: 1, max: 64 }).trim();

// Purchase
const validatePurchase = validatePurchaseWithCustomLogic([
    vTxHash,
    vWallet,
    vTelegramId,
    vReferralCode,
    vUsername
]);

// Claim tokens
const validateClaimTokens = validate([
    body('userId').optional().isString().isLength({ min: 10, max: 64 }),
    body('walletAddress').optional().isString().isLength({ min: 5, max: 200 })
]);

// Withdraw
const validateWithdraw = validate([
    body('userId').isString().isLength({ min: 10, max: 64 }),
    body('amountUSDT').isFloat({ gt: 0 }),
    body('toWalletAddress').optional().isString().isLength({ min: 5, max: 200 })
]);

// Dashboard
const validateDashboard = validate([
    query('userId').optional().isString().isLength({ min: 10, max: 64 }),
    query('walletAddress').optional().isString().isLength({ min: 5, max: 200 })
]);

// Params validators used by legacy endpoints
const validateUserIdParam = validate([
    param('userId').isString().isLength({ min: 10, max: 64 })
]);

module.exports = {
    validate,
    validatePurchase,
    validateClaimTokens,
    validateWithdraw,
    validateDashboard,
    validateUserIdParam
};


