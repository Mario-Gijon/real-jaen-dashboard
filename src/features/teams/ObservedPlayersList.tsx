import Link from "next/link";
import type { ObservedPlayers, PlayerRef } from "@/contract";
import { LinkedTableRow } from "@/ui/LinkedTableRow";
import { PlayerAvatar } from "@/ui/PlayerAvatar";
import { ProvenanceNotice } from "@/ui/ProvenanceNotice";
import { POSITION_LABEL, POSITION_ORDER, POSITION_SHORT, positionLabel } from "../format";
import { playerProfileHref } from "../players/navigation";
import css from "./ObservedPlayersList.module.css";

const lineIndex = ({ position }: PlayerRef) =>
  position ? POSITION_ORDER.indexOf(position) : POSITION_ORDER.length;

/**
 * Players of a team as a real source saw them: name and position only, with
 * where they come from and what the list covers. It belongs to no season, so
 * it says so next to the selected one. No stats: the source offers none here,
 * and nothing synthetic fills the gap. Each player opens their real profile.
 */
export function ObservedPlayersList({
  observed,
  seasonId,
  seasonLabel,
}: {
  observed: ObservedPlayers;
  seasonId: string | null;
  seasonLabel: string;
}) {
  const players = [...observed.players].sort(
    (a, b) => lineIndex(a) - lineIndex(b) || a.name.localeCompare(b.name, "es"),
  );
  return (
    <div className={css.observed}>
      <ProvenanceNotice source={observed.source}>
        <p>{observed.scope}</p>
        <p>
          No depende de la temporada seleccionada
          {seasonLabel ? ` (${seasonLabel})` : ""}: no es la plantilla de esa temporada.
        </p>
      </ProvenanceNotice>
      {players.length === 0 ? (
        <p className={css.empty}>La fuente no tiene jugadores observados de este equipo.</p>
      ) : (
        <table className={css.table}>
          <caption>
            Jugadores observados <span>{players.length}</span>
          </caption>
          <thead>
            <tr>
              <th scope="col">Jugador</th>
              <th scope="col">Posición</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <LinkedTableRow key={player.id}>
                <th scope="row">
                  <Link
                    aria-label={`Ver ficha de ${player.name}`}
                    className={css.open}
                    href={playerProfileHref(player.id, seasonId, { kind: "team", id: observed.teamId })}
                    prefetch={false}
                  >
                    <PlayerAvatar name={player.name} />
                    {player.name}
                  </Link>
                </th>
                <td>
                  <span className={css.positionLong}>{positionLabel(player.position)}</span>
                  <abbr
                    className={css.positionShort}
                    title={player.position ? POSITION_LABEL[player.position] : undefined}
                  >
                    {player.position ? POSITION_SHORT[player.position] : "—"}
                  </abbr>
                </td>
              </LinkedTableRow>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
