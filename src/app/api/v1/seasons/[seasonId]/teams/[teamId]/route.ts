import { getDataSource } from "@/server/data-source";
import { jsonOrNotFound } from "@/server/http";

type Context = { params: Promise<{ seasonId: string; teamId: string }> };

/** A team's season: record, calendar, accumulated stats and squad. */
export async function GET(_request: Request, { params }: Context) {
  const { seasonId, teamId } = await params;
  return jsonOrNotFound(
    await getDataSource().teamSeason(seasonId, teamId),
    "Equipo o temporada no encontrados.",
  );
}
