import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { dataMode } from "../data-source";

/**
 * Operator authorization of the update routes (docs/contrato-actualizaciones.md): a key in a server file
 * (`RJ_OPERATOR_KEY_FILE`) exchanged for a signed, HttpOnly, SameSite=Strict session cookie, plus a same-origin
 * check on every state change. The internal control secret (`RJ_CONTROL_SECRET_FILE`) is read here only for the
 * server's own calls to the backend; neither ever reaches the browser.
 */

const COOKIE = "rj_operator";
const SESSION_SECONDS = 8 * 60 * 60;
const COOKIE_PATH = "/api/v1/updates";
/** Per process: restarting the server ends every session. */
const SIGNING_KEY = randomBytes(32);
const FAILURES_ALLOWED = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; until: number }>();

/** A secret file of 32-256 printable ASCII characters, or `null` (missing, unreadable or malformed). */
function secretFile(variable: string): Buffer | null {
  const path = process.env[variable];
  if (!path) return null;
  try {
    const value = readFileSync(path, "latin1").trim();
    if (value.length < 32 || value.length > 256 || !/^[\x21-\x7e]+$/.test(value)) return null;
    return Buffer.from(value, "ascii");
  } catch {
    return null;
  }
}

export function controlSecret(): Buffer | null {
  return secretFile("RJ_CONTROL_SECRET_FILE");
}

/** Updates exist only with real data, a backend and both secrets configured; otherwise the control is hidden. */
export function updatesConfigured(): boolean {
  try {
    if (dataMode() !== "real") return false;
  } catch {
    return false;
  }
  return Boolean(process.env.LOCAL_DATA_API_URL) && secretFile("RJ_OPERATOR_KEY_FILE") !== null && controlSecret() !== null;
}

const digest = (value: Buffer | string) => createHash("sha256").update(value).digest();

/** Constant-time comparison with the configured operator key. */
export function validKey(candidate: unknown): boolean {
  const key = secretFile("RJ_OPERATOR_KEY_FILE");
  if (!key || typeof candidate !== "string" || candidate.length > 256) return false;
  return timingSafeEqual(digest(key), digest(candidate));
}

const sign = (payload: string) => createHmac("sha256", SIGNING_KEY).update(payload).digest("base64url");

function secure(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export function sessionCookie(request: Request): string {
  const payload = `${Math.floor(Date.now() / 1000) + SESSION_SECONDS}.${randomBytes(12).toString("base64url")}`;
  return `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=${SESSION_SECONDS}${secure(request) ? "; Secure" : ""}`;
}

export function clearedCookie(request: Request): string {
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=0${secure(request) ? "; Secure" : ""}`;
}

export function isOperator(request: Request): boolean {
  const cookie = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  const value = cookie?.slice(COOKIE.length + 1) ?? "";
  const [expires, nonce, signature, ...rest] = value.split(".");
  if (!expires || !nonce || !signature || rest.length) return false;
  const expected = Buffer.from(sign(`${expires}.${nonce}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return Number(expires) > Date.now() / 1000;
}

/** CSRF: a state change must come from this same origin (in addition to the SameSite cookie). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function client(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

/** Too many failed keys from this address in the last 15 minutes. */
export function throttled(request: Request): boolean {
  const entry = failures.get(client(request));
  return entry !== undefined && entry.until > Date.now() && entry.count >= FAILURES_ALLOWED;
}

export function recordFailure(request: Request) {
  const key = client(request);
  const entry = failures.get(key);
  const now = Date.now();
  failures.set(key, entry && entry.until > now ? { count: entry.count + 1, until: entry.until } : { count: 1, until: now + FAILURE_WINDOW_MS });
}

/** Tests start from no recorded failures. */
export function clearFailures() {
  failures.clear();
}
