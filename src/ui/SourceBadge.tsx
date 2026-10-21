"use client";

import { FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { getSource } from "@/client/api";
import type { SourceInfo } from "@/contract";
import css from "./AppShell.module.css";

/**
 * Discreet, permanent notice while the API serves invented data, so no result
 * can pass for real sporting information. It asks the API, never the source.
 * A section with real data labels itself, so the notice never claims otherwise.
 */
export function SourceBadge() {
  const [source, setSource] = useState<SourceInfo | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getSource({ signal: controller.signal })
      .then(setSource)
      .catch(() => {
        // Without an answer nothing is claimed about the data.
      });
    return () => controller.abort();
  }, []);
  if (!source?.synthetic) return null;
  return (
    <p
      className={css.badge}
      title="Competición, rivales, jugadores, resultados y estadísticas son inventados, salvo donde se indique «Datos reales»."
    >
      <FlaskConical aria-hidden="true" size={15} />
      {source.label}
    </p>
  );
}
