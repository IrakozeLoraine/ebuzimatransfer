export interface AuditLog {
    id: string;
    user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    ip_address: string | null;
    extra: Record<string, unknown> | null;
    created_at: string;
}

export interface AuditLogFilters {
    entity_type?: string;
    action?: string;
    user_id?: string;
    limit?: number;
    offset?: number;
}
