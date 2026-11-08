import "server-only";
import { neon } from "@neondatabase/serverless";
import type { NextRequest } from "next/server";

type RejaSql = ReturnType<typeof neon>;

let client: RejaSql | null = null;
let configuredUrl: string | null = null;

export function getRejaReadClient(): RejaSql | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;

  if (configuredUrl !== url) {
    client = neon(url, {
      fetchOptions: {
        cache: "no-store",
        signal: AbortSignal.timeout(8000)
      }
    });
    configuredUrl = url;
  }
  return client;
}

export type PageRequest = { limit: number; offset: number };

export function getPageRequest(request: NextRequest): PageRequest {
  const params = request.nextUrl.searchParams;
  const parsedLimit = Number.parseInt(params.get("limit") ?? "", 10);
  const parsedOffset = Number.parseInt(params.get("offset") ?? "", 10);
  return {
    limit: Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 20,
    offset: Number.isFinite(parsedOffset) ? Math.min(10000, Math.max(0, parsedOffset)) : 0
  };
}

export async function queryReadRows<T>(
  sql: RejaSql,
  statement: string,
  values: unknown[] = []
): Promise<T[]> {
  return await sql.query(statement, values) as unknown as T[];
}

export function platformErrorResponse() {
  return Response.json(
    { error: "platform_data_unavailable", items: [] },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

export function platformJson(data: unknown) {
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
