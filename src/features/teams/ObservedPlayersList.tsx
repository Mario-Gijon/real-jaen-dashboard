import type { ObservedPlayers, PlayerRef } from "@/contract";
import { PlayerAvatar } from "@/ui/PlayerAvatar";
import { POSITION_LABEL, POSITION_ORDER, POSITION_SHORT, positionLabel } from "../format";
import css from "./ObservedPlayersList.module.css";

const lineIndex = ({ position }: PlayerRef) =>
  position ? POSITION_ORDER.indexOf(position) : POSITION_ORDER.length;

/**
 * Players of a team as a real source saw them: name and position only, with
 * where they come from and what the list covers. It belongs to no season, so
 * it says so next to the selected one. No stats, no detail link: the source
 * offers neither here, and nothing synthetic fills the gap.
 */
export function ObservedPlayersList({
  observed,
  seasonLabel,
}: {
  observed: ObservedPlayers;
  seasonLabel: string;
}) {
  const players = [...observed.players].sort(
    (a, b) => lineIndex(a) - lineIndex(b) || a.name.localeCompare(b.name, "es"),
  );
  return (
    <div className={css.observed}>
      <div className={css.notice}>
        <p className={css.source}>{observed.source.label}</p>
        <p>{observed.scope}</p>
        <p>
          No depende de la temporada seleccionada
          {seasonLabel ? ` (${seasonLabel})` : ""}: no es la plantilla de esa temporada.
        </p>
      </div>
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
              <tr key={player.id}>
                <th scope="row">
                  <span className={css.name}>
                    <PlayerAvatar name={player.name} />
                    {player.name}
                  </span>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
