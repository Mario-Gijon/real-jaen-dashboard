import type { UpdateJob, UpdatePendingReason, UpdatePhase, UpdateResource } from "@/contract";

const timeFormat = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

/** UTC ISO-8601 from the API as local time of Jaén. */
export function updateTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export const PHASE_LABELS: Record<Exclude<UpdatePhase, "finished">, string> = {
  queued: "En cola",
  acquiring: "Consultando datos",
  verifying: "Comprobando los datos recibidos",
  publishing: "Publicando",
};

export const STEPS: Exclude<UpdatePhase, "queued" | "finished">[] = ["acquiring", "verifying", "publishing"];

export const RESOURCE_LABELS: Record<UpdateResource, string> = {
  event: "datos del partido",
  lineups: "alineaciones",
  statistics: "estadísticas",
  incidents: "incidencias",
};

/** Why a resource is pending, in Spanish. None of them means "no data exist" and none becomes a zero. */
export const REASON_LABELS: Record<UpdatePendingReason, string> = {
  empty: "respuesta sin datos",
  not_found: "no disponible en la fuente",
  parse: "respuesta ilegible",
  error: "error de la fuente",
  budget: "pendiente para la próxima actualización",
  not_requested: "no consultado",
};

/** A completed update that published while some resources stayed pending. */
export const hasPending = (job: UpdateJob) => job.status === "completed" && (job.result?.coverage?.pending.length ?? 0) > 0;

/** One line for the analyst about where a job is or how it ended. Never claims more than was published. */
export function jobLine(job: UpdateJob): string {
  if (job.status === "queued" || job.status === "running") {
    const phase = job.phase === "finished" ? "publishing" : job.phase;
    return job.cancelRequested ? "Cancelando…" : `${PHASE_LABELS[phase]}…`;
  }
  if (job.status === "completed" && job.result) {
    if (hasPending(job)) return `Actualización completada con pendientes (${updateTime(job.result.publishedAt)})`;
    return `Publicado el ${updateTime(job.result.publishedAt)}${job.result.reusedBundle ? ", sin volver a consultar" : ""}`;
  }
  if (job.status === "cancelled") return "Cancelada. Se mantienen los datos anteriores.";
  const reason = job.error?.message ?? "No se pudo actualizar.";
  return `${reason} Se mantienen los datos anteriores.`;
}
