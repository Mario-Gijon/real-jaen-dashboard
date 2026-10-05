import type { Metadata } from "next";
import { PageHeader } from "@/ui/PageHeader";
import { PendingSection } from "@/ui/PendingSection";

export const metadata: Metadata = { title: "Partidos" };

export default function MatchesPage() {
  return (
    <>
      <PageHeader
        title="Partidos"
        description="Resultados, alineaciones, sustituciones y estadísticas de cada partido de la temporada."
      />
      <PendingSection label="Partidos de la temporada">
        Aquí aparecerán los partidos por jornada, con acceso a la ficha de cada uno.
      </PendingSection>
    </>
  );
}
