"use client";

import { useSearchParams } from "next/navigation";
import { getSource } from "@/client/api";
import { Button } from "@/ui/Button";
import { PageHeader } from "@/ui/PageHeader";
import { teamsInitialView } from "../players/navigation";
import { failureReason, useApi } from "../use-api";
import { RealTeamsView } from "./RealTeamsView";
import { SyntheticTeamsView } from "./SyntheticTeamsView";
import type { Props } from "./TeamShell";
import css from "./TeamsView.module.css";

/**
 * «Equipos»: the real teams, or the demonstration's when the API says it is
 * one; neither loads anything of the other. If the API cannot say, nothing is
 * assumed.
 */
export function TeamsView(serverView: Props) {
  // The URL in the browser rules: after Back, Next restores the page with the props of its first request, but
  // the history entry keeps the team, season and tab this page wrote there (`useTeamsUrl`). Without a router
  // (tests), the props.
  const search = useSearchParams();
  const props = search ? teamsInitialView(Object.fromEntries(search)) : serverView;
  const source = useApi("source", (signal) => getSource({ signal }));
  if (source.error) return <>
    <PageHeader title="Equipos" />
    <div className={css.error} role="alert">
      <p>No se pudo determinar la fuente de los equipos. {failureReason(source.error)}</p>
      <Button onClick={source.retry} size="sm">Reintentar</Button>
    </div>
  </>;
  if (!source.data) return <>
    <PageHeader title="Equipos" />
    <p className={css.status} role="status">Cargando equipos…</p>
  </>;
  return source.data.synthetic ? <SyntheticTeamsView {...props} /> : <RealTeamsView {...props} />;
}
