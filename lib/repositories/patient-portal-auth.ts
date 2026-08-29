import { d1Execute, d1Query } from "@/lib/d1/client";
import {
  generatePatientPortalToken,
  hashPatientPortalSessionId,
  hashPatientPortalToken,
  type PatientPortalAccessStatus,
  type PatientPortalTokenPurpose,
} from "@/lib/auth/patient-portal-credentials";
import { hashPortalCode } from "@/lib/repositories/client-portal";

export type PatientPortalAccess = {
  id: string;
  client_id: string;
  code_hash: string;
  is_active: number;
  session_version: number;
  access_status: PatientPortalAccessStatus;
  password_hash: string | null;
  password_must_change: number;
  password_expires_at: string | null;
  last_login_at: string | null;
  locked_until: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PatientPortalToken = {
  id: string;
  client_id: string;
  access_id: string;
  purpose: PatientPortalTokenPurpose;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type PatientPortalSession = {
  id: string;
  session_id_hash: string;
  client_id: string;
  access_id: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
  user_agent_label: string | null;
  ip_hash: string | null;
};

const now = () => new Date().toISOString();

export async function getPatientPortalAccess(clientId: string): Promise<PatientPortalAccess | null> {
  return (await d1Query<PatientPortalAccess>("SELECT * FROM client_portal_access WHERE client_id = ?1 LIMIT 1", [clientId]))[0] ?? null;
}

export async function getPatientPortalAccessByEmail(email: string): Promise<(PatientPortalAccess & { client_name: string; client_email: string }) | null> {
  return (await d1Query<PatientPortalAccess & { client_name: string; client_email: string }>(
    `SELECT p.*, c.name AS client_name, c.email AS client_email
     FROM client_portal_access p INNER JOIN clients c ON c.id = p.client_id
     WHERE lower(c.email) = ?1 LIMIT 1`, [email.trim().toLowerCase()]
  ))[0] ?? null;
}

export async function getOrCreatePatientPortalAccess(clientId: string): Promise<PatientPortalAccess> {
  const existing = await getPatientPortalAccess(clientId);
  if (existing) return existing;
  const id = crypto.randomUUID();
  const timestamp = now();
  // code_hash remains NOT NULL for the legacy portal schema. This value is never
  // returned or accepted by the R8.3 flow and has no corresponding raw code.
  await d1Execute(
    `INSERT INTO client_portal_access
      (id, client_id, code_hash, is_active, session_version, access_status, created_at, updated_at)
     VALUES (?1, ?2, ?3, 0, 1, 'NO_ACCESS', ?4, ?4)`,
    [id, clientId, hashPortalCode(crypto.randomUUID()), timestamp]
  );
  const access = await getPatientPortalAccess(clientId);
  if (!access) throw new Error("Não foi possível criar o acesso do portal.");
  return access;
}

export async function issuePatientPortalToken(input: {
  clientId: string;
  purpose: PatientPortalTokenPurpose;
  expiresInMs: number;
}): Promise<{ token: string; record: PatientPortalToken }> {
  const access = await getOrCreatePatientPortalAccess(input.clientId);
  const token = generatePatientPortalToken();
  const timestamp = now();
  const expiresAt = new Date(Date.now() + input.expiresInMs).toISOString();
  // Invalidate every previous unused token of this purpose before creating one.
  await d1Execute(
    "UPDATE client_portal_tokens SET revoked_at = ?1 WHERE access_id = ?2 AND purpose = ?3 AND used_at IS NULL AND revoked_at IS NULL",
    [timestamp, access.id, input.purpose]
  );
  const record: PatientPortalToken = {
    id: crypto.randomUUID(), client_id: input.clientId, access_id: access.id,
    purpose: input.purpose, token_hash: hashPatientPortalToken(token), expires_at: expiresAt,
    used_at: null, revoked_at: null, created_at: timestamp,
  };
  await d1Execute(
    `INSERT INTO client_portal_tokens (id, client_id, access_id, purpose, token_hash, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    [record.id, record.client_id, record.access_id, record.purpose, record.token_hash, record.expires_at, record.created_at]
  );
  if (input.purpose === "invite") {
    await d1Execute("UPDATE client_portal_access SET access_status = 'INVITE_PENDING', is_active = 0, updated_at = ?1 WHERE id = ?2", [timestamp, access.id]);
  }
  return { token, record };
}

export async function consumePatientPortalToken(token: string, purpose: PatientPortalTokenPurpose): Promise<PatientPortalToken | null> {
  const hash = hashPatientPortalToken(token);
  // Conditional update makes token consumption one-time even when requests race.
  const timestamp = now();
  const consumed = (await d1Query<PatientPortalToken>(
    `UPDATE client_portal_tokens SET used_at = ?1
     WHERE token_hash = ?2 AND purpose = ?3 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?4
     RETURNING *`,
    [timestamp, hash, purpose, timestamp]
  ));
  return consumed[0] ?? null;
}

export async function revokePatientPortalTokens(accessId: string, purpose?: PatientPortalTokenPurpose) {
  const timestamp = now();
  const suffix = purpose ? " AND purpose = ?3" : "";
  await d1Execute(
    `UPDATE client_portal_tokens SET revoked_at = ?1 WHERE access_id = ?2 AND used_at IS NULL AND revoked_at IS NULL${suffix}`,
    purpose ? [timestamp, accessId, purpose] : [timestamp, accessId]
  );
}

export async function createPatientPortalSession(input: { clientId: string; accessId: string; expiresInMs: number; userAgentLabel?: string | null; ipHash?: string | null }) {
  const sessionId = generatePatientPortalToken();
  const timestamp = now();
  const record: PatientPortalSession = {
    id: crypto.randomUUID(), session_id_hash: hashPatientPortalSessionId(sessionId), client_id: input.clientId,
    access_id: input.accessId, created_at: timestamp, last_used_at: timestamp,
    expires_at: new Date(Date.now() + input.expiresInMs).toISOString(), revoked_at: null,
    user_agent_label: input.userAgentLabel?.slice(0, 120) ?? null, ip_hash: input.ipHash ?? null,
  };
  await d1Execute(
    `INSERT INTO client_portal_sessions (id, session_id_hash, client_id, access_id, created_at, last_used_at, expires_at, user_agent_label, ip_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    [record.id, record.session_id_hash, record.client_id, record.access_id, record.created_at, record.last_used_at, record.expires_at, record.user_agent_label, record.ip_hash]
  );
  return { sessionId, record };
}

export async function getActivePatientPortalSession(sessionId: string): Promise<PatientPortalSession | null> {
  const row = (await d1Query<PatientPortalSession>(
    "SELECT * FROM client_portal_sessions WHERE session_id_hash = ?1 AND revoked_at IS NULL AND expires_at > ?2 LIMIT 1",
    [hashPatientPortalSessionId(sessionId), now()]
  ))[0] ?? null;
  if (row) await d1Execute("UPDATE client_portal_sessions SET last_used_at = ?1 WHERE id = ?2", [now(), row.id]);
  return row;
}

export async function revokePatientPortalSessions(accessId: string, sessionId?: string) {
  const timestamp = now();
  if (sessionId) {
    await d1Execute("UPDATE client_portal_sessions SET revoked_at = ?1 WHERE access_id = ?2 AND session_id_hash = ?3 AND revoked_at IS NULL", [timestamp, accessId, hashPatientPortalSessionId(sessionId)]);
    return;
  }
  await d1Execute("UPDATE client_portal_sessions SET revoked_at = ?1 WHERE access_id = ?2 AND revoked_at IS NULL", [timestamp, accessId]);
}

export async function listPatientPortalSessions(clientId: string): Promise<PatientPortalSession[]> {
  return d1Query<PatientPortalSession>(
    `SELECT s.* FROM client_portal_sessions s
     INNER JOIN client_portal_access a ON a.id = s.access_id
     WHERE s.client_id = ?1 AND s.revoked_at IS NULL AND s.expires_at > ?2
     ORDER BY s.last_used_at DESC LIMIT 30`, [clientId, now()]
  );
}

export async function revokePatientPortalSessionByRecordId(clientId: string, sessionRecordId: string): Promise<boolean> {
  const timestamp = now();
  const result = await d1Query<{ id: string }>(
    `UPDATE client_portal_sessions SET revoked_at = ?1
     WHERE id = ?2 AND client_id = ?3 AND revoked_at IS NULL
     RETURNING id`, [timestamp, sessionRecordId, clientId]
  );
  return result.length === 1;
}

export async function setPatientPortalPassword(input: {
  accessId: string;
  passwordHash: string;
  mustChangePassword?: boolean;
  passwordExpiresAt?: string | null;
}) {
  const timestamp = now();
  const mustChange = input.mustChangePassword ? 1 : 0;
  await d1Execute(
    `UPDATE client_portal_access
     SET password_hash = ?1, password_must_change = ?2, password_expires_at = ?3,
         access_status = ?4, is_active = 1, locked_until = NULL, revoked_at = NULL, updated_at = ?5
     WHERE id = ?6`,
    [input.passwordHash, mustChange, input.passwordExpiresAt ?? null,
      mustChange ? "TEMP_PASSWORD" : "ACTIVE", timestamp, input.accessId]
  );
}

export async function recordPatientPortalLogin(accessId: string) {
  const timestamp = now();
  await d1Execute(
    "UPDATE client_portal_access SET last_login_at = ?1, last_used_at = ?1, updated_at = ?1 WHERE id = ?2",
    [timestamp, accessId]
  );
}

export async function revokePatientPortalAccess(clientId: string) {
  const access = await getPatientPortalAccess(clientId);
  if (!access) return null;
  const timestamp = now();
  await d1Execute(
    `UPDATE client_portal_access SET access_status = 'REVOKED', is_active = 0,
     password_hash = NULL, password_must_change = 0, password_expires_at = NULL,
     session_version = session_version + 1, revoked_at = ?1, updated_at = ?1 WHERE id = ?2`,
    [timestamp, access.id]
  );
  await Promise.all([revokePatientPortalTokens(access.id), revokePatientPortalSessions(access.id)]);
  return access;
}
