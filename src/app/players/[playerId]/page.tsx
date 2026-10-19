import type { Metadata } from "next";
import { PlayerDetailView } from "@/features/players/PlayerDetailView";
import { playerInitialView, playerReturnHref } from "@/features/players/navigation";

export const metadata: Metadata = { title: "Ficha de jugador" };

export default async function PlayerPage({ params, searchParams }: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ season?: string | string[]; from?: string; origin?: string; originTab?: string; tab?: string | string[]; match?: string | string[] }>;
}) {
  const [{ playerId }, query] = await Promise.all([params, searchParams]);
  const seasonId = typeof query.season === "string" && query.season ? query.season : null;
  const initial = playerInitialView(query);
  return <PlayerDetailView playerId={playerId} seasonId={seasonId} returnHref={playerReturnHref(seasonId, query)}
    initialTab={initial.tab} initialMatchId={initial.matchId} />;
}
