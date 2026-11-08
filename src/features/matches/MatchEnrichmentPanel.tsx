"use client";

import { useState } from "react";
import { getEnrichedComments } from "@/client/api";
import type { EnrichmentAttributeValue } from "@/contract";
import { Button } from "@/ui/Button";
import { LoadingState } from "@/ui/LoadingState";
import { failureReason, useApi } from "@/hooks/use-api";
import css from "./MatchEnrichmentPanel.module.css";

const PAGE_SIZE = 25;
const CATEGORIES = [
  ["goal", "Goles"], ["goal_review", "Goles anulados"], ["foul", "Faltas"], ["shot", "Remates"],
  ["set_piece", "Córneres"], ["substitution", "Sustituciones"], ["discipline", "Tarjetas"],
  ["offside", "Fueras de juego"], ["var", "VAR"], ["penalty", "Penaltis"], ["match_flow", "Desarrollo del partido"],
] as const;
const EVENT_TYPES = [
  "scoreChange", "penaltyScored", "varCancelledGoal", "freeKickLost", "freeKickWon", "shotOffTarget", "shotBlocked",
  "shotSaved", "post", "cornerKick", "substitution", "yellowCard", "redCard", "yellowRedCard", "offside",
  "videoAssistantReferee", "penaltyLost", "penaltyAwarded", "penaltySaved", "penaltyMissed", "startDelay",
  "matchStarted", "addedTime", "endDelay", "matchEnded", "endFirstHalf", "endSecondHalf",
] as const;
const ATTRIBUTE_LABELS: Readonly<Record<string, string>> = {
  goal_status: "Estado del gol", goal_kind: "Tipo de gol", goal_origin: "Origen", surface: "Superficie",
  area_zone: "Zona", sector: "Sector", prior_pass: "Pase previo", assistant_name: "Asistente citado",
  assistant_name_text: "Asistente citado", contexts: "Contexto", infraction_type: "Infracción",
  location_context: "Ubicación", flank: "Banda", benefiting_team_text: "Equipo beneficiado",
  conceding_player_text: "Jugador que concede",
};
const VALUE_LABELS: Readonly<Record<string, string>> = {
  valid: "Válido", disallowed: "Anulado", ordinary: "Ordinario", own_goal: "Autogol", set_piece: "Balón parado",
  open_play: "Jugada normal", penalty: "Penalti", right_foot: "Pie derecho", left_foot: "Pie izquierdo", head: "Cabeza",
  inside_area: "Dentro del área", outside_area: "Fuera del área", center: "Centro", left: "Izquierda", right: "Derecha",
  cross: "Centro", long_pass: "Pase largo", through_ball: "Pase en profundidad", after_corner: "Tras córner",
  after_free_kick: "Tras falta", var_confirmation: "Gol confirmado por VAR", var_cancellation: "Anulado por VAR",
  counterattack: "Contraataque", foul: "Falta", handball: "Mano", defensive_zone: "Zona defensiva",
  opponent_half: "Campo contrario", flank: "Banda",
};
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES) as Record<string, string>;

function attributeText(value: Exclude<EnrichmentAttributeValue, null>): string {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => VALUE_LABELS[item] ?? item).join(", ");
}

function sourceEventId(matchId: string): string | null {
  const match = /^sofascore-match-([1-9]\d*)$/.exec(matchId);
  return match?.[1] ?? null;
}

function periodLabel(value: string | null): string | null {
  if (value === "1ST") return "Primera parte";
  if (value === "2ND") return "Segunda parte";
  return value;
}

export function MatchEnrichmentPanel({ matchId }: { matchId: string }) {
  const eventId = sourceEventId(matchId);
  const [category, setCategory] = useState("");
  const [originalType, setOriginalType] = useState("");
  const [offset, setOffset] = useState(0);
  const key = eventId ? `enrichment|${eventId}|${category}|${originalType}|${offset}` : null;
  const result = useApi(key, (signal) => eventId
    ? getEnrichedComments({ sourceEventId: eventId, category: category || undefined, originalType: originalType || undefined,
      limit: PAGE_SIZE, offset }, { signal })
    : Promise.reject(new Error("El identificador del partido no es válido.")));

  if (!eventId) return <p className={css.empty} role="alert">Este partido no tiene un ID de evento compatible.</p>;
  if (result.error) return <div className={css.message} role="alert">
    <p>No se pudo cargar la clasificación. {failureReason(result.error)}</p>
    <Button size="sm" onClick={result.retry}>Reintentar</Button>
  </div>;
  if (!result.data) return <section aria-label="Comentarios clasificados" aria-busy="true">
    <LoadingState variant="section" label="Cargando clasificación…" />
  </section>;

  const { items: sourceItems, total, enrichmentVersion } = result.data;
  // SofaScore's source positions run from the end of the match backwards.
  // The API paginates in that stable order; reverse each page for readable chronology.
  const items = [...sourceItems].sort((left, right) => right.position - left.position);
  return <section className={css.panel} aria-label="Comentarios clasificados">
    <p className={css.intro}>Evento {eventId} · reglas {enrichmentVersion} · {total} comentarios</p>
    <div className={css.filters}>
      <label> Categoría
        <select value={category} onChange={(event) => { setCategory(event.target.value); setOriginalType(""); setOffset(0); }}>
          <option value="">Todas</option>
          {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label> Tipo original
        <select value={originalType} onChange={(event) => { setOriginalType(event.target.value); setOffset(0); }}>
          <option value="">Todos</option>
          {EVENT_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
    </div>
    {items.length === 0 ? <p className={css.empty} role="status">No hay comentarios para estos filtros en el evento.</p> :
      <ol className={css.items} aria-label="Comentarios enriquecidos">
        {items.map((item) => {
          const attributes = Object.entries(item.attributes).filter(([, value]) => value !== null && (!Array.isArray(value) || value.length > 0));
          return <li key={`${item.position}-${item.id}`} className={css.item}>
            <div className={css.when}>
              <strong>{item.minute === null ? "Sin minuto" : `${item.minute}′`}</strong>
              <span>{periodLabel(item.periodName) ?? ""}</span>
            </div>
            <div className={css.content}>
              <div className={css.tags}>
                <span className={css.category}>{item.category ? CATEGORY_LABEL[item.category] ?? item.category : "Sin clasificar"}</span>
                <span className={css.type}>{item.originalType}</span>
              </div>
              <p className={css.text}>{item.text}</p>
              {attributes.length ? <dl className={css.attributes}>
                {attributes.map(([name, value]) => <div key={name}>
                  <dt>{ATTRIBUTE_LABELS[name] ?? name}</dt>
                  <dd>{attributeText(value as Exclude<EnrichmentAttributeValue, null>)}</dd>
                </div>)}
              </dl> : <p className={css.noAttributes}>Sin atributos textuales extraídos.</p>}
            </div>
          </li>;
        })}
      </ol>}
    <div className={css.pagination}>
      <span>Mostrando {items.length} de {total}</span>
      <Button size="sm" variant="secondary" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Más antiguos</Button>
      <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Más recientes</Button>
    </div>
  </section>;
}
