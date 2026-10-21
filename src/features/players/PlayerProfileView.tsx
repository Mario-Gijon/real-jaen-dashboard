"use client";

import Link from "next/link";
import { ApiRequestError, getPlayerProfile } from "@/client/api";
import type { PlayerProfile } from "@/contract";
import { Button } from "@/ui/Button";
import { PlayerAvatar } from "@/ui/PlayerAvatar";
import { ProvenanceNotice } from "@/ui/ProvenanceNotice";
import { MISSING, birthLabel, footLabel, heightLabel, positionLabel } from "../format";
import { useApi } from "../use-api";
import css from "./PlayerDetailView.module.css";

/**
 * Profile of a player from a real source: personal data only, with where they
 * come from and what they cover. It loads nothing else (no season, team,
 * stats or matches) so no synthetic data can slip in; unknown values read «—».
 */
export function PlayerProfileView({ playerId, returnHref }: { playerId: string; returnHref: string }) {
  const profile = useApi(`profile|${playerId}`, (signal) => getPlayerProfile(playerId, { signal }));
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
