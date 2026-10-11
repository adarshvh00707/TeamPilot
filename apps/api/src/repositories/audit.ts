import type { Queryable } from '../db/types';

export interface AuditEntry {
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Must not contain secrets, tokens, or sensitive personal data. */
  metadata?: Record<string, unknown>;
}

export async function writeAudit(db: Queryable, entry: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      entry.organizationId,
      entry.actorUserId,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      JSON.stringify(entry.metadata ?? {}),
    ],
  );
}
