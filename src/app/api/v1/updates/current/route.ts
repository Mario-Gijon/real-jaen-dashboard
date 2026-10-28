import type { NextResponse } from "next/server";
import type { ApiError, UpdateStatus } from "@/contract";
import { controlStatus } from "@/server/updates/control-client";
import { isOperator, updatesConfigured } from "@/server/updates/operator";
import { fromControl, noStore } from "@/server/updates/responses";

/**
 * Whether updates exist here, their real scope and the last publication. Only an operator session also sees the
 * active and last jobs.
 */
export async function GET(request: Request): Promise<NextResponse<UpdateStatus | ApiError>> {
  if (!updatesConfigured()) return noStore<UpdateStatus>({ available: false, operator: false, scope: null, lastPublished: null });
  try {
    const status = await controlStatus();
    const operator = isOperator(request);
    return noStore<UpdateStatus>(operator
      ? { available: true, operator, ...status }
      : { available: true, operator, scope: status.scope, lastPublished: status.lastPublished });
  } catch (error) {
    return fromControl(error, "estado");
  }
}
