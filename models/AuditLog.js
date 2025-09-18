const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    actor: { type: String, required: true }, // admin username or id
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    metadata: { type: Object, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);


