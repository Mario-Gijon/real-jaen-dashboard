"use client";

import { getSource } from "@/client/api";
import { PageHeader } from "@/ui/PageHeader";
import { failureReason, useApi } from "../use-api";
import { RealMatchesView } from "./RealMatchesView";
import { LoadError, SyntheticMatchesView, type Props } from "./SyntheticMatchesView";
import css from "./MatchesView.module.css";

/**
 * «Partidos»: the real matches, or the demonstration's when the API says it is
 * one; never both in the same list. If the API cannot say, nothing is assumed.
 */
export function MatchesView(props: Props = {}) {
  const source = useApi("source", (signal) => getSource({ signal }));
  if (source.error) return <>
    <PageHeader title="Partidos" />
    <LoadError message={`No se pudo determinar la fuente de los partidos. ${failureReason(source.error)}`} retry={source.retry} />
  </>;
  if (!source.data) return <>
    <PageHeader title="Partidos" />
    <p className={css.status} role="status">Cargando partidos…</p>
  </>;
  return source.data.synthetic ? <SyntheticMatchesView {...props} /> : <RealMatchesView {...props} />;
}
