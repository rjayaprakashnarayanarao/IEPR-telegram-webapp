const AuditLog = require('../models/AuditLog');
const { logAdminAction } = require('../utils/logger');

function audit(action, resource, getResourceId = (req) => null) {
    return async function auditMiddleware(req, res, next) {
        const start = Date.now();
        const actor = (req.admin && req.admin.username) || 'unknown';
        const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || null;
        const userAgent = req.headers['user-agent'] || null;
        
        try {
            await next();
        } finally {
            try {
                const resourceId = getResourceId(req);
                const duration = Date.now() - start;
                
                // Log to database
                await AuditLog.create({
                    actor,
                    action,
                    resource,
                    resourceId,
                    ip,
                    userAgent,
                    metadata: { 
                        durationMs: duration, 
                        method: req.method, 
                        path: req.originalUrl,
                        statusCode: res.statusCode
                    }
                });
                
                // Log to winston
                logAdminAction(action, resource, resourceId, actor, req);
                
            } catch (error) {
                console.error('Audit logging failed:', error);
            }
        }
    };
}

module.exports = { audit };


