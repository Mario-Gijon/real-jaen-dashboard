import type { Metadata } from "next";
import { MatchDetailView } from "@/features/matches/MatchDetailView";

export const metadata: Metadata = { title: "Detalle de partido" };

export default async function MatchPage({ params, searchParams }: { params: Promise<{ matchId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ matchId }, query] = await Promise.all([params, searchParams]);
  return <MatchDetailView matchId={matchId} initialSection={query.tab === "timeline" || query.tab === "lineups" ? query.tab : "summary"} />;
}
