import type { Metadata } from "next";
import { PlayerDetailView } from "@/features/players/PlayerDetailView";

export const metadata: Metadata = { title: "Ficha de jugador" };

export default async function PlayerPage({ params, searchParams }: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ season?: string | string[] }>;
}) {
  const [{ playerId }, query] = await Promise.all([params, searchParams]);
  return <PlayerDetailView playerId={playerId} seasonId={typeof query.season === "string" && query.season ? query.season : null} />;
}
