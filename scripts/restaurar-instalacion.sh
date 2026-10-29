#!/bin/sh
# Recuperación conjunta de un respaldo de scripts/respaldo-instalacion.sh en volúmenes NUEVOS
# (docs/despliegue-servidor.md, «Copias y recuperación»). Sirve también para la primera carga del servidor.
#
#   ENV_FILE=.env.docker COMPOSE_FILES="-f compose.yaml -f compose.acquisition.yaml" sh scripts/restaurar-instalacion.sh RESPALDO
#
# RESPALDO es la carpeta del respaldo, dentro de RJ_IMPORT_DIR (el backend la lee en /imports, solo lectura).
# Comprueba SHA256SUMS; se niega si algún volumen de destino ya existe; restaura juntos la base, sus registros de
# actualización (misma generación confirmada) y, con el overlay, los trabajos de adquisición; inicializa un perfil
# de navegador nuevo; verifica la base y que el coordinador la acepta con la generación del manifiesto. No arranca
# los servicios: eso es un paso aparte (docs/despliegue-servidor.md, «Arranque»).
set -eu
SRC=${1:?Indica la carpeta del respaldo}
ENV_FILE=${ENV_FILE:-.env.docker}
COMPOSE_FILES=${COMPOSE_FILES:--f compose.yaml}
test -f "$ENV_FILE" || { echo "No existe $ENV_FILE" >&2; exit 1; }
var() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1; }
STATE_VOLUME=$(var RJ_STATE_VOLUME)
JOBS_VOLUME=$(var RJ_ACQUISITION_JOBS_VOLUME)
PROFILE_VOLUME=$(var RJ_ACQUISITION_PROFILE_VOLUME)
IMPORT_DIR=$(var RJ_IMPORT_DIR)
PROJECT=$(var COMPOSE_PROJECT_NAME)
# shellcheck disable=SC2086
dc() { docker compose --env-file "$ENV_FILE" $COMPOSE_FILES "$@"; }
with_acquisition=no
case " $COMPOSE_FILES " in *compose.acquisition.yaml*) with_acquisition=yes ;; esac

# The backup must be inside the import directory, which the backend mounts read-only at /imports.
src_abs=$(cd "$SRC" && pwd)
imp_abs=$(cd "$IMPORT_DIR" && pwd)
case "$src_abs/" in "$imp_abs"/*) REL=${src_abs#"$imp_abs"/} ;; *) echo "El respaldo debe estar dentro de RJ_IMPORT_DIR ($imp_abs)" >&2; exit 1 ;; esac
(cd "$src_abs" && sha256sum -c SHA256SUMS) || { echo "Las sumas del respaldo no coinciden" >&2; exit 1; }
# Git Bash (Windows): paths for Docker in Windows form, and no automatic conversion of container paths.
case "$(uname -s)" in MINGW*|MSYS*) ENV_FILE=$(cygpath -m "$ENV_FILE"); imp_abs=$(cygpath -m "$imp_abs"); export MSYS_NO_PATHCONV=1 ;; esac

volumes="$STATE_VOLUME"
if [ "$with_acquisition" = yes ]; then volumes="$volumes $JOBS_VOLUME $PROFILE_VOLUME"; fi
for vol in $volumes; do
  if docker volume inspect "$vol" >/dev/null 2>&1; then echo "Volumen existente: $vol (se restaura solo en volúmenes nuevos)" >&2; exit 1; fi
done
for vol in $volumes; do docker volume create --label "rj.installation=$PROJECT" "$vol" >/dev/null; echo "Creado $vol"; done

dc run --rm --no-deps --user 0:0 --cap-add CHOWN --entrypoint chown backend 10001:10001 /state
dc run --rm --no-deps backend -m scripts.initialize_snapshot "/imports/$REL/real-jaen.sqlite" /state/real-jaen.sqlite
dc run --rm --no-deps --entrypoint sh backend -c "set -eu
tar -xf '/imports/$REL/actualizaciones.tar' -C /state
if [ -f '/imports/$REL/procedencia.tar' ]; then tar -xf '/imports/$REL/procedencia.tar' -C /state && chmod -R a-w /state/procedencia; fi"
dc run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite >/dev/null
# The coordinator must accept the base with the generation recorded in the backup (same content, same records).
dc run --rm --no-deps --entrypoint python backend -B -c "
import json
from persistencia.actualizacion import Coordinador
expected = json.load(open('/imports/$REL/manifest.json'))['generacion']
with Coordinador('/state/real-jaen.sqlite', '/app/ambito.json', reserva=0) as c:
    g = c.capturar()
assert g.id == expected, (g.id, expected)
print('Coordinador: generación', g.id, 'aceptada')"

if [ "$with_acquisition" = yes ]; then
  if [ -f "$src_abs/acquisition-jobs.tar" ]; then
    image=$(var RJ_ACQUISITION_IMAGE)
    docker run --rm --network none --user 10001:10001 -v "$JOBS_VOLUME:/acquisition-jobs" -v "$imp_abs:/imports:ro" \
      --entrypoint tar "$image" -xf "/imports/$REL/acquisition-jobs.tar" -C /acquisition-jobs
  fi
  dc --profile admin run --rm --no-deps acquisition-admin initialize-profile --confirm-new-profile
fi
echo "Restaurado sin arrancar servicios. Siguiente paso: dc up -d --no-build --wait"
