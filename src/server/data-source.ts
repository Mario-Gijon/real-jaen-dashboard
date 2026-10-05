import type { SourceInfo } from "@/contract";
import { syntheticSource } from "./synthetic/synthetic-source";

/**
 * Where the analyst data come from. Route handlers only talk to this
 * interface; each source (synthetic files today, a sports API later) is an
 * adapter that returns contract types. Read methods for competitions, matches,
 * teams and players are added with their endpoints.
 */
export interface DataSource {
  info(): SourceInfo;
}

/** The configured source. `DATA_SOURCE` will select real adapters later. */
export function getDataSource(): DataSource {
  const kind = process.env.DATA_SOURCE ?? "synthetic";
  if (kind !== "synthetic") {
    throw new Error(`Fuente de datos no disponible: ${kind}`);
  }
  return syntheticSource;
}
