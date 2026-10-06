import type { Metadata } from "next";
import { TeamsView } from "@/features/teams/TeamsView";

export const metadata: Metadata = { title: "Equipos" };

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ team?: string; season?: string; tab?: string }> }) {
  const query = await searchParams;
  return <TeamsView initialTeamId={query.team} initialSeasonId={query.season} initialTab={query.tab === "players" ? "players" : "performance"} />;
}
