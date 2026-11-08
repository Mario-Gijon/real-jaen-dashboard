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
type Mention = { start: number; end: number; id: string; name: string; player: PlayerRef };
type ResolvedParticipant = { name: string | null; player: PlayerRef | null; optionName: string | null };
type EventRow = { item: EnrichedComment; participants: ResolvedParticipant[]; mentions: Mention[] };

function sourceEventId(matchId: string): string | null {
  return matchIdPattern.exec(matchId)?.[1] ?? null;
}

function nameTokens(value: string): string[] {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es-ES").match(/[\p{L}\p{N}]+/gu) ?? [];
}

function nameKey(value: string): string {
  return nameTokens(value).join(" ");
}

function sameRosterPlayer(name: string, rosterName: string): boolean {
  const source = nameTokens(name);
  const roster = nameTokens(rosterName);
  if (source.length < 2 || source[0] !== roster[0] || source.at(-1) !== roster.at(-1) || source.length > roster.length) return false;
  return isTokenSubsequence(source, roster);
}

function isTokenSubsequence(source: string[], target: string[]): boolean {
  let cursor = 0;
  return source.every((token) => {
    const index = target.indexOf(token, cursor);
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
  for (const row of rows) for (const mention of row.mentions) {
    const names = namesById.get(mention.player.id) ?? new Map<string, { name: string; count: number }>();
    const key = mention.player.name.toLocaleLowerCase("es-ES");
    const current = names.get(key);
    names.set(key, { name: current?.name ?? mention.player.name, count: (current?.count ?? 0) + 1 });
    namesById.set(mention.player.id, names);
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
  const words = nameTokens(name);
  if (words.length < 2) return [];
  const aliases = new Set([words.join(" "), `${words[0]} ${words.at(-1)}`]);
  for (let index = 1; index < words.length; index += 1) aliases.add(`${words[0]} ${words[index]}`);
  if (words.length > 2) aliases.add(words.slice(-2).join(" "));
  return [...aliases];
}

function rosterMatches(name: string, playerId: string, roster: PlayerRef[]): boolean {
  const matches = new Map<string, PlayerRef>();
  for (const player of roster) {
    if (publicPlayerIdPattern.test(player.id) && isTokenSubsequence(nameTokens(name), nameTokens(player.name))) matches.set(player.id, player);
  }
  return matches.size === 1 && matches.has(playerId);
}

type SearchableText = { value: string; starts: number[]; ends: number[] };

function searchableText(text: string): SearchableText {
  let value = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (let offset = 0; offset < text.length;) {
    const char = String.fromCodePoint(text.codePointAt(offset)!);
    const end = offset + char.length;
    const folded = char.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es-ES");
    const letters = [...folded].filter((part) => /[\p{L}\p{N}]/u.test(part));
    if (letters.length) {
      for (const part of letters) {
        value += part;
        for (let unit = 0; unit < part.length; unit += 1) { starts.push(offset); ends.push(end); }
      }
    } else if (value && !value.endsWith(" ")) {
      value += " ";
      starts.push(offset);
      ends.push(end);
    }
    offset = end;
  }
  if (value.endsWith(" ")) { value = value.slice(0, -1); starts.pop(); ends.pop(); }
  return { value, starts, ends };
}

function addCandidate(index: Map<string, Map<string, PlayerRef>>, alias: string, player: PlayerRef) {
  const key = nameKey(alias);
  if (!key || !publicPlayerIdPattern.test(player.id)) return;
  const matches = index.get(key) ?? new Map<string, PlayerRef>();
  matches.set(player.id, player);
  index.set(key, matches);
}

function playerMentions(text: string, participants: ResolvedParticipant[], roster: PlayerRef[]): Mention[] {
  const structured = new Map<string, Map<string, PlayerRef>>();
  const rosterNames = new Map<string, Map<string, PlayerRef>>();
  const blockedNames = new Set<string>();

  for (const player of roster) for (const alias of mentionAliases(player.name)) addCandidate(rosterNames, alias, player);
  for (const participant of participants) {
    const player = participant.player;
    if (!player || !publicPlayerIdPattern.test(player.id)) {
      if (participant.name) blockedNames.add(nameKey(participant.name));
      continue;
    }
    if (participant.name) addCandidate(structured, participant.name, player);
    addCandidate(structured, player.name, player);
    for (const alias of mentionAliases(player.name)) {
      if (nameKey(alias) === nameKey(player.name) || rosterMatches(alias, player.id, roster)) addCandidate(structured, alias, player);
    }
  }

  const normalized = searchableText(text);
  const matches: Mention[] = [];
  const aliases = new Set([...structured.keys(), ...rosterNames.keys()]);
  for (const alias of aliases) {
    if (blockedNames.has(alias)) continue;
    const structuredIds = structured.get(alias);
    const candidates = structuredIds ?? rosterNames.get(alias);
    if (!candidates || candidates.size !== 1) continue;
    const player = [...candidates.values()][0];
    const expression = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gu");
    for (const match of normalized.value.matchAll(expression)) {
      const start = match.index;
      const normalizedEnd = start + match[0].length;
      if (isWordCharacter(Array.from(normalized.value.slice(0, start)).at(-1))
        || isWordCharacter(Array.from(normalized.value.slice(normalizedEnd))[0])) continue;
      const originalStart = normalized.starts[start];
      const originalEnd = normalized.ends[normalizedEnd - 1];
      if (originalStart !== undefined && originalEnd !== undefined) {
        matches.push({ start: originalStart, end: originalEnd, id: player.id, name: text.slice(originalStart, originalEnd), player });
      }
    }
  }

  matches.sort((left, right) => left.start - right.start || right.end - left.end);
  const selected: Mention[] = [];
  let group: Mention[] = [];
  let groupEnd = -1;
  const flush = () => {
    if (!group.length) return;
    const longest = Math.max(...group.map((match) => match.end - match.start));
    const best = group.filter((match) => match.end - match.start === longest);
    if (new Set(best.map((match) => match.id)).size === 1) selected.push(best[0]);
    group = [];
    groupEnd = -1;
  };
  for (const match of matches) {
    if (group.length && match.start >= groupEnd) flush();
    group.push(match);
    groupEnd = Math.max(groupEnd, match.end);
  }
  flush();
  return selected.sort((left, right) => left.start - right.start);
}

function resolvedRows(items: EnrichedComment[], roster: PlayerRef[]): EventRow[] {
  return items.map((item) => {
    const participants = item.participants.map((participant) => resolveParticipant(participant, roster));
    return { item, participants, mentions: playerMentions(item.text, participants, roster) };
  });
}

function TextWithPlayers({ item, mentions, seasonId, profileOrigin }: {
  item: EnrichedComment; mentions: Mention[]; seasonId?: string; profileOrigin?: ProfileOrigin;
}) {
  if (!mentions.length) return <>{item.text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [index, mention] of mentions.entries()) {
    if (mention.start > cursor) parts.push(item.text.slice(cursor, mention.start));
    parts.push(<PlayerLink key={`${mention.id}-${mention.start}-${index}`} player={{ ...mention.player, name: mention.name }}
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
  const filtered = useMemo(() => rows.filter(({ item, participants, mentions }) => {
    const categoryMatches = category === "__unclassified" ? item.category === null : !category || item.category === category;
    const playerMatches = !playerId || participants.some((participant) => participant.player?.id === playerId)
      || mentions.some((mention) => mention.id === playerId);
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
      {chronological.map(({ item, mentions }) => {
        const attributes = attributesFor(item);
        return <li key={`${item.captureId ?? "capture"}-${typeof item.id}-${item.id}`} className={css.item}>
          <div className={css.when}>
            <strong>{item.minute === null ? "Sin minuto" : `${item.minute}′`}</strong>
          </div>
          <div className={css.content}>
            <span className={css.kind}>{eventLabel(item)}</span>
            <p className={css.text}><TextWithPlayers item={item} mentions={mentions}
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
