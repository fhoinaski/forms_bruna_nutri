import { d1Query, d1Execute } from "@/lib/d1/client";

export interface TimelineEvent {
  id: string;
  client_id: string;
  type: string;
  title: string;
  description: string | null;
  metadata_json: string | null;
  created_at: string;
}

export interface AddTimelineEventInput {
  client_id: string;
  type: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

export async function addTimelineEvent(input: AddTimelineEventInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await d1Execute(
    `INSERT INTO client_timeline_events (id, client_id, type, title, description, metadata_json, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    [
      id,
      input.client_id,
      input.type,
      input.title,
      input.description ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
    ]
  );

  return id;
}

export async function getClientTimeline(clientId: string): Promise<TimelineEvent[]> {
  return d1Query<TimelineEvent>(
    `SELECT * FROM client_timeline_events WHERE client_id = ?1 ORDER BY created_at DESC`,
    [clientId]
  );
}
