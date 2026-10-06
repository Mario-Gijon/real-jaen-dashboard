import type { Metadata } from "next";
import { MatchDetailView } from "@/features/matches/MatchDetailView";

export const metadata: Metadata = { title: "Detalle de partido" };

export default async function MatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <MatchDetailView matchId={matchId} />;
}
