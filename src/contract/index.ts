/**
 * The analyst API contract (`/api/v1`). It is the only shape shared by the
 * screens and the server, and it describes what the analyst sees, never what a
 * provider returns. Resources are added here before they are implemented.
 */

/** Why a metric has no value. */
export type MissingReason =
  /** The source does not offer it, or it does not apply. */
  | "not_available"
  /** It should exist but has not been collected yet. */
  | "not_collected";

/**
 * One metric. A real zero is `{ value: 0 }`; a missing value always says why,
 * so the interface never turns an absence into a fictitious zero.
 */
export type Stat = { value: number } | { value: null; reason: MissingReason };

/** `GET /api/v1/source`: what the interface may know about the data source. */
export type SourceInfo = {
  /** Data are invented and must be labelled as such on every screen. */
  synthetic: boolean;
  /** Short description for the analyst, in Spanish. */
  label: string;
};

/** Error body of every `/api/v1` endpoint. */
export type ApiError = { error: { code: string; message: string } };
