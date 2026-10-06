import type { Metadata } from "next";
import { MatchesView } from "@/features/matches/MatchesView";

export const metadata: Metadata = { title: "Partidos" };

export default function MatchesPage() {
  return <MatchesView />;
}
