type D1QueryResult<T = unknown> = {
  success: boolean;
  result?: Array<{
    results: T[];
    success: boolean;
    meta?: unknown;
  }>;
  errors?: Array<{ message: string }>;
};

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;

export async function d1Query<T = unknown>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!accountId || !databaseId || !apiToken) {
    throw new Error("Cloudflare D1 environment variables are not configured.");
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
      cache: "no-store",
    }
  );

  const data = (await response.json()) as D1QueryResult<T>;

  if (!response.ok || !data.success) {
    const message =
      data.errors?.map((e) => e.message).join("; ") ||
      "Cloudflare D1 query failed.";
    throw new Error(message);
  }

  return data.result?.[0]?.results ?? [];
}

export async function d1Execute(
  sql: string,
  params: unknown[] = []
): Promise<void> {
  await d1Query(sql, params);
}
