import { NextResponse } from "next/server";
import type { ApiError, ApiErrorCode } from "@/contract";
import { ControlConflictError, ControlUnavailableError } from "./control-client";
import { isOperator, sameOrigin, updatesConfigured } from "./operator";

/** Responses of the update routes: never cached, errors in the contract's shape. */
export function noStore<T>(body: T, status = 200, headers: Record<string, string> = {}): NextResponse<T> {
  return NextResponse.json<T>(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function failure(status: number, code: ApiErrorCode, message: string): NextResponse<ApiError> {
  return noStore<ApiError>({ error: { code, message } }, status);
}

export const empty = (headers: Record<string, string> = {}) =>
  new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store", ...headers } });

export const unavailable = () =>
  failure(409, "UPDATE_UNAVAILABLE", "La actualización no está disponible en esta instalación.");

/**
 * The checks of every operator operation, in order: configured, same origin (state changes only), operator
 * session. `null` when the request may go on.
 */
export function refuse(request: Request, { changesState }: { changesState: boolean }): NextResponse<ApiError> | null {
  if (!updatesConfigured()) return unavailable();
  if (changesState && !sameOrigin(request)) return failure(403, "FORBIDDEN", "Origen no permitido.");
  if (!isOperator(request)) return failure(401, "UNAUTHORIZED", "Inicia sesión como operador.");
  return null;
}

/** A backend failure as a contract error; anything unexpected is not hidden. */
export function fromControl(error: unknown, context: string): NextResponse<ApiError> {
  if (error instanceof ControlConflictError) {
    return error.reason === "not_cancellable"
      ? failure(409, "CONFLICT", "La actualización ya no se puede cancelar.")
      : failure(409, "CONFLICT", "La actualización no está disponible ahora mismo.");
  }
  if (error instanceof ControlUnavailableError) {
    console.error(`[updates] ${context}:`, error.message);
    return failure(503, "UPSTREAM_UNAVAILABLE", "El servicio de actualización no responde.");
  }
  throw error;
}
