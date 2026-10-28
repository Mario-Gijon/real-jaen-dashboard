"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/ui/Button";
import { isActive, useUpdates } from "./use-updates";
import { jobLine, updateTime } from "./labels";
import css from "./Updates.module.css";

/**
 * Compact update control of the top bar, only for an operator session in an installation that has updates.
 * Its label says the real scope (the pilot), never a round or season update. Details at /operador.
 */
export function UpdateControl() {
  const { status, job, busy, publishedNow, start, cancel, reload } = useUpdates();
  if (!status?.available || !status.operator) return null;
  const running = isActive(job);
  const line = job ? jobLine(job) : status.lastPublished ? `Publicado el ${updateTime(status.lastPublished.at)}` : "Sin publicaciones";
  return (
    <div className={css.bar}>
      <span aria-live="polite" className={css.announce} role="status">{line}</span>
      <Link className={css.barState} href="/operador" title={status.scope?.label}>{line}</Link>
      {publishedNow ? (
        <Button className={css.barButton} onClick={reload} size="sm" variant="primary">Recargar datos</Button>
      ) : running ? (
        <Button className={css.barButton} disabled={busy || !job?.cancellable} onClick={cancel} size="sm">
          {job?.cancelRequested ? "Cancelando" : "Cancelar"}
        </Button>
      ) : (
        <Button
          aria-label={`Actualizar: ${status.scope?.label ?? "piloto"}`}
          className={css.barButton}
          disabled={busy}
          icon={<RefreshCw aria-hidden="true" size={15} />}
          onClick={start}
          size="sm"
          title={status.scope?.label}
          variant="primary"
        >
          Actualizar piloto
        </Button>
      )}
    </div>
  );
}
