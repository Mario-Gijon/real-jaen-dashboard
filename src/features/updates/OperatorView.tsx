"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/ui/Button";
import { PageHeader } from "@/ui/PageHeader";
import { isActive, useUpdates } from "./use-updates";
import { CoverageSummary } from "./CoverageSummary";
import { PHASE_LABELS, STEPS, hasPending, jobLine, updateTime } from "./labels";
import css from "./Updates.module.css";

/**
 * The operator's update screen (not in the navigation): session, real scope, last publication, the job's step,
 * cancel while still consulting, and its outcome. Whatever happens, the last valid data stay published.
 */
export function OperatorView() {
  const { status, job, busy, problem, publishedNow, start, cancel, login, logout, reload } = useUpdates();
  const [key, setKey] = useState("");

  if (status === null) {
    return <><PageHeader title="Actualización de datos" />{problem ? <p className={css.problem} role="alert">{problem}</p> : <p>Cargando…</p>}</>;
  }
  if (!status.available) {
    return (
      <>
        <PageHeader title="Actualización de datos" />
        <p>La actualización no está disponible en esta instalación.</p>
      </>
    );
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void login(key).then(() => setKey(""));
  };
  const running = isActive(job);
  const scope = status.scope;

  return (
    <>
      <PageHeader
        title="Actualización de datos"
        description={scope ? scope.label : undefined}
        actions={status.operator ? <Button disabled={busy} onClick={logout} size="sm" variant="ghost">Cerrar sesión</Button> : undefined}
      />
      {scope ? (
        <section className={css.section} aria-labelledby="alcance">
          <h2 id="alcance">Alcance</h2>
          <p>{scope.description}</p>
          {scope.kind === "pilot" && scope.matchIds.length === 1 ? (
            <p><Link href={`/matches/${scope.matchIds[0]}`}>Ver el partido del piloto</Link></p>
          ) : null}
          <p className={css.muted}>
            {status.lastPublished
              ? `Última publicación desde este control: ${updateTime(status.lastPublished.at)}.`
              : "Todavía no hay publicaciones desde este control."}
          </p>
        </section>
      ) : null}

      {!status.operator ? (
        <form className={css.login} onSubmit={submit}>
          <label htmlFor="operator-key">Clave de operador</label>
          <input
            autoComplete="current-password"
            id="operator-key"
            onChange={(event) => setKey(event.target.value)}
            type="password"
            value={key}
          />
          <Button disabled={busy || key.length === 0} type="submit" variant="primary">Entrar</Button>
          {problem ? <p className={css.problem} role="alert">{problem}</p> : null}
        </form>
      ) : (
        <section className={css.section} aria-labelledby="estado">
          <h2 id="estado">Estado</h2>
          {job ? (
            <>
              {running ? (
                <ol className={css.steps}>
                  {STEPS.map((step) => (
                    <li aria-current={job.phase === step ? "step" : undefined} key={step}>{PHASE_LABELS[step]}</li>
                  ))}
                </ol>
              ) : null}
              <p aria-live="polite" className={hasPending(job) ? css.warn : job.status === "completed" ? css.ok : running || job.status === "cancelled" ? undefined : css.problem} role="status">
                {jobLine(job)}
              </p>
              <p className={css.muted}>Solicitada el {updateTime(job.requestedAt)}.</p>
              {job.status === "completed" && job.result?.coverage ? <CoverageSummary coverage={job.result.coverage} /> : null}
            </>
          ) : (
            <p className={css.muted}>No hay actualizaciones todavía.</p>
          )}
          {status.lastCoverage && status.lastPublished && !(job?.status === "completed" && job.result?.coverage) ? (
            // A later update did not publish: what the last publication left pending or deferred is still what is served.
            <section aria-labelledby="ultima-publicacion" className={css.coverage}>
              <h3 id="ultima-publicacion">Última publicación ({updateTime(status.lastPublished.at)})</h3>
              <CoverageSummary coverage={status.lastCoverage} />
            </section>
          ) : null}
          <div className={css.actions}>
            {running ? (
              <Button disabled={busy || !job?.cancellable} onClick={cancel}>
                {job?.cancelRequested ? "Cancelando…" : job?.cancellable ? "Cancelar" : "Ya no se puede cancelar"}
              </Button>
            ) : (
              <Button disabled={busy} onClick={start} variant="primary">{scope?.actionLabel ?? "Actualizar"}</Button>
            )}
            {publishedNow ? <Button onClick={reload}>Recargar datos</Button> : null}
          </div>
          {problem ? <p className={css.problem} role="alert">{problem}</p> : null}
        </section>
      )}
    </>
  );
}
