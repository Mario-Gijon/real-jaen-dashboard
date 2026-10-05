import { NextResponse } from "next/server";
import type { SourceInfo } from "@/contract";
import { getDataSource } from "@/server/data-source";

/** Whether the data are synthetic; the source itself stays hidden. */
export function GET() {
  return NextResponse.json<SourceInfo>(getDataSource().info());
}
