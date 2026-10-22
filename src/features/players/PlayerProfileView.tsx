"use client";

import Link from "next/link";
import { ApiRequestError, getPlayerObservedMatches, getPlayerProfile, getSource } from "@/client/api";
import type { PlayerProfile } from "@/contract";
import { Button } from "@/ui/Button";
import { PlayerAvatar } from "@/ui/PlayerAvatar";
import { ProvenanceNotice } from "@/ui/ProvenanceNotice";
import { MISSING, birthLabel, footLabel, heightLabel, positionLabel } from "../format";
import { useApi } from "../use-api";
import { ObservedMatches } from "./ObservedMatches";
import { observedMatchHref, type ProfileOrigin } from "./navigation";
import css from "./PlayerDetailView.module.css";

/**
 * Profile of a player from a real source: personal data and the matches the
 * source lists them in, with where they come from and what they cover. It
 * loads nothing synthetic (no season, team or calendar of the app); unknown
 * values read «—». The matches load on their own, so their failure keeps the
 * personal data visible. Each match opens its real detail only when the real
 * match source is active, carrying this profile's context so the detail can
 * return here and, from here, to where the profile was opened.
 */
export function PlayerProfileView({ playerId, returnHref, context = { seasonId: null, origin: null } }: {
  playerId: string; returnHref: string; context?: { seasonId: string | null; origin: ProfileOrigin | null };
}) {
  const profile = useApi(`profile|${playerId}`, (signal) => getPlayerProfile(playerId, { signal }));
  const matches = useApi(`observed-matches|${playerId}`, (signal) => getPlayerObservedMatches(playerId, { signal }));
  const source = useApi("source", (signal) => getSource({ signal }));
  const matchHref = source.data?.realSections.includes("matches")
    ? (matchId: string) => observedMatchHref(matchId, { playerId, ...context })
    : null;
  const back = <Link className={css.back} href={returnHref}>← Volver</Link>;
  if (profile.error) {
    const notFound = profile.error instanceof ApiRequestError && profile.error.status === 404;
    return <div className={css.page}>
      {back}
      <div role="alert" className={css.message}>
        <h1>{notFound ? "Jugador no encontrado" : "No se pudo cargar la ficha del jugador"}</h1>
        <p>{notFound
          ? "La fuente de datos no tiene este jugador."
          : profile.error instanceof ApiRequestError ? profile.error.message : "Error de conexión."}</p>
        {!notFound ? <Button size="sm" onClick={profile.retry}>Reintentar</Button> : null}
      </div>
    </div>;
  }
  if (!profile.data) return <p role="status" className={css.message}>Cargando jugador…</p>;
  return <div className={css.page}>
    {back}
    <Identity data={profile.data} />
    <ObservedMatches load={matches} matchHref={matchHref} />
  </div>;
}

function Identity({ data: { player, scope, source } }: { data: PlayerProfile }) {
  return <header className={css.header}>
    <div className={css.identity}>
      <PlayerAvatar name={player.name} size={48} />
      <div className={css.identityText}>
        <div className={css.name}><h1>{player.name}</h1></div>
        <p className={css.context}>{positionLabel(player.position)}</p>
      </div>
    </div>
    <dl className={css.personal}>
      <div><dt>Nacimiento</dt><dd>{birthLabel(player.birthDate)}</dd></div>
      <div><dt>Estatura</dt><dd>{heightLabel(player.heightCm)}</dd></div>
      <div><dt>Pierna dominante</dt><dd>{footLabel(player.preferredFoot)}</dd></div>
      <div><dt>País</dt><dd>{player.country ?? MISSING}</dd></div>
    </dl>
    <div className={css.provenance}>
      <ProvenanceNotice source={source}><p>{scope}</p></ProvenanceNotice>
    </div>
  </header>;
}
