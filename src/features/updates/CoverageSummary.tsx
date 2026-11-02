"use client";

import Link from "next/link";
import type { UpdateCoverage } from "@/contract";
import { REASON_LABELS, RESOURCE_LABELS } from "./labels";
import css from "./Updates.module.css";

/**
 * What a group update published: new data, previous data kept and pending resources, never mixed. A pending
 * resource is not "no data": it keeps the previous version if there was one, and is never shown as zero.
 */
export function CoverageSummary({ coverage }: { coverage: UpdateCoverage }) {
  // A match by its teams (named by the backend from the data just published), linked to its page.
  const MatchName = ({ matchId }: { matchId: string }) => (
    coverage.matchNames[matchId]
      ? <Link href={`/matches/${matchId}`}>{coverage.matchNames[matchId]}</Link>
      : <span>Evento externo {matchId}</span>
  );
  return (
    <div className={css.coverage}>
      <ul className={css.counts}>
        <li><strong>{coverage.newResources}</strong> datos nuevos</li>
        <li><strong>{coverage.keptResources}</strong> datos anteriores conservados</li>
        {coverage.pending.length ? (
          <li><strong>{coverage.pending.length}</strong> {coverage.pending.length === 1 ? "partido" : "partidos"} con pendientes</li>
        ) : (
          <li>sin pendientes</li>
        )}
      </ul>
      {coverage.pending.length ? (
        <>
          <h3>Pendientes</h3>
          <ul className={css.pending}>
            {coverage.pending.map((match) => (
              <li key={match.matchId}>
                <MatchName matchId={match.matchId} />
                {": "}
                {match.resources.map((r, i) => (
                  <span key={r.resource}>
                    {i ? "; " : ""}
                    {RESOURCE_LABELS[r.resource]} ({REASON_LABELS[r.reason]}
                    {r.kept ? ", se mantiene la versión anterior" : ", sin datos publicados"})
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {coverage.deferredMatchIds.length ? (
        <>
          <h3>Revisiones aplazadas</h3>
          <p className={css.muted}>
            {coverage.deferredMatchIds.length} {coverage.deferredMatchIds.length === 1 ? "revisión queda" : "revisiones quedan"} para
            la próxima actualización por el límite de consultas. Se siguen sirviendo sus datos anteriores.
          </p>
          <ul className={css.pending}>
            {coverage.deferredMatchIds.map((matchId) => (
              <li key={matchId}><MatchName matchId={matchId} /></li>
            ))}
          </ul>
        </>
      ) : null}
      {coverage.restrictedMatchIds.length ? (
        <>
          <h3>Fuera del alcance de esta actualización</h3>
          <p className={css.muted}>
            Esta actualización solo consulta los partidos de {coverage.detailRounds?.length === 1 ? "la jornada" : "las jornadas"}{" "}
            {(coverage.detailRounds ?? []).join(", ")}. En {coverage.restrictedMatchIds.length}{" "}
            {coverage.restrictedMatchIds.length === 1 ? "partido" : "partidos"} se detectó un cambio o una revisión pendiente:
            no se han consultado y se siguen sirviendo sus datos anteriores.
          </p>
          <ul className={css.pending}>
            {coverage.restrictedMatchIds.map((matchId) => (
              <li key={matchId}><MatchName matchId={matchId} /></li>
            ))}
          </ul>
        </>
      ) : null}
      {coverage.newMatches.length ? (
        <>
          <h3>Eventos detectados para revisión</h3>
          <p className={css.muted}>No se han incorporado ni consultado sus detalles. Confirma su identidad antes de añadir una sustitución.</p>
          <ul className={css.pending}>
            {coverage.newMatches.map((match) => (
              <li key={match.matchId}>
                <MatchName matchId={match.matchId} />
                {match.replaces.length ? (
                  <> — posible sustitución de <MatchName matchId={match.replaces[0]} />: decide el operador con la herramienta de sustituciones</>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
