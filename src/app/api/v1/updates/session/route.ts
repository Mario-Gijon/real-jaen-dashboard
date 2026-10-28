import type { NextResponse } from "next/server";
import type { ApiError } from "@/contract";
import {
  clearedCookie,
  recordFailure,
  sameOrigin,
  sessionCookie,
  throttled,
  updatesConfigured,
  validKey,
} from "@/server/updates/operator";
import { empty, failure, unavailable } from "@/server/updates/responses";

/** Opens an operator session with the configured key (`{"key": "…"}`). */
export async function POST(request: Request): Promise<NextResponse<ApiError> | Response> {
  if (!updatesConfigured()) return unavailable();
  if (!sameOrigin(request)) return failure(403, "FORBIDDEN", "Origen no permitido.");
  if (throttled(request)) return failure(429, "TOO_MANY_REQUESTS", "Demasiados intentos. Espera unos minutos.");
  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  if (!validKey(body?.key)) {
    recordFailure(request);
    return failure(401, "UNAUTHORIZED", "Clave de operador no válida.");
  }
  return empty({ "Set-Cookie": sessionCookie(request) });
}

/** Closes the operator session. */
export async function DELETE(request: Request): Promise<NextResponse<ApiError> | Response> {
  if (!sameOrigin(request)) return failure(403, "FORBIDDEN", "Origen no permitido.");
  return empty({ "Set-Cookie": clearedCookie(request) });
}
