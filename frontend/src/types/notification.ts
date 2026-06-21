export interface Notification {
  id: string;
  title: string;
  message: string;
  event_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}
