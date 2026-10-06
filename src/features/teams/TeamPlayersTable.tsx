"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { getPlayer } from "@/client/api";
import { LinkedTableRow } from "@/ui/LinkedTableRow";
import { playerHref } from "../players/navigation";
import { useApi } from "../use-api";
import type { PlayerPosition, PlayerSeasonStats, SquadPlayer } from "@/contract";
import {
  POSITION_LABEL,
  POSITION_ORDER,
  POSITION_PLURAL,
  POSITION_SHORT,
  positionLabel,
  footLabel,
} from "../format";
import { PlayerAvatar } from "@/ui/PlayerAvatar";
import { SeasonValue } from "../SeasonValue";
import css from "./TeamPlayersTable.module.css";

type StatKey = keyof Pick<
  PlayerSeasonStats,
  "appearances" | "starts" | "minutes" | "goals" | "assists"
>;
export type SortKey = "name" | "position" | StatKey;
type Sort = { key: SortKey; direction: "ascending" | "descending" };

/** Key, header, header on phones, full name. */
const STAT_COLUMNS: readonly (readonly [StatKey, string, string, string])[] = [
  ["appearances", "PJ", "PJ", "Partidos jugados"],
  ["starts", "Tit.", "Tit", "Titularidades"],
  ["minutes", "Min.", "Min", "Minutos"],
  ["goals", "Goles", "G", "Goles"],
  ["assists", "Asist.", "A", "Asistencias"],
];

const lineIndex = (position: PlayerPosition | null) =>
  position ? POSITION_ORDER.indexOf(position) : POSITION_ORDER.length;

/** Line, then shirt number: how a squad list reads by default. */
function byPosition(a: SquadPlayer, b: SquadPlayer) {
  return (
    lineIndex(a.player.position) - lineIndex(b.player.position) ||
    (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999) ||
    a.player.name.localeCompare(b.player.name, "es")
  );
}

/** Missing values always go last, whatever the direction. */
function sortSquad(rows: readonly SquadPlayer[], { key, direction }: Sort): SquadPlayer[] {
  const sign = direction === "ascending" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "position") return sign * byPosition(a, b);
    if (key === "name") return sign * a.player.name.localeCompare(b.player.name, "es");
    const [x, y] = [a.stats[key].value, b.stats[key].value];
    if (x === null || y === null) return x === y ? byPosition(a, b) : x === null ? 1 : -1;
    return sign * (x - y) || byPosition(a, b);
  });
}

/** Thin bar below the minutes: share of the squad's highest figure, a visual aid only. */
function MinutesBar({ minutes, max }: { minutes: number; max: number }) {
  const share = max > 0 ? Math.min(1, minutes / max) : 0;
  return (
    <span aria-hidden="true" className={css.bar}>
      {minutes > 0 ? <span style={{ width: `${share * 100}%` }} /> : null}
    </span>
  );
}

/**
 * The season squad: filter by line, sort by column, navigate to the player.
 * Every squad member appears, with or without minutes; a real 0 reads «0».
 */
export function TeamPlayersTable({
  squad,
  seasonId,
  teamId,
}: {
  squad: readonly SquadPlayer[];
  seasonId: string;
  teamId: string;
}) {
  const [line, setLine] = useState<PlayerPosition | "all">("all");
  const [sort, setSort] = useState<Sort>({ key: "position", direction: "ascending" });
  const counts = useMemo(() => {
    const result = new Map<PlayerPosition, number>();
    for (const { player } of squad) {
      if (player.position) result.set(player.position, (result.get(player.position) ?? 0) + 1);
    }
    return result;
  }, [squad]);
  // Scale of the minutes bars: the whole squad, so the line filter never rescales them.
  const maxMinutes = useMemo(
    () => Math.max(0, ...squad.map((row) => row.stats.minutes.value ?? 0)),
    [squad],
  );
  const rows = useMemo(
    () =>
      sortSquad(
        squad.filter((row) => line === "all" || row.player.position === line),
        sort,
      ),
    [squad, line, sort],
  );

  function header(key: SortKey, short: string, long: string, numeric = false, phone = short) {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.direction === "ascending" ? ArrowUp : ArrowDown;
    return (
      <button
        className={css.sort}
        data-active={active || undefined}
        onClick={() =>
          setSort(
            active
              ? { key, direction: sort.direction === "ascending" ? "descending" : "ascending" }
              : { key, direction: numeric ? "descending" : "ascending" },
          )
        }
        title={`Ordenar por ${long.toLocaleLowerCase("es")}`}
        type="button"
      >
        <abbr title={long}>
          {phone === short ? (
            short
          ) : (
            <>
              <span className={css.longLabel}>{short}</span>
              <span className={css.shortLabel}>{phone}</span>
            </>
          )}
        </abbr>
        <Icon aria-hidden="true" size={12} />
      </button>
    );
  }
  const ariaSort = (key: SortKey) => (sort.key === key ? sort.direction : undefined);

  return (
    <div className={css.players}>
      <div aria-label="Filtrar por posición" className={css.filters} role="group">
        <button aria-pressed={line === "all"} onClick={() => setLine("all")} type="button">
          Todos <span>{squad.length}</span>
        </button>
        {POSITION_ORDER.filter((p) => counts.get(p)).map((position) => (
          <button
            aria-pressed={line === position}
            key={position}
            onClick={() => setLine(position)}
            type="button"
          >
            {POSITION_PLURAL[position]} <span>{counts.get(position)}</span>
          </button>
        ))}
      </div>
      <div className={css.scroll}>
        <table className={css.table}>
          <caption className={css.sr}>Jugadores de la plantilla</caption>
          <thead>
            <tr>
              <th aria-sort={ariaSort("name")} className={css.player} scope="col">
                {header("name", "Jugador", "Nombre")}
              </th>
              <th aria-sort={ariaSort("position")} className={css.position} scope="col">
                {header("position", "Posición", "Posición", false, "Pos")}
              </th>
              {STAT_COLUMNS.map(([key, short, phone, long]) => (
                <th aria-sort={ariaSort(key)} className={css.stat} key={key} scope="col">
                  {header(key, short, long, true, phone)}
                </th>
              ))}
              <th className={css.personalHeader} scope="col">Estatura</th>
              <th className={css.personalHeader} scope="col">Pierna</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <LinkedTableRow data-unused={row.stats.appearances.value === 0 || undefined} key={row.player.id}>
                <th className={css.player} scope="row">
                  <Link
                    aria-label={`Ver ficha de ${row.player.name}`}
                    className={css.open}
                    href={playerHref(row.player.id, seasonId, { kind: "team", id: teamId })}
                    prefetch={false}
                  >
                    <span aria-hidden="true" className={css.shirt}>
                      {row.shirtNumber ?? "—"}
                    </span>
                    {/* The contract has no player picture yet: always the neutral fallback. */}
                    <PlayerAvatar name={row.player.name} />
                    <span className={css.name}>{row.player.name}</span>
                  </Link>
                </th>
                <td className={css.position}>
                  <span className={css.positionLong}>{positionLabel(row.player.position)}</span>
                  <abbr
                    className={css.positionShort}
                    title={row.player.position ? POSITION_LABEL[row.player.position] : undefined}
                  >
                    {row.player.position ? POSITION_SHORT[row.player.position] : "—"}
                  </abbr>
                </td>
                {STAT_COLUMNS.map(([key]) => (
                  <td
                    className={key === "minutes" ? `${css.stat} ${css.minutes}` : css.stat}
                    key={key}
                  >
                    {key === "minutes" ? (
                      <span className={css.minutesValue}>
                        <SeasonValue stat={row.stats[key]} />
                        <MinutesBar max={maxMinutes} minutes={row.stats.minutes.value ?? 0} />
                      </span>
                    ) : <SeasonValue stat={row.stats[key]} />}
                  </td>
                ))}
                <PersonalCells playerId={row.player.id} seasonId={seasonId} />
              </LinkedTableRow>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <p className={css.empty}>No hay jugadores en esta posición.</p> : null}
    </div>
  );
}

function PersonalCells({ playerId, seasonId }: { playerId: string; seasonId: string }) {
  const profile = useApi(`personal|${playerId}|${seasonId}`, signal => getPlayer(playerId, seasonId, { signal }));
  const player = profile.data?.player;
  const note = profile.error ? "No se pudieron cargar los datos personales" : profile.loading ? "Cargando datos personales" : undefined;
  return <>
    <td aria-busy={profile.loading || undefined} title={note}>{profile.loading ? "…" : player?.heightCm != null ? `${player.heightCm} cm` : "—"}</td>
    <td aria-busy={profile.loading || undefined} title={note}>{profile.loading ? "…" : footLabel(player?.preferredFoot ?? null)}</td>
  </>;
}
