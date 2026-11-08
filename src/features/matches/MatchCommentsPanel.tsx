"use client";

import { useState } from "react";
import { getMatchComments } from "@/client/api";
import type { NarrativeCommentParticipant } from "@/contract";
import { Button } from "@/ui/Button";
import { LoadingState } from "@/ui/LoadingState";
import { failureReason, useApi } from "@/hooks/use-api";
import { MatchEnrichmentPanel } from "./MatchEnrichmentPanel";
import css from "./MatchCommentsPanel.module.css";

const PARTICIPANT_LABELS = { player: "Jugador", playerIn: "Entra", playerOut: "Sale", assist1: "Asiste" } as const;

function periodLabel(value: string | null): string | null {
  if (value === "1ST") return "Primera parte";
  if (value === "2ND") return "Segunda parte";
  return value;
}

function participants(value: Record<string, NarrativeCommentParticipant | undefined>) {
  return Object.entries(PARTICIPANT_LABELS).flatMap(([role, label]) => {
    const participant = value[role as keyof typeof PARTICIPANT_LABELS];
    return participant?.name ? [{ label, name: participant.name }] : [];
  });
}

export function MatchCommentsPanel({ matchId, seasonId }: { matchId: string; seasonId: string }) {
  const [view, setView] = useState<"narrative" | "enrichment">("narrative");
  const result = useApi(`match-comments|${matchId}`, (signal) => getMatchComments(matchId, { signal }));
  const viewSwitch = <div className={css.viewSwitch} role="group" aria-label="Vista de comentarios">
    <button type="button" aria-pressed={view === "narrative"} onClick={() => setView("narrative")}>Narración original</button>
    <button type="button" aria-pressed={view === "enrichment"} onClick={() => setView("enrichment")}>Clasificación rules-v1</button>
  </div>;

  if (view === "enrichment") return <div className={css.panel}>
    {viewSwitch}
    <MatchEnrichmentPanel matchId={matchId} seasonId={seasonId} />
  </div>;
  if (result.error) return <div className={css.panel}>
    {viewSwitch}
    <div className={css.message} role="alert">
      <p>No se pudieron cargar los comentarios narrativos. {failureReason(result.error)}</p>
      <Button size="sm" onClick={result.retry}>Reintentar</Button>
    </div>
  </div>;
  if (!result.data) return <section className={css.panel} aria-label="Comentarios narrativos" aria-busy="true">
    {viewSwitch}
    <LoadingState variant="section" label="Cargando comentarios…" />
  </section>;

  const { comments, availability, lastAttempt } = result.data;
  if (availability === "not_collected" || availability === "error" || availability === "empty") {
    const message = availability === "not_collected"
      ? lastAttempt.availability === "error"
        ? "Todavía no hay una captura de comentarios; el último intento no pudo completarse."
        : "Los comentarios narrativos todavía no se han recopilado para este partido."
      : availability === "error"
        ? "No se pudieron obtener comentarios narrativos en el último intento."
        : "La respuesta guardada es válida y no contiene comentarios narrativos.";
    return <div className={css.panel}>
      {viewSwitch}
      <p className={css.empty} role="status">{message}</p>
    </div>;
  }

  const chronological = [...comments].sort((left, right) => right.position - left.position);
  const previousCaptureRetained = availability === "available" && lastAttempt.availability !== "available";
  return <div className={css.panel}>
    {previousCaptureRetained ? <p className={css.retained} role="status">
      {lastAttempt.availability === "empty"
        ? "La última respuesta válida llegó vacía; se conserva la captura anterior con comentarios."
        : "Falló el último intento de consulta; se conserva y muestra la captura anterior."}
    </p> : null}
    {viewSwitch}
    <ol className={css.timeline} aria-label="Comentarios narrativos en orden cronológico">
      {chronological.map((comment) => {
        const period = periodLabel(comment.periodName);
        const actors = participants(comment.participants);
        return <li key={comment.id} className={css.item}>
          <div className={css.when}>
            <strong>{comment.minute === null ? "Sin minuto" : `${comment.minute}′`}</strong>
            {period ? <span>{period}</span> : null}
          </div>
          <div className={css.content}>
            <span className={css.kind}>{comment.type}</span>
            <p className={css.text}>{comment.text}</p>
            {comment.score && (comment.score.home !== null || comment.score.away !== null) ? <p className={css.score}
              aria-label={`Marcador: ${comment.score.home ?? "no disponible"} a ${comment.score.away ?? "no disponible"}`}>
              Marcador <strong>{comment.score.home ?? "—"}–{comment.score.away ?? "—"}</strong>
            </p> : null}
            {actors.length ? <ul className={css.actors} aria-label="Participantes mencionados">
              {actors.map(({ label, name }) => <li key={`${label}-${name}`}><span>{label}</span> {name}</li>)}
            </ul> : null}
          </div>
        </li>;
      })}
    </ol>
  </div>;
}
