import { NextResponse } from "next/server";
import type { ApiError, ApiErrorCode } from "@/contract";
import { UpstreamUnavailableError } from "./local-api/local-api-source";

/** Shared responses of the `/api/v1` route handlers. */
export function json<T>(body: T): NextResponse<T> {
  return NextResponse.json<T>(body);
}

function error(status: number, code: ApiErrorCode, message: string): NextResponse<ApiError> {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status });
}

export const notFound = (message: string) => error(404, "NOT_FOUND", message);
export const badRequest = (message: string) => error(400, "BAD_REQUEST", message);
export const upstreamUnavailable = (message: string) =>
  error(503, "UPSTREAM_UNAVAILABLE", message);

/** `json(body)` or a 404 when the source found nothing. */
export function jsonOrNotFound<T>(body: T | null, message: string): NextResponse<T | ApiError> {
  return body === null ? notFound(message) : json(body);
}

/**
 * `jsonOrNotFound` for a section a real source may serve: when that source
 * fails it answers 503 (logged on the server), never other data in its place.
 */
export async function jsonFromSource<T>(
  load: () => Promise<T | null>,
  notFoundMessage: string,
  context: string,
): Promise<NextResponse<T | ApiError>> {
  try {
    return jsonOrNotFound(await load(), notFoundMessage);
  } catch (failure) {
    if (!(failure instanceof UpstreamUnavailableError)) throw failure;
    console.error(`[api] ${context}:`, failure.message);
    return upstreamUnavailable("La fuente de datos real no está disponible.");
  }
}
