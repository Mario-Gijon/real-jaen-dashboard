"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { getPlayer } from "@/client/api";
import type { SeasonStat, SquadPlayer } from "@/contract";
import { Button } from "@/ui/Button";
import { SidePanel } from "@/ui/SidePanel";
import { birthLabel, footLabel, heightLabel, initials, MISSING, positionLabel } from "../format";
import { SeasonValue } from "../SeasonValue";
import { useApi } from "../use-api";
import css from "./TeamPlayerSheet.module.css";

/**
 * Quick sheet of a squad player: identity, personal data and the five season
 * figures of the table. Personal data come from the player endpoint; the
 * season figures are the ones already loaded with the squad.
 */
export function TeamPlayerSheet({
  row,
  teamName,
  seasonId,
  onClose,
}: {
  row: SquadPlayer;
  teamName: string;
  seasonId: string;
  onClose: () => void;
}) {
  const { player, shirtNumber, stats } = row;
  const profile = useApi(`${player.id}|${seasonId}`, (signal) =>
    getPlayer(player.id, seasonId, { signal }),
  );
  const personal: [string, string | null][] = [
    ["Nacimiento", profile.data ? birthLabel(profile.data.player.birthDate) : null],
    ["Estatura", profile.data ? heightLabel(profile.data.player.heightCm) : null],
    ["Pierna dominante", profile.data ? footLabel(profile.data.player.preferredFoot) : null],
  ];
  const season: [string, SeasonStat][] = [
    ["Partidos jugados", stats.appearances],
    ["Titularidades", stats.starts],
    ["Minutos", stats.minutes],
    ["Goles", stats.goals],
    ["Asistencias", stats.assists],
  ];
  const href = `/players/${encodeURIComponent(player.id)}?season=${encodeURIComponent(seasonId)}`;

  return (
    <SidePanel
      description={`${positionLabel(player.position)} · ${teamName}`}
      footer={
        <Link className={css.profile} href={href} prefetch={false}>
          Ver ficha completa
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      }
      header={
        <span aria-hidden="true" className={css.avatar}>
          {initials(player.name)}
          {shirtNumber !== null ? <span className={css.shirt}>{shirtNumber}</span> : null}
        </span>
      }
      onClose={onClose}
      title={player.name}
    >
      <div className={css.sheet}>
        <section aria-labelledby="sheet-identity">
          <h3 className={css.heading} id="sheet-identity">
            Datos personales
          </h3>
          {profile.error ? (
            <div className={css.error} role="alert">
              <p>No se pudieron cargar los datos personales.</p>
              <Button onClick={profile.retry} size="sm">
                Reintentar
              </Button>
            </div>
          ) : (
            <dl aria-busy={profile.loading || undefined} className={css.facts}>
              <div>
                <dt>Dorsal</dt>
                <dd data-missing={shirtNumber === null || undefined}>{shirtNumber ?? MISSING}</dd>
              </div>
              {personal.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd data-missing={value === MISSING || undefined}>
                    {value ?? <span className={css.loading}>…</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
        <section aria-labelledby="sheet-season">
          <h3 className={css.heading} id="sheet-season">
            Temporada
          </h3>
          <dl className={css.season}>
            {season.map(([label, stat]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <SeasonValue stat={stat} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </SidePanel>
  );
}
