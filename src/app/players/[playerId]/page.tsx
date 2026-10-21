import type { Metadata } from "next";
import { PlayerDetailView } from "@/features/players/PlayerDetailView";
import { PlayerProfileView } from "@/features/players/PlayerProfileView";
import { playerInitialView, playerReturnHref } from "@/features/players/navigation";

export const metadata: Metadata = { title: "Ficha de jugador" };

export default async function PlayerPage({ params, searchParams }: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ view?: string; season?: string | string[]; from?: string; origin?: string; originTab?: string; tab?: string | string[]; match?: string | string[] }>;
}) {
  const [{ playerId }, query] = await Promise.all([params, searchParams]);
  const seasonId = typeof query.season === "string" && query.season ? query.season : null;
  // A real player's profile (linked from the observed players) belongs to no season.
  if (query.view === "profile") {
    return <PlayerProfileView playerId={playerId} returnHref={playerReturnHref(seasonId, query)} />;
  }
  const initial = playerInitialView(query);
  return <PlayerDetailView playerId={playerId} seasonId={seasonId} returnHref={playerReturnHref(seasonId, query)}
    initialTab={initial.tab} initialMatchId={initial.matchId} />;
}
