import type { SourceInfo } from "@/contract";
import { getDataSource } from "@/server/data-source";
import { json } from "@/server/http";

/** Whether the data are synthetic; the source itself stays hidden. */
export function GET() {
  return json<SourceInfo>(getDataSource().info());
}
