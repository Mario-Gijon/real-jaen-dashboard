import type { Metadata } from "next";
import { TeamsView } from "@/features/teams/TeamsView";

export const metadata: Metadata = { title: "Equipos" };

export default function TeamsPage() {
  return <TeamsView />;
}
