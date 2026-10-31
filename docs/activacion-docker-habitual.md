> Nota de vigencia: este documento conserva el registro histórico de 29-10-2026. La configuración operativa actual usa `compose.yaml` y `.env.docker` en la raíz del workspace `app-real-jaen/`; consulta [docker.md](docker.md) para los comandos vigentes.

# Activación de Docker como instalación habitual

Preparado y **ejecutado el 29-10-2026** («Registro de la activación», al final). Código de las imágenes:
api-real-jaen `2c4008b9fd2a` y rj-analyst `3cd0df99f472`.

## Situación de partida

Comprobada en solo lectura el 29-10:

| | Base Windows | Volumen Docker `rj-analyst-local-state` | Base de la prueba real (`rj-real-group-real-9207547e-state`) |
|---|---|---|---|
| Archivo | `datos-importados/base/real-jaen.sqlite` | `/state/real-jaen.sqlite` | `/state/base.sqlite` |
| Servicio que la usa | `api.py` del venv, si se arranca a mano (`.env.local`) | Compose `rj-analyst-local` (`.env.docker`) | Ninguno |
| Estado | Sin escrituras desde el 25-10 17:57; WAL vacío | Creado el 25-10 (prueba de traslado) | Copia del 27-10 + mantenimiento único + J9 real |
| Revisión / digest lógico | 0004 / `737a5cc5…` | 0004 / `737a5cc5…` | 0004 / `d881106f…` |
| Sustituciones locales | 2 | 2 | 2 (las mismas) |

- No hay ningún servicio del proyecto en marcha: ni contenedores ni procesos en 3200 u 8001.
- La base Windows y el volumen Docker son **instalaciones independientes con el mismo contenido**: el digest de cada
  tabla es idéntico, y también el de la copia del 27-10 de la que partió la prueba real.

**Instalación habitual elegida: Docker.** Los datos definitivos quedarán en un volumen nuevo, `rj-analyst-state`.
- La base Windows queda congelada como archivo: no se borra, no se arranca su API.
- `rj-analyst-local-state` queda intacto como vuelta atrás.

## Incorporar J9 sin repetir consultas

**Recomendado: promover la base de la prueba real.** Es la base habitual, sin cambios desde el 27-10, más dos pasos
hechos con este mismo código:
- el mantenimiento único (`import_run` 4, `rebuild`, sin cambios en los datos);
- la publicación de J9 por el camino normal (`import_run` 5): bundle sellado, verificado contra su generación y su
  inventario, con la restricción exigida y publicado por el coordinador.

Por qué se puede:
- **Procedencia:** la base guarda los originales de cada sección con su `fetched_at`. El bundle sellado (con las
  respuestas originales en `provenance.jsonl`) y los informes se archivan junto a la base.
- **Generación:** el coordinador de la instalación habitual no tiene historial propio de esa base. Solo la acepta si
  la última importación registra la huella de reglas del código de la imagen (aquí coinciden: el código de
  `2c4008b` es el de la prueba). Después abre una generación nueva.

Condiciones de la promoción:
- Solo es válida si la base habitual no ha cambiado desde la copia del 27-10. El paso 0 lo comprueba: la base
  Windows y `rj-analyst-local-state` deben seguir dando el digest `737a5cc5…`.
- En el historial de la base el mantenimiento figura con la orden `acquisition test copy: explicit rule adoption`,
  porque se hizo en la copia aislada. No se reescribe: se documenta aquí.
- El bundle de prueba **no se adapta ni se vuelve a publicar**. No podría: su manifiesto está ligado a la generación
  de la copia (`e227be73`) y el verificador lo rechazaría en otra. Se conserva como evidencia.

**Alternativas, no recomendadas:**
- **B. Volumen nuevo desde la base Windows, más mantenimiento**, y J9 con una nueva actualización real. Repite las
  consultas.
- **C. Reimportar los `team_*.jsonl` del bundle con `persistencia importar`.** Es una adaptación: pierde el vínculo
  con la adquisición y la verificación de su generación. Solo con decisión expresa.

## Requisitos

- Git Bash en esta máquina, o una shell POSIX en el servidor.
- Docker Compose v2.
- Los dos repositorios limpios en esas revisiones.

Configuración nueva **sin rutas de Windows**, en `rj-analyst/.env.habitual` (ignorado por Git). No se toca
`.env.docker`, que sigue sirviendo para la vuelta atrás.

```sh
COMPOSE_PROJECT_NAME=rj-analyst
RJ_BACKEND_CONTEXT=../api-real-jaen
RJ_BACKEND_IMAGE=rj-analyst-backend:2c4008b
RJ_FRONTEND_IMAGE=rj-analyst-frontend:3cd0df9
RJ_FRONTEND_BIND=127.0.0.1
RJ_FRONTEND_PORT=3200
RJ_STATE_VOLUME=rj-analyst-state
RJ_IMPORT_DIR=../datos-importados/docker/imports
```

En el servidor se usa el mismo archivo con sus rutas relativas o POSIX. `compose.yaml` no lleva ninguna ruta fija.

En Git Bash (Windows) hay que exportar `MSYS_NO_PATHCONV=1`: si no, convierte `/state/...` en rutas de Windows dentro
de los contenedores. La copia de la base Windows del paso 2 se lanza desde `../api-real-jaen` (`.venv`).

```sh
set -eu
export MSYS_NO_PATHCONV=1                        # solo en Git Bash
cd rj-analyst                                   # desde la carpeta que contiene los dos repositorios
dh()  { docker compose --env-file .env.habitual --file compose.yaml --file compose.dev.yaml "$@"; }   # habitual, en esta máquina
dl()  { docker compose --env-file .env.docker   --file compose.yaml "$@"; }   # instalación anterior (vuelta atrás)
IMP=../datos-importados/docker/imports
REAL=rj-real-group-real-9207547e-state
```

## Paso 0. Comprobaciones previas (solo lectura)

```sh
# Las imágenes llevan el código de 2c4008b / 3cd0df9: los commits posteriores (este documento, compose.dev.yaml,
# docker/tools) no tocan sus contextos de construcción.
git -C ../api-real-jaen merge-base --is-ancestor 2c4008b9fd2aa1809687f397252400c8b5b944e7 HEAD
git merge-base --is-ancestor 3cd0df99f472eb94aabddfbe4828f479a19e6aee HEAD
git -C ../api-real-jaen diff --quiet 2c4008b9fd2aa1809687f397252400c8b5b944e7 HEAD -- . ':!docs' ':!docker/tools'
git diff --quiet 3cd0df99f472eb94aabddfbe4828f479a19e6aee HEAD -- src public package.json package-lock.json tsconfig.json next.config.ts Dockerfile compose.yaml
test -z "$(git -C ../api-real-jaen status --porcelain)" && test -z "$(git status --porcelain)"
docker compose ls                              # ningún proyecto rj-analyst en marcha
! docker volume inspect rj-analyst-state >/dev/null 2>&1   # el volumen habitual aún no existe
dh config --quiet
```

**Digests lógicos.** Se usa `../api-real-jaen/docker/tools/digest_base.py`: lectura `immutable`, no toca ningún
archivo, y queda fuera de los contextos de las imágenes.
- Debe salir `737a5cc5…` en la base Windows y en `rj-analyst-local-state`.
- Debe salir `d881106f…` en la base de la prueba real.

Si cualquiera difiere, **se detiene**: la promoción ya no corresponde.

```sh
TOOLS="$(cd ../api-real-jaen/docker/tools && pwd)"
python -X utf8 "$TOOLS/digest_base.py" ../datos-importados/base/real-jaen.sqlite
docker run --rm --network none -v rj-analyst-local-state:/state:ro -v "$TOOLS:/t:ro" \
  --entrypoint python rj-analyst-backend:2c4008b /t/digest_base.py /state/real-jaen.sqlite
docker run --rm --network none -v $REAL:/state:ro -v "$TOOLS:/t:ro" \
  --entrypoint python rj-analyst-backend:2c4008b /t/digest_base.py /state/base.sqlite
```

**Bundle de J9 verificado de nuevo** con la imagen habitual, en solo lectura: productor aprobado, contexto,
generación, cobertura, procedencia y restricción.

```sh
docker run --rm --network none -v $REAL:/state:ro --entrypoint python rj-analyst-backend:2c4008b -c '
import glob,json
from persistencia.adquisicion import verificar_sellado, comprobar_restriccion
from persistencia.bundle import parse
f=glob.glob("/state/base.sqlite.actualizaciones/adquisiciones/*/")[0]
r=parse(open(f+"solicitud.json","rb").read()); body=open(f+"bundle.json","rb").read()
m,_=verificar_sellado(body,r["bundle"],parse(open(f+"inventory.json","rb").read()),(r["acquisition_id"],r["request_id"]))
comprobar_restriccion(m,dict(limits=dict(attempts=60,sends=70),detail_rounds=[9]))
print("ok",m["generation_id"],len(m["attempts"]))'
```

## Paso 1. Imágenes de la instalación habitual

Se construyen desde los repositorios limpios en esas revisiones. El backend reutiliza la capa `pip` en caché.

```sh
dh build backend frontend
docker image inspect --format '{{.Id}}' rj-analyst-backend:2c4008b rj-analyst-frontend:3cd0df9   # anotar
```

En el servidor no se construye nada: se usan `docker image save` / `docker image load` y `up --no-build --pull never`
(ver `docker.md`).

## Paso 2. Copias previas, sin modificar nada

Ningún servicio en marcha.

1. **Base Windows.** Copia consistente en su carpeta de copias:

   ```sh
   ../api-real-jaen/.venv/Scripts/python -m persistencia copiar --base ../datos-importados/base/real-jaen.sqlite --motivo antes-de-docker-habitual
   ```

2. **Volumen anterior.** Copia dentro del volumen y exportación al host:

   ```sh
   dl run --rm --no-deps backend -m persistencia copiar --base /state/real-jaen.sqlite --motivo antes-de-docker-habitual
   ```

   Para exportarla: `dl run --name rj-export --no-deps --entrypoint sleep -d backend 300`, después
   `docker cp rj-export:/state/copias/NOMBRE-EXACTO.sqlite "$IMP/anterior-docker-20261029.sqlite"` y por último
   `docker rm -f rj-export`.

3. **Base de la prueba real**, que será la promovida. Copia consistente con la imagen habitual (escribe solo en
   `$REAL/copias`) y exportación de la copia y de su procedencia:

   ```sh
   docker run --rm --network none --user 10001:10001 -v $REAL:/state --entrypoint python rj-analyst-backend:2c4008b \
     -B -m persistencia copiar --base /state/base.sqlite --motivo promocion-habitual
   docker run --rm --network none -v $REAL:/state:ro -v "$PWD/$IMP:/out" --entrypoint sh rj-analyst-backend:2c4008b -c '
     set -eu; c=$(ls -t /state/copias/*promocion-habitual*.sqlite | head -1); cp "$c" /out/promocion-j9-20261029.sqlite
     cd /state && tar -cf /out/procedencia-j9-20261029.tar base.sqlite.actualizaciones/adquisiciones \
       acquisition-reports.json real-check-report.json prepare-report.json snapshot.json ids-before.json'
   sha256sum "$IMP/promocion-j9-20261029.sqlite" "$IMP/procedencia-j9-20261029.tar" | tee "$IMP/promocion-j9-20261029.sha256"
   ```

4. **Copia independiente.** Copiar `promocion-j9-20261029.*` y la copia Windows también fuera de este disco.

## Paso 3. Volumen habitual y base promovida

```sh
docker volume create --label rj.installation=rj-analyst rj-analyst-state
docker volume inspect rj-analyst-state          # nombre y etiqueta
dh run --rm --no-deps --user 0:0 --cap-add CHOWN --entrypoint chown backend 10001:10001 /state
dh run --rm --no-deps backend -m scripts.initialize_snapshot /imports/promocion-j9-20261029.sqlite /state/real-jaen.sqlite
dh run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite
dh run --rm --no-deps --entrypoint sh backend -c 'set -eu; mkdir -p /state/procedencia/2026-10-29-j9 &&
  tar -xf /imports/procedencia-j9-20261029.tar -C /state/procedencia/2026-10-29-j9 && chmod -R a-w /state/procedencia/2026-10-29-j9'
```

`initialize_snapshot` rechaza un destino existente, exige journal DELETE y revisión 0004, y publica de forma
atómica. Al terminar, el digest de `/state/real-jaen.sqlite` debe ser `d881106f…` (`digest_base.py`, como en el
paso 0).

## Paso 4. Mantenimiento único

**Ya está aplicado en la base promovida** (`import_run` 4, con el código de `2c4008b`). No se repite: el paso 5
comprueba que el coordinador lo acredita. Si no lo acreditara, se detiene y se vuelve atrás; no se improvisa un
`reconstruir` sobre la base promovida.

Solo en la alternativa B (volumen desde la base Windows):

```sh
dh run --rm --no-deps backend -m persistencia copiar --base /state/real-jaen.sqlite --motivo antes-de-reconstruir
dh run --rm --no-deps backend -m persistencia reconstruir --base /state/real-jaen.sqlite --confirmar
dh run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite
```

## Paso 5. Verificación

Ensayado el 29-10 sobre una copia desechable en memoria (`tmpfs`): `initialize_snapshot`, `verificar` y el
coordinador aceptaron la base promovida, con 382 eventos y 380 vigentes.

Con los servicios aún detenidos, el coordinador acredita las reglas y abre su generación:

```sh
dh run --rm --no-deps --entrypoint python backend -B -c '
from persistencia.actualizacion import Coordinador
from persistencia.bundle import inventory
with Coordinador("/state/real-jaen.sqlite","/app/ambito.json",reserva=0) as c:
    g=c.capturar(); i=inventory(g)
    print("generacion",g.id,"partidos",len(i["events"]),"vigentes",sum(e["current"] for e in i["events"]))'
```

## Paso 6. Arranque

```sh
dh up -d --no-build --wait --wait-timeout 120
dh ps && dh logs --tail 100
curl -fsS http://127.0.0.1:3200/api/v1/source
curl -fsS http://127.0.0.1:3200/api/v1/matches/sofascore-match-16599973/observed | head -c 400
```

Revisión visual a 1440 y 390 px:
- Partidos (Real Jaén con J9 finalizada);
- Atlético Madrileño – Real Jaén;
- Equipos;
- Inicio.

Deben coincidir con la revisión del 29-10 sobre la copia.

La actualización desde la interfaz (capa `compose.acquisition.yaml`: volúmenes, perfil y secretos nuevos) es un paso
aparte, con su propia autorización.

## Vuelta atrás

Nada de lo anterior modifica la base Windows ni `rj-analyst-local-state`.

**Si falla antes de arrancar (pasos 0 a 5):**
- no arrancar;
- conservar `rj-analyst-state` para analizarlo; si se repite, con un volumen de otro nombre;
- la instalación anterior sigue disponible sin cambios.

**Si falla después de arrancar:**

```sh
dh down                                         # conserva rj-analyst-state
dl up -d --no-build --wait --wait-timeout 120   # instalación anterior (contenido = base Windows, sin J9)
```

**Recuperar la base habitual** desde sus copias (con el backend detenido):

```sh
dh stop backend
dh run --rm --no-deps backend -m persistencia restaurar --base /state/real-jaen.sqlite --copia /state/copias/NOMBRE-EXACTO.sqlite --confirmar
dh run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite
dh start backend
```

**Último recurso:** la base Windows, congelada, o `promocion-j9-20261029.sqlite` con su sha256, para crear otro
volumen con el paso 3.

## Traslado al servidor

Se trasladan:
- las imágenes con `docker image save/load`;
- `compose.yaml` y `.env.habitual` con rutas del servidor;
- `promocion-j9-20261029.sqlite` (o una copia nueva exportada de `rj-analyst-state`) y `procedencia-j9-20261029.tar`,
  en el directorio de importación, verificando sus sha256.

Allí se repiten los pasos 3, 5 y 6 sin construir nada, **sin `compose.dev.yaml`**: en el servidor el backend no
publica ningún puerto.

## Desarrollo contra la instalación habitual

En esta máquina, `dh` añade `compose.dev.yaml`. Esa capa publica la API de lectura del backend solo en
`127.0.0.1:8001`: la dirección está fijada en el archivo y no se puede publicar en otra interfaz.

- `.env.local` ya apunta a `http://127.0.0.1:8001`, así que `npm run dev` lee la instalación Docker sin cambiar nada.
- Mientras el backend Docker ocupa ese puerto, la API Windows no puede arrancar: la base congelada no se usa por
  descuido.
- Para volver a consultarla haría falta parar el backend Docker y arrancar su API a mano; no está previsto.

## Después de activar

- La base Windows queda congelada como archivo: no se vuelve a usar como instalación.
- La próxima actualización real, sin restricción, aplicará los diez cambios de calendario detectados el 29-10.
- Los volúmenes de pruebas se conservan hasta decidir su limpieza.

## Registro de la activación (29-10-2026)

Ejecutado según este procedimiento, con la promoción aprobada de la base de la prueba real. Su historial se conserva
tal cual: `import_run` 4 (`rebuild`, «acquisition test copy: explicit rule adoption») y 5 (importación de J9).

| Paso | Resultado |
|---|---|
| 0 | El código de las imágenes es el de `2c4008b` y `3cd0df9`; repositorios limpios; ningún servicio; `rj-analyst-state` no existía. Digests: base Windows y `rj-analyst-local-state` = `737a5cc5…`, base de la prueba = `d881106f…`. Bundle de J9 verificado de nuevo (generación `e227be73…`, 48 intentos). |
| 1 | `rj-analyst-backend:2c4008b` = `sha256:63bf24d4c7b8f85ef44c2193e98a09f1e35d9645b2a124282bf2b42818c5aa5e` (28 archivos de `/app` idénticos a la imagen de la prueba real); `rj-analyst-frontend:3cd0df9` = `sha256:9efa5891c6638c3b16cf644335a17529ddefed2b460c5b5fdc5c8043f29e1f84`. |
| 2 | Copias consistentes, detalladas debajo. |
| 3 | `rj-analyst-state` creado (etiqueta `rj.installation=rj-analyst`), base inicializada (revisión 0004, huella `4c41adc2…`), `verificar` correcto, digest `d881106f…`, procedencia archivada en `/state/procedencia/2026-10-29-j9` (solo lectura). |
| 4 | No se repite: la base promovida ya trae el mantenimiento. |
| 5 | El coordinador acredita las reglas: generación `19963c69-9326-4ab8-b62f-dcfd24726415`, 382 eventos, 380 vigentes. |
| 6 | Backend y frontend sanos, solo en `127.0.0.1`. |

**Copias del paso 2:**

| Origen | Copia | sha256 |
|---|---|---|
| Base Windows | `datos-importados/base/copias/real-jaen.20261029-111631-470923.antes-de-docker-habitual.sqlite` | `ebe99c6d…a970e5ca`, idéntica a la copia del 27-10 |
| `rj-analyst-local-state` | `/state/copias/real-jaen.20261029-111634-342317.antes-de-docker-habitual.sqlite`; exportada como `datos-importados/docker/imports/anterior-docker-20261029.sqlite` | `e7961d27…afa87172c` |
| Base de la prueba real | `/state/copias/base.20261029-111619-702038.promocion-habitual.sqlite` en `rj-real-group-real-9207547e-state`; exportada como `datos-importados/docker/imports/promocion-j9-20261029.sqlite` | `beb9666e…5382bdb1` |
| Procedencia de J9 | `datos-importados/docker/imports/procedencia-j9-20261029.tar` (32 entradas) | `b23738ca…18cba87` |

Las sumas completas están en `datos-importados/docker/imports/respaldos-20261029.sha256`.

**Comprobaciones posteriores:**
- J9: los diez partidos con su resultado y sus tres secciones a través de la API del dashboard, sin avisos de revisión.
  El cambio de hora de J12, fuera de alcance, sigue con su hora publicada.
- Navegación a 1440 y 390 px (Partidos, Atlético Madrileño – Real Jaén, CE Europa – Real Zaragoza, Equipos, Inicio):
  sin desbordamientos ni errores.
- Persistencia: tras `up --force-recreate`, contenedores nuevos con la misma base (`d881106f…`, 5 importaciones), J9
  intacta y la procedencia en el volumen.
- Desarrollo: `http://127.0.0.1:8001` sirve la instalación Docker.
- Instalaciones anteriores intactas:
  - base Windows: mismo sha256 (`5d2a3f16…`) y misma fecha (25-10), digest `737a5cc5…`. Solo cambió la fecha de su
    `-shm`, el índice temporal que SQLite actualiza al abrirla para la copia;
  - `rj-analyst-local-state` y la base de la prueba: mismos digests. Solo se añadió en cada uno su copia en `copias/`.
- El botón de actualización no se ha activado ni pulsado: no hubo consultas a SofaScore.

**Pendiente:**
- una copia de `respaldos-20261029.*` y de la copia Windows fuera de este disco;
- decidir cuándo activar la capa de adquisición (botón) y la actualización sin restricción.
