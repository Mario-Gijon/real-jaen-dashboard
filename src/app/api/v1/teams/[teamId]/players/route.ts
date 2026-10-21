import { getDataSource } from "@/server/data-source";
import { jsonOrNotFound, upstreamUnavailable } from "@/server/http";
import { UpstreamUnavailableError } from "@/server/local-api/local-api-source";

type Context = { params: Promise<{ teamId: string }> };

/**
 * Players seen with a team, in no season. A real source that fails answers
 * 503: never synthetic players in its place.
 */
export async function GET(_request: Request, { params }: Context) {
  const { teamId } = await params;
  try {
    return jsonOrNotFound(
      await getDataSource().observedPlayers(teamId),
      "No hay jugadores observados de este equipo en la fuente de datos.",
    );
  } catch (error) {
    if (!(error instanceof UpstreamUnavailableError)) throw error;
    console.error(`[api] jugadores observados de ${teamId}:`, error.message);
    return upstreamUnavailable("La fuente de datos real no está disponible.");
  }
}
