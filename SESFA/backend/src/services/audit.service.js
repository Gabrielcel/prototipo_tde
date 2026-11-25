import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * Registra uma operação importante.
 * - Dentro de transação: passe o client; a falha desfaz a operação (auditoria obrigatória).
 * - Fora de transação: use `auditSafe`, que apenas registra a falha no log interno.
 */
export async function audit(executor, entry) {
    const run = executor ?? { query };
    await run.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, result, ip, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
            entry.userId ?? null,
            entry.action,
            entry.resourceType ?? null,
            entry.resourceId ?? null,
            entry.result ?? 'success',
            entry.ip ?? null,
            JSON.stringify(entry.metadata ?? {}),
        ]
    );
}

export async function auditSafe(entry) {
    try {
        await audit(null, entry);
    } catch (error) {
        logger.error('Falha ao gravar auditoria.', { action: entry.action, code: error.code });
    }
}

export async function listAuditLogs({ limit, offset }, filters = {}) {
    const conditions = [];
    const values = [];
    if (filters.action) {
        values.push(filters.action);
        conditions.push(`a.action = $${values.length}`);
    }
    if (filters.userId) {
        values.push(filters.userId);
        conditions.push(`a.user_id = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await query(`SELECT COUNT(*)::int AS total FROM audit_logs a ${where}`, values);
    const rows = await query(
        `SELECT a.id, a.action, a.resource_type, a.resource_id, a.result, a.ip, a.metadata,
                a.created_at, u.full_name AS user_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
         ${where}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
    );
    return {
        total: total.rows[0].total,
        items: rows.rows.map((row) => ({
            id: row.id,
            action: row.action,
            resourceType: row.resource_type,
            resourceId: row.resource_id,
            result: row.result,
            ip: row.ip,
            metadata: row.metadata,
            userName: row.user_name,
            createdAt: row.created_at,
        })),
    };
}
