const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET || 'change-me');
        req.admin = payload;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.admin || (req.admin.role !== role && req.admin.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
}

module.exports = { requireAuth, requireRole };


