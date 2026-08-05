type D1Result<T = unknown> = {
  results: T[];
  success: boolean;
  meta?: {
    changes?: number;
    duration?: number;
    rows_read?: number;
    rows_written?: number;
  };
};

type D1QueryResponse<T = unknown> = {
  success: boolean;
  result?: Array<D1Result<T>>;
  errors?: Array<{ message: string }>;
};

export type D1Statement = {
  sql: string;
  params?: unknown[];
};

export type D1BatchResult<T = unknown> = D1Result<T>;

type D1RequestBody =
  | { sql: string; params?: unknown[] }
  | { batch: Array<{ sql: string; params?: unknown[] }> };

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
const requestTimeoutMs = Number(process.env.CLOUDFLARE_D1_TIMEOUT_MS ?? 15_000);

function assertConfiguration() {
  if (!accountId || !databaseId || !apiToken) {
    throw new Error("Cloudflare D1 environment variables are not configured.");
  }
}

async function requestD1<T>(body: D1RequestBody): Promise<Array<D1Result<T>>> {
  assertConfiguration();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      }
    );

    const data = (await response.json()) as D1QueryResponse<T>;
    const failedStatement = data.result?.find((result) => !result.success);
    if (!response.ok || !data.success || failedStatement) {
      const message = data.errors?.map((error) => error.message).join("; ") || "Cloudflare D1 query failed.";
      throw new Error(message);
    }

    return data.result ?? [];
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Cloudflare D1 request timed out after ${requestTimeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function d1Query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const results = await requestD1<T>(params.length ? { sql, params } : { sql });
  return results[0]?.results ?? [];
}

export async function d1Execute(sql: string, params: unknown[] = []): Promise<void> {
  await d1Query(sql, params);
}

/**
 * Executes prepared statements in one D1 HTTP request and transaction.
 */
export async function d1Batch<T = unknown>(statements: D1Statement[]): Promise<Array<D1BatchResult<T>>> {
  if (!statements.length) return [];
  return requestD1<T>({
    batch: statements.map(({ sql, params }) => params?.length ? { sql, params } : { sql }),
  });
}
