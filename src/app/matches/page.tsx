import type { Metadata } from "next";
import { MatchesView } from "@/features/matches/MatchesView";

export const metadata: Metadata = { title: "Partidos" };

export default async function MatchesPage({ searchParams }: {
  searchParams: Promise<{ season?: string | string[]; team?: string | string[] }>;
}) {
  const query = await searchParams;
  return <MatchesView initialSeasonId={typeof query.season === "string" ? query.season : undefined}
    initialTeamId={typeof query.team === "string" ? query.team : undefined} />;
}
