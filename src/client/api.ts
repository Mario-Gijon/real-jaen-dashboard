import type { ApiError, SourceInfo } from "@/contract";

/** A failed `/api/v1` request, with the contract's error code when present. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The only way screens read data: a typed GET against `/api/v1`. */
async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      response.status,
      body?.error.code ?? "HTTP_ERROR",
      body?.error.message ?? `Error ${response.status} en /api/v1${path}`,
    );
  }
  return (await response.json()) as T;
}

export const api = {
  source: (init?: RequestInit) => get<SourceInfo>("/source", init),
};
