#!/bin/sh
# Respaldo consistente de una instalación Docker (docs/despliegue-servidor.md, «Copias y recuperación»).
#
#   ENV_FILE=.env.docker COMPOSE_FILES="-f compose.yaml -f compose.acquisition.yaml" sh scripts/respaldo-instalacion.sh DESTINO
#
# Desde la carpeta rj-analyst. DESTINO es una carpeta nueva del anfitrión. Contenido:
#   real-jaen.sqlite          copia SQLite consistente (persistencia copiar: integridad y huella comprobadas)
#   actualizaciones.tar       <base>.actualizaciones: generación confirmada, trabajos, solicitudes y bundles sellados
#   procedencia.tar           /state/procedencia (evidencia archivada), si existe
#   acquisition-jobs.tar      volumen de trabajos de adquisición (rotación de jornadas, bloqueos), si hay overlay
#   manifest.json, SHA256SUMS
# No incluye secretos ni el perfil del navegador (sus cookies no se copian: en el destino se inicializa otro).
#
# Detiene frontend, backend y acquisition durante la copia (un minuto aproximadamente) y los vuelve a arrancar.
# Se niega si hay una actualización en curso. Nunca toca los datos de origen.
set -eu
DEST=${1:?Indica una carpeta de destino nueva}
ENV_FILE=${ENV_FILE:-.env.docker}
COMPOSE_FILES=${COMPOSE_FILES:--f compose.yaml}
test -f "$ENV_FILE" || { echo "No existe $ENV_FILE" >&2; exit 1; }
test ! -e "$DEST" || { echo "El destino ya existe: $DEST" >&2; exit 1; }
var() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1; }
STATE_VOLUME=$(var RJ_STATE_VOLUME)
JOBS_VOLUME=$(var RJ_ACQUISITION_JOBS_VOLUME)
BACKEND_IMAGE=$(var RJ_BACKEND_IMAGE)
test -n "$STATE_VOLUME" && test -n "$BACKEND_IMAGE" || { echo "Faltan RJ_STATE_VOLUME o RJ_BACKEND_IMAGE en $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC2086
dc() { docker compose --env-file "$ENV_FILE" $COMPOSE_FILES "$@"; }
with_acquisition=no
case " $COMPOSE_FILES " in *compose.acquisition.yaml*) with_acquisition=yes ;; esac

# Ninguna actualización en curso (lectura inmutable: no toca los archivos).
active=$(docker run --rm --network none -v "$STATE_VOLUME:/state:ro" --entrypoint python "$BACKEND_IMAGE" -c "
import os, sqlite3
p = '/state/real-jaen.sqlite.actualizaciones/control/jobs.sqlite'
print(sqlite3.connect(f'file:{p}?mode=ro&immutable=1', uri=True).execute(
    \"SELECT count(*) FROM job WHERE state IN ('queued','running')\").fetchone()[0] if os.path.exists(p) else 0)")
test "$active" = 0 || { echo "Hay una actualización en curso: espera a que termine" >&2; exit 1; }

mkdir -p "$DEST"
OUT=$(cd "$DEST" && pwd)
# Git Bash (Windows): paths for Docker in Windows form, and no automatic conversion of container paths.
case "$(uname -s)" in MINGW*|MSYS*) OUT=$(cd "$DEST" && pwd -W); ENV_FILE=$(cygpath -m "$ENV_FILE"); export MSYS_NO_PATHCONV=1 ;; esac

services="frontend backend"
test "$with_acquisition" = yes && services="frontend backend acquisition"
echo "Deteniendo: $services"
# shellcheck disable=SC2086
dc stop $services
restart() {
  echo "Arrancando de nuevo"
  dc up -d --no-build --wait --wait-timeout 180
}
trap restart EXIT

report=$(dc run --rm --no-deps -T backend -m persistencia copiar --base /state/real-jaen.sqlite --motivo respaldo-instalacion)
printf '%s\n' "$report" > "$OUT/copiar.json"
copy=$(printf '%s' "$report" | sed -n 's/.*"ruta": "\([^"]*\)".*/\1/p' | head -1)
test -n "$copy" || { echo "persistencia copiar no informó la copia" >&2; exit 1; }

docker run --rm --network none -v "$STATE_VOLUME:/state:ro" -v "$OUT:/out" --entrypoint sh "$BACKEND_IMAGE" -c "
set -eu
cp '$copy' /out/real-jaen.sqlite
tar -cf /out/actualizaciones.tar -C /state real-jaen.sqlite.actualizaciones
if [ -d /state/procedencia ]; then tar -cf /out/procedencia.tar -C /state procedencia; fi"
if [ "$with_acquisition" = yes ] && [ -n "$JOBS_VOLUME" ]; then
  docker run --rm --network none -v "$JOBS_VOLUME:/jobs:ro" -v "$OUT:/out" --entrypoint tar "$BACKEND_IMAGE" -cf /out/acquisition-jobs.tar -C /jobs .
fi
trap - EXIT
restart

# Manifiesto: generación confirmada, huella, revisión y última publicación, leídos del propio respaldo.
docker run --rm --network none -v "$OUT:/out" --entrypoint python "$BACKEND_IMAGE" -c "
import hashlib, io, json, sqlite3, tarfile
from persistencia import sqlite as s
d = s.describir('/out/real-jaen.sqlite')
with tarfile.open('/out/actualizaciones.tar') as t:
    meta = sqlite3.connect(':memory:')
    raw = t.extractfile('real-jaen.sqlite.actualizaciones/jobs.sqlite').read()
    open('/tmp/c.sqlite', 'wb').write(raw)
    confirmed = json.loads(sqlite3.connect('/tmp/c.sqlite').execute('SELECT detalle FROM confirmado').fetchone()[0])
    open('/tmp/j.sqlite', 'wb').write(t.extractfile('real-jaen.sqlite.actualizaciones/control/jobs.sqlite').read())
    jobs = sqlite3.connect('/tmp/j.sqlite').execute(\"SELECT count(*), max(json_extract(data,'$.finished_at')) FROM job WHERE state='completed'\").fetchone()
runs = sqlite3.connect('file:/out/real-jaen.sqlite?mode=ro', uri=True).execute('SELECT count(*), max(finished_at) FROM import_run').fetchone()
json.dump(dict(revision=d['revision'], huella=d['huella'], integridad=d['integridad'], generacion=confirmed.get('generacion'),
               import_runs=runs[0], ultima_importacion=runs[1], actualizaciones_publicadas=jobs[0], ultima_publicacion=jobs[1]),
          open('/out/manifest.json', 'w'), indent=2)
print(open('/out/manifest.json').read())"
(cd "$OUT" && sha256sum ./*.sqlite ./*.tar ./*.json > SHA256SUMS && cat SHA256SUMS)
echo "Respaldo completo en $OUT"
