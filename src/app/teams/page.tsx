import type { Metadata } from "next";
import { PageHeader } from "@/ui/PageHeader";
import { PendingSection } from "@/ui/PendingSection";

export const metadata: Metadata = { title: "Equipos" };

export default function TeamsPage() {
  return (
    <>
      <PageHeader
        title="Equipos"
        description="Rendimiento de cada equipo durante la temporada y de sus jugadores."
      />
      <PendingSection label="Equipos de la temporada">
        Aquí aparecerán la competición, la temporada y los equipos, con su rendimiento y su
        plantilla.
      </PendingSection>
    </>
  );
}
