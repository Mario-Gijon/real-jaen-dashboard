import type { Metadata } from "next";
import { MatchDetailView } from "@/features/matches/MatchDetailView";
import { RealMatchDetailView } from "@/features/matches/RealMatchDetailView";
import { homeReturnHref, observedMatchReturnHref, observedMatchTeamsReturnHref } from "@/features/players/navigation";

export const metadata: Metadata = { title: "Detalle de partido" };

export default async function MatchPage({ params, searchParams }: { params: Promise<{ matchId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ matchId }, query] = await Promise.all([params, searchParams]);
  // Real matches are linked explicitly (`view=observed`); any other id is a synthetic match.
  if (query.view === "observed") {
    return <RealMatchDetailView matchId={matchId} initialSection={query.tab === "lineups" ? "lineups" : "summary"}
      playerReturnHref={observedMatchReturnHref(matchId, query)} teamsReturnHref={observedMatchTeamsReturnHref(query)}
      homeReturnHref={homeReturnHref(query)} originQuery={query} />;
  }
  return <MatchDetailView matchId={matchId} initialSection={query.tab === "timeline" || query.tab === "lineups" ? query.tab : "summary"}
    homeReturnHref={homeReturnHref(query)} />;
}
