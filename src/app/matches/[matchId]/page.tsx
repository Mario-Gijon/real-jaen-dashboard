import type { Metadata } from "next";
import { MatchDetailView } from "@/features/matches/MatchDetailView";
import { RealMatchDetailView } from "@/features/matches/RealMatchDetailView";

export const metadata: Metadata = { title: "Detalle de partido" };

export default async function MatchPage({ params, searchParams }: { params: Promise<{ matchId: string }>; searchParams: Promise<{ tab?: string; view?: string }> }) {
  const [{ matchId }, query] = await Promise.all([params, searchParams]);
  // Real matches are linked explicitly (`view=observed`); any other id is a synthetic match.
  if (query.view === "observed") return <RealMatchDetailView matchId={matchId} />;
  return <MatchDetailView matchId={matchId} initialSection={query.tab === "timeline" || query.tab === "lineups" ? query.tab : "summary"} />;
}
