"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { getAllEnrichedComments } from "@/client/api";
import type { EnrichedComment, EnrichmentAttributeValue, PlayerRef } from "@/contract";
import { PlayerLink } from "@/features/players/PlayerLink";
import type { ProfileOrigin } from "@/lib/navigation";
import { Button } from "@/ui/Button";
import { LoadingState } from "@/ui/LoadingState";
import { failureReason, useApi } from "@/hooks/use-api";
import css from "./MatchCommentsPanel.module.css";

const CATEGORIES = [
  ["goal", "Goles"], ["goal_review", "Goles anulados"], ["shot", "Remates"], ["foul", "Faltas"],
  ["set_piece", "Córneres"], ["substitution", "Sustituciones"], ["discipline", "Tarjetas"],
  ["offside", "Fueras de juego"], ["penalty", "Penaltis"], ["var", "VAR"], ["match_flow", "Desarrollo del partido"],
] as const;
const CATEGORY_LABELS: Readonly<Record<string, string>> = Object.fromEntries(CATEGORIES);
const MATCH_FLOW_LABELS: Readonly<Record<string, string>> = {
  matchStarted: "Inicio del partido",
  startDelay: "Inicio retrasado",
  endDelay: "Fin del retraso",
  addedTime: "Tiempo añadido",
  endFirstHalf: "Final de la primera parte",
  endSecondHalf: "Final de la segunda parte",
  matchEnded: "Final del partido",
};
const ATTRIBUTE_LABELS: Readonly<Record<string, string>> = {
  goal_status: "Estado",
  goal_kind: "Tipo de gol",
  goal_origin: "Origen",
  surface: "Superficie",
  area_zone: "Zona",
  sector: "Sector",
  prior_pass: "Pase previo",
  assistant_name: "Asistencia mencionada",
  assistant_name_text: "Asistencia mencionada",
  contexts: "Contexto",
  infraction_type: "Infracción",
  location_context: "Ubicación",
  flank: "Banda",
  benefiting_team_text: "Equipo beneficiado",
  conceding_player_text: "Jugador que concede",
};
const VALUE_LABELS: Readonly<Record<string, string>> = {
  valid: "Válido", disallowed: "Anulado", ordinary: "Gol en jugada", own_goal: "Autogol",
  set_piece: "Balón parado", open_play: "Jugada normal", penalty: "Penalti",
  right_foot: "Pie derecho", left_foot: "Pie izquierdo", head: "Cabeza",
  inside_area: "Dentro del área", outside_area: "Fuera del área",
  center: "Centro", left: "Izquierda", right: "Derecha",
  cross: "Centro al área", long_pass: "Pase largo", through_ball: "Pase en profundidad",
  after_corner: "Tras córner", after_free_kick: "Tras falta", direct_free_kick: "Falta directa",
  var_confirmation: "Confirmado por VAR", var_cancellation: "Anulado por VAR", counterattack: "Contraataque",
  foul: "Falta", handball: "Mano", defensive_zone: "Zona defensiva", opponent_half: "Campo contrario",
};
const FREE_TEXT_ATTRIBUTES = new Set([
  "assistant_name", "assistant_name_text", "benefiting_team_text", "conceding_player_text",
]);
const matchIdPattern = /^sofascore-match-([1-9]\d*)$/;
const publicPlayerIdPattern = /^sofascore-player-[1-9]\d*$/;

type FilterTeam = "all" | "home" | "away";
type PlayerChoice = { id: string; name: string; label: string };
type Mention = { start: number; end: number; id: string; name: string };
type ResolvedParticipant = { name: string | null; player: PlayerRef | null; optionName: string | null };
type EventRow = { item: EnrichedComment; participants: ResolvedParticipant[] };

function sourceEventId(matchId: string): string | null {
  return matchIdPattern.exec(matchId)?.[1] ?? null;
}

function nameTokens(value: string): string[] {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es-ES").match(/[\p{L}\p{N}]+/gu) ?? [];
}

function sameRosterPlayer(name: string, rosterName: string): boolean {
  const source = nameTokens(name);
  const roster = nameTokens(rosterName);
  if (source.length < 2 || source[0] !== roster[0] || source.at(-1) !== roster.at(-1) || source.length > roster.length) return false;
  let cursor = 0;
  return source.every((token) => {
    const index = roster.indexOf(token, cursor);
    if (index < 0) return false;
    cursor = index + 1;
    return true;
  });
}

function resolveParticipant(participant: EnrichedComment["participants"][number], roster: PlayerRef[]): ResolvedParticipant {
  const name = participant.name?.trim() || null;
  const direct = participant.player && publicPlayerIdPattern.test(participant.player.id) ? participant.player : null;
  if (direct) return { name, player: direct, optionName: name ? direct.name : null };
  if (!name || participant.sourceRole !== "player") return { name, player: null, optionName: null };

  const candidates = new Map<string, PlayerRef>();
  for (const player of roster) {
    if (publicPlayerIdPattern.test(player.id) && sameRosterPlayer(name, player.name)) candidates.set(player.id, player);
  }
  const player = candidates.size === 1 ? [...candidates.values()][0] : null;
  return { name, player, optionName: player ? player.name : null };
}

function resolvedRows(items: EnrichedComment[], roster: PlayerRef[]): EventRow[] {
  return items.map((item) => ({ item, participants: item.participants.map((participant) => resolveParticipant(participant, roster)) }));
}

function eventLabel(item: EnrichedComment): string {
  if (item.category === "match_flow") return MATCH_FLOW_LABELS[item.originalType] ?? "Desarrollo del partido";
  if (!item.category) return "Sin clasificar";
  return CATEGORY_LABELS[item.category] ?? "Evento";
}

function playerChoices(rows: EventRow[]): PlayerChoice[] {
  const namesById = new Map<string, Map<string, { name: string; count: number }>>();
  for (const row of rows) for (const participant of row.participants) {
    const player = participant.player;
    const name = participant.optionName?.trim();
    if (!player || !publicPlayerIdPattern.test(player.id) || !name) continue;
    const names = namesById.get(player.id) ?? new Map<string, { name: string; count: number }>();
    const key = name.toLocaleLowerCase("es-ES");
    const current = names.get(key);
    names.set(key, { name: current?.name ?? name, count: (current?.count ?? 0) + 1 });
    namesById.set(player.id, names);
  }
  const options = [...namesById.entries()].flatMap(([id, names]) => {
    const mostCommon = [...names.values()].sort((left, right) => right.count - left.count)[0];
    return mostCommon ? [{ id, name: mostCommon.name, label: mostCommon.name }] : [];
  }).sort((left, right) => left.name.localeCompare(right.name, "es-ES") || left.id.localeCompare(right.id));

  const countByName = new Map<string, number>();
  for (const option of options) {
    const key = option.name.toLocaleLowerCase("es-ES");
    countByName.set(key, (countByName.get(key) ?? 0) + 1);
  }
  return options.map((option) => ({
    ...option,
    // The public ID is shown only to disambiguate two different players with the same name.
    label: (countByName.get(option.name.toLocaleLowerCase("es-ES")) ?? 0) > 1
      ? `${option.name} (ID ${option.id.slice("sofascore-player-".length)})` : option.name,
  }));
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{M}\p{N}_]/u.test(value);
}

function mentionAliases(name: string): string[] {
  const words = name.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const aliases = new Set([name.trim()]);
  if (words.length > 2) aliases.add(`${words[0]} ${words.at(-1)}`);
  return [...aliases].filter(Boolean);
}

function rosterMatches(name: string, playerId: string, roster: PlayerRef[]): boolean {
  const matches = new Map<string, PlayerRef>();
  for (const player of roster) {
    if (publicPlayerIdPattern.test(player.id) && sameRosterPlayer(name, player.name)) matches.set(player.id, player);
  }
  return matches.size === 1 && matches.has(playerId);
}

function playerMentions(text: string, participants: ResolvedParticipant[], roster: PlayerRef[]): Mention[] {
  const idsByName = new Map<string, Map<string, { id: string; name: string }>>();
  const nameConflicts = new Set<string>();
  const allNames = new Map<string, string>();
  const keyFor = (name: string) => nameTokens(name).join(" ");
  for (const participant of participants) {
    const names = new Set([participant.name, participant.player?.name]
      .filter((name): name is string => Boolean(name?.trim()))
      .flatMap(mentionAliases));
    if (!names.size) continue;
    const player = participant.player;
    if (!player || !publicPlayerIdPattern.test(player.id)) {
      for (const name of names) {
        const key = keyFor(name);
        nameConflicts.add(key);
        allNames.set(key, name);
      }
      continue;
    }
    for (const name of names) {
      const key = keyFor(name);
      // Abbreviated prose aliases are linked only when this match's roster confirms one ID.
      if (nameTokens(name).length < nameTokens(player.name).length && !rosterMatches(name, player.id, roster)) continue;
      allNames.set(key, name);
      const byId = idsByName.get(key) ?? new Map<string, { id: string; name: string }>();
      byId.set(player.id, { id: player.id, name });
      idsByName.set(key, byId);
    }
  }

  const spansByName = [...allNames.values()].map((name) => {
    const expression = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
    return [...text.matchAll(expression)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      length: match[0].length,
    }));
  }).flat();

  const matches: Mention[] = [];
  for (const [key, people] of idsByName) {
    if (people.size !== 1) continue;
    if (nameConflicts.has(key)) continue;
    const player = [...people.values()][0];
    const expression = new RegExp(player.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
    for (const match of text.matchAll(expression)) {
      const start = match.index;
      const end = start + match[0].length;
      const insideLongerParticipant = spansByName.some((span) => span.length > match[0].length && span.start <= start && span.end >= end);
      if (!insideLongerParticipant && !isWordCharacter(Array.from(text.slice(0, start)).at(-1)) && !isWordCharacter(Array.from(text.slice(end))[0])) {
        matches.push({ start, end, id: player.id, name: match[0] });
      }
    }
  }

  matches.sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start));
  const selected: Mention[] = [];
  let cursor = 0;
  for (let index = 0; index < matches.length;) {
    const first = matches[index];
    if (first.start < cursor) { index += 1; continue; }
    const sameStart = matches.slice(index).filter((candidate) => candidate.start === first.start);
    const longest = sameStart.filter((candidate) => candidate.end === Math.max(...sameStart.map((entry) => entry.end)));
    const ids = new Set(longest.map((candidate) => candidate.id));
    const chosen = ids.size === 1 ? longest[0] : null;
    if (chosen) {
      selected.push(chosen);
      cursor = chosen.end;
    }
    index += sameStart.length;
  }
  return selected;
}

function TextWithPlayers({ item, participants, rosterPlayers, seasonId, profileOrigin }: {
  item: EnrichedComment; participants: ResolvedParticipant[]; rosterPlayers: PlayerRef[]; seasonId?: string; profileOrigin?: ProfileOrigin;
}) {
  const mentions = playerMentions(item.text, participants, rosterPlayers);
  if (!mentions.length) return <>{item.text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [index, mention] of mentions.entries()) {
    if (mention.start > cursor) parts.push(item.text.slice(cursor, mention.start));
    parts.push(<PlayerLink key={`${mention.id}-${mention.start}-${index}`} player={{ id: mention.id, name: mention.name, position: null }}
      seasonId={seasonId} profileOrigin={profileOrigin} className={css.playerMention} />);
    cursor = mention.end;
  }
  if (cursor < item.text.length) parts.push(item.text.slice(cursor));
  return <>{parts.map((part, index) => typeof part === "string" ? <Fragment key={`text-${index}`}>{part}</Fragment> : part)}</>;
}

function attributeText(key: string, value: Exclude<EnrichmentAttributeValue, null>): string | null {
  const values = Array.isArray(value) ? value : [value];
  if (FREE_TEXT_ATTRIBUTES.has(key)) {
    const text = values.filter((item) => item.trim()).join(", ");
    return text || null;
  }
  const translated = values.flatMap((item) => VALUE_LABELS[item] ? [VALUE_LABELS[item]] : []);
  return translated.length ? translated.join(", ") : null;
}

function attributesFor(item: EnrichedComment) {
  return Object.entries(item.attributes).flatMap(([key, value]) => {
    const label = ATTRIBUTE_LABELS[key];
    if (!label || value === null) return [];
    const text = attributeText(key, value);
    return text ? [{ key, label, text }] : [];
  });
}

export function MatchCommentsPanel({ matchId, seasonId, homeName, awayName, profileOrigin, rosterPlayers = [] }: {
  matchId: string; seasonId?: string; homeName?: string | null; awayName?: string | null; profileOrigin?: ProfileOrigin; rosterPlayers?: PlayerRef[];
}) {
  const eventId = sourceEventId(matchId);
  const result = useApi(eventId ? `match-events|${eventId}` : null,
    (signal) => getAllEnrichedComments(eventId!, { signal }));
  const [category, setCategory] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [team, setTeam] = useState<FilterTeam>("all");
  const items = result.data?.items ?? [];
  const rows = useMemo(() => resolvedRows(items, rosterPlayers), [items, rosterPlayers]);
  const players = useMemo(() => playerChoices(rows), [rows]);
  const filtered = useMemo(() => rows.filter(({ item, participants }) => {
    const categoryMatches = category === "__unclassified" ? item.category === null : !category || item.category === category;
    const playerMatches = !playerId || participants.some((participant) => participant.player?.id === playerId);
    const teamMatches = team === "all" || (team === "home" ? item.isHome === true : item.isHome === false);
    return categoryMatches && playerMatches && teamMatches;
  }), [rows, category, playerId, team]);

  if (!eventId) return <p className={css.empty} role="status">La cronología de eventos no está disponible para este partido.</p>;
  if (result.error) return <div className={css.message} role="alert">
    <p>No se pudieron cargar los eventos. {failureReason(result.error)}</p>
    <Button size="sm" onClick={result.retry}>Reintentar</Button>
  </div>;
  if (!result.data) return <section className={css.panel} aria-label="Eventos del partido" aria-busy="true">
    <LoadingState variant="section" label="Cargando eventos…" />
  </section>;

  // Source position preserves the provider's period and same-minute ordering without rendering period labels.
  const chronological = [...filtered].sort((left, right) => right.item.position - left.item.position);
  return <section className={css.panel} aria-label="Eventos del partido">
    <div className={css.filters} aria-label="Filtros de eventos">
      <label>Tipo de evento
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">Todos</option>
          {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          <option value="__unclassified">Sin clasificar</option>
        </select>
      </label>
      <label>Jugador
        <select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>
          <option value="">Todos los jugadores</option>
          {players.map((player) => <option key={player.id} value={player.id}>{player.label}</option>)}
        </select>
      </label>
      <label>Equipo
        <select value={team} onChange={(event) => setTeam(event.target.value as FilterTeam)}>
          <option value="all">Ambos equipos</option>
          <option value="home">{homeName || "Equipo local"}</option>
          <option value="away">{awayName || "Equipo visitante"}</option>
        </select>
      </label>
    </div>
    {chronological.length === 0 ? <p className={css.empty} role="status">
      {items.length ? "No hay eventos que coincidan con estos filtros." : "No hay eventos disponibles para este partido."}
    </p> : <ol className={css.timeline} aria-label="Eventos en orden cronológico">
      {chronological.map(({ item, participants }) => {
        const attributes = attributesFor(item);
        return <li key={`${item.captureId ?? "capture"}-${typeof item.id}-${item.id}`} className={css.item}>
          <div className={css.when}>
            <strong>{item.minute === null ? "Sin minuto" : `${item.minute}′`}</strong>
          </div>
          <div className={css.content}>
            <span className={css.kind}>{eventLabel(item)}</span>
            <p className={css.text}><TextWithPlayers item={item} participants={participants} rosterPlayers={rosterPlayers}
              seasonId={seasonId} profileOrigin={profileOrigin} /></p>
            {item.score && (item.score.home !== null || item.score.away !== null) ? <p className={css.score}
              aria-label={`Marcador: ${item.score.home ?? "no disponible"} a ${item.score.away ?? "no disponible"}`}>
              Marcador <strong>{item.score.home ?? "—"}–{item.score.away ?? "—"}</strong>
            </p> : null}
            {attributes.length ? <ul className={css.attributes} aria-label="Atributos detectados">
              {attributes.map((attribute) => <li key={attribute.key}><strong>{attribute.label}</strong> {attribute.text}</li>)}
            </ul> : null}
          </div>
        </li>;
      })}
    </ol>}
  </section>;
}
