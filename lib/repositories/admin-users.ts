import { d1Query, d1Execute } from "@/lib/d1/client";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  must_change_password: number;
  created_at: string;
  updated_at: string;
};

export async function getAdminByEmail(
  email: string
): Promise<AdminUser | null> {
  const rows = await d1Query<AdminUser>(
    `SELECT id, name, email, password_hash, must_change_password, created_at, updated_at
     FROM admin_users WHERE email = ?1 LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
}

export async function getAdminById(id: string): Promise<AdminUser | null> {
  const rows = await d1Query<AdminUser>(
    `SELECT id, name, email, password_hash, must_change_password, created_at, updated_at
     FROM admin_users WHERE id = ?1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createOrUpdateInitialAdmin(input: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT INTO admin_users (id, name, email, password_hash, must_change_password, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)
     ON CONFLICT(email) DO UPDATE SET
       name = excluded.name,
       password_hash = excluded.password_hash,
       must_change_password = 1,
       updated_at = excluded.updated_at`,
    [input.id, input.name, input.email, input.passwordHash, now, now]
  );
}

export async function updateAdminPassword(
  userId: string,
  passwordHash: string
): Promise<void> {
  await d1Execute(
    `UPDATE admin_users SET password_hash = ?1, updated_at = ?2 WHERE id = ?3`,
    [passwordHash, new Date().toISOString(), userId]
  );
}

export async function setMustChangePassword(
  userId: string,
  value: boolean
): Promise<void> {
  await d1Execute(
    `UPDATE admin_users SET must_change_password = ?1, updated_at = ?2 WHERE id = ?3`,
    [value ? 1 : 0, new Date().toISOString(), userId]
  );
}
