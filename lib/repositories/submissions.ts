import { d1Query, d1Execute } from "@/lib/d1/client";

export interface Submission {
  id: string;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  child_name: string | null;
  child_age: string | null;
  form_type: string;
  answers_json: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionWithAnswers extends Omit<Submission, "answers_json"> {
  answers: Record<string, unknown>;
}

export interface CreateSubmissionInput {
  patient_name: string;
  patient_email?: string | null;
  patient_phone?: string | null;
  child_name?: string | null;
  child_age?: string | null;
  form_type?: string;
  answers: Record<string, string>;
}

export interface SubmissionFilters {
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface SubmissionListResult {
  items: SubmissionSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SubmissionSummary {
  id: string;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  child_name: string | null;
  child_age: string | null;
  form_type: string;
  status: string;
  created_at: string;
  objetivo?: string;
  tipoAtendimento?: string;
}

export interface DashboardMetrics {
  total: number;
  novos: number;
  ultimos7dias: number;
  finalizados: number;
}

function buildWhereClause(
  filters: SubmissionFilters,
  startIndex = 1
): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = startIndex;

  if (filters.search) {
    conditions.push(
      `(patient_name LIKE ?${idx} OR patient_email LIKE ?${idx} OR patient_phone LIKE ?${idx})`
    );
    params.push(`%${filters.search}%`);
    idx++;
  }
  if (filters.status) {
    conditions.push(`status = ?${idx}`);
    params.push(filters.status);
    idx++;
  }
  if (filters.from) {
    conditions.push(`created_at >= ?${idx}`);
    params.push(filters.from);
    idx++;
  }
  if (filters.to) {
    conditions.push(`created_at <= ?${idx}`);
    params.push(filters.to + "T23:59:59.999Z");
    idx++;
  }

  const clause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { clause, params };
}

export async function createSubmission(
  input: CreateSubmissionInput
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const cleanAnswers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.answers)) {
    if (v !== undefined && v !== null && v !== "") {
      cleanAnswers[k] = String(v);
    }
  }

  await d1Execute(
    `INSERT INTO form_submissions
      (id, patient_name, patient_email, patient_phone, child_name, child_age,
       form_type, answers_json, status, notes, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'novo', NULL, ?9, ?10)`,
    [
      id,
      input.patient_name,
      input.patient_email || null,
      input.patient_phone || null,
      input.child_name || null,
      input.child_age || null,
      input.form_type || "pre_consulta",
      JSON.stringify(cleanAnswers),
      now,
      now,
    ]
  );

  return id;
}

export async function getSubmissions(
  filters: SubmissionFilters = {}
): Promise<SubmissionListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const { clause, params } = buildWhereClause(filters);

  const countRows = await d1Query<{ total: number }>(
    `SELECT COUNT(*) as total FROM form_submissions ${clause}`,
    params
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await d1Query<Submission>(
    `SELECT id, patient_name, patient_email, patient_phone, child_name, child_age,
            form_type, answers_json, status, created_at, updated_at
     FROM form_submissions ${clause}
     ORDER BY created_at DESC
     LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`,
    [...params, pageSize, offset]
  );

  const items: SubmissionSummary[] = rows.map((row) => {
    let answers: Record<string, unknown> = {};
    try {
      answers = JSON.parse(row.answers_json) as Record<string, unknown>;
    } catch {}
    return {
      id: row.id,
      patient_name: row.patient_name,
      patient_email: row.patient_email,
      patient_phone: row.patient_phone,
      child_name: row.child_name,
      child_age: row.child_age,
      form_type: row.form_type,
      status: row.status,
      created_at: row.created_at,
      objetivo: typeof answers["objetivo"] === "string" ? answers["objetivo"] : undefined,
      tipoAtendimento: typeof answers["tipoAtendimento"] === "string" ? answers["tipoAtendimento"] : undefined,
    };
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getSubmissionById(
  id: string
): Promise<SubmissionWithAnswers | null> {
  const rows = await d1Query<Submission>(
    `SELECT * FROM form_submissions WHERE id = ?1`,
    [id]
  );

  if (!rows[0]) return null;

  const row = rows[0];
  let answers: Record<string, string> = {};
  try {
    answers = JSON.parse(row.answers_json);
  } catch {}

  const { answers_json: _, ...rest } = row;
  return { ...rest, answers };
}

export async function updateSubmission(
  id: string,
  data: { status?: string; notes?: string }
): Promise<void> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.status !== undefined) {
    updates.push(`status = ?${idx++}`);
    params.push(data.status);
  }
  if (data.notes !== undefined) {
    updates.push(`notes = ?${idx++}`);
    params.push(data.notes);
  }
  if (updates.length === 0) return;

  updates.push(`updated_at = ?${idx++}`);
  params.push(new Date().toISOString());
  params.push(id);

  await d1Execute(
    `UPDATE form_submissions SET ${updates.join(", ")} WHERE id = ?${idx}`,
    params
  );
}

export async function getDashboardMetrics(
  filters: { from?: string; to?: string } = {}
): Promise<DashboardMetrics> {
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [totalRow, novosRow, recentRow, finalizadosRow] = await Promise.all([
    d1Query<{ c: number }>("SELECT COUNT(*) as c FROM form_submissions", []),
    d1Query<{ c: number }>(
      "SELECT COUNT(*) as c FROM form_submissions WHERE status = 'novo'",
      []
    ),
    d1Query<{ c: number }>(
      "SELECT COUNT(*) as c FROM form_submissions WHERE created_at >= ?1",
      [sevenDaysAgo]
    ),
    d1Query<{ c: number }>(
      "SELECT COUNT(*) as c FROM form_submissions WHERE status = 'finalizado'",
      []
    ),
  ]);

  return {
    total: totalRow[0]?.c ?? 0,
    novos: novosRow[0]?.c ?? 0,
    ultimos7dias: recentRow[0]?.c ?? 0,
    finalizados: finalizadosRow[0]?.c ?? 0,
  };
}

export async function getSubmissionsForExport(
  filters: SubmissionFilters = {}
): Promise<SubmissionWithAnswers[]> {
  const { clause, params } = buildWhereClause(filters);

  const rows = await d1Query<Submission>(
    `SELECT * FROM form_submissions ${clause} ORDER BY created_at DESC LIMIT 10000`,
    params
  );

  return rows.map((row) => {
    let answers: Record<string, unknown> = {};
    try {
      answers = JSON.parse(row.answers_json) as Record<string, unknown>;
    } catch {}
    const { answers_json: _, ...rest } = row;
    return { ...rest, answers };
  });
}
