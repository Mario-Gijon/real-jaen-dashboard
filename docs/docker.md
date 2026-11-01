# Docker portable: instalación y operación

Compose coordina los dos repositorios Git desde la raíz del workspace. Cada servicio conserva su Dockerfile y sus dependencias; no requiere Python, Node, PowerShell, venv o node_modules en el anfitrión.

## Requisitos y estructura de entrega

Docker Engine con contenedores Linux y Docker Compose v2 o posterior con `up --wait`, acceso autorizado al motor, espacio de disco, acceso a los registros/npm/PyPI durante build, puerto libre, configuración y un snapshot SQLite real compatible **0004**. No se promete arranque sin datos. Los Dockerfiles fijan Python 3.14.4 y Node 22.22.2 por digest multi-arquitectura; no se fija `platform` ni CPU. La ejecución comprobada es linux/amd64; otras arquitecturas requieren su propia validación.

La estructura del workspace es:

```text
app-real-jaen/
  compose.yaml                 # orquestación de frontend y backend
  compose.dev.yaml             # overlay de desarrollo local
  compose.acquisition.yaml     # overlay optativo; no se activa con el Compose base
  .env.docker                  # configuración local, fuera de los repositorios
  dashboard/                   # repositorio Next.js, Dockerfiles de producción y desarrollo
  api/                          # repositorio Python, Dockerfile
  deployment/
    imports/                    # snapshots finalizados y entradas; nunca la base activa
    secrets/                    # credenciales locales fuera de Git
```

Los dos repositorios deben corresponder a las revisiones acordadas. Se pueden exportar con `git archive`; no incluir `.env.local`, entornos, builds, capturas o datos sintéticos externos. Los contextos Docker son `./dashboard` y `./api`, con listas explícitas de archivos permitidos. En la instalación base no se montan carpetas de código, venv ni node_modules. Solo el backend monta datos persistentes y entradas de solo lectura; el frontend no tiene acceso a SQLite. El servicio de desarrollo usa una imagen y artefactos Next separados; monta únicamente `dashboard/src` y `dashboard/public` en modo de solo lectura. La carpeta superior no es un tercer repositorio Git, así que los archivos Compose centrales quedan fuera de ambos repositorios.

Desde la raíz `app-real-jaen/`, en una shell POSIX Linux:

```sh
set -eu
mkdir -p deployment/imports deployment/secrets/session
test ! -e .env.docker  # si existe, revisar la configuración en vez de sobrescribirla
cp dashboard/.env.docker.example .env.docker
# Editar .env.docker para esta instalación; contiene rutas/configuración, nunca secretos.
docker version
docker compose version
dc() { docker compose --env-file .env.docker -f compose.yaml "$@"; }
dc config --quiet
dc build
```

La configuración local `.env.docker` se mantiene en la raíz del workspace. La plantilla versionada está en `dashboard/.env.docker.example`. La función `dc` se usa en los bloques siguientes desde esa misma raíz y shell con `set -eu`. No continuar tras un error; no arrancar backend después de un mantenimiento fallido. El script PowerShell de pruebas es opcional, no forma parte de la instalación.

Variables en `dashboard/.env.docker.example`:

| Variable | Propósito |
|---|---|
| COMPOSE_PROJECT_NAME | Identidad de la instalación; separar producción y pruebas |
| RJ_BACKEND_CONTEXT | Contexto relativo al Compose; por defecto `./api` |
| RJ_BACKEND_IMAGE / RJ_FRONTEND_IMAGE | Nombres y etiquetas explícitas de las imágenes; se pueden versionar sin modificar Dockerfiles |
| RJ_FRONTEND_BIND | Interfaz publicada; 127.0.0.1 por defecto, configurable para proxy del servidor |
| RJ_FRONTEND_PORT | Puerto host del frontend; 3200 por defecto |
| RJ_STATE_VOLUME | Volumen externo elegido y creado expresamente; base, coordinación, WAL/SHM y copias |
| RJ_IMPORT_DIR | Directorio existente relativo a Compose o absoluto del servidor; `./deployment/imports` por defecto, solo lectura |
| RJ_ACCESS_PASSWORD_FILE / RJ_SESSION_SECRET_DIR | Rutas a los archivos locales de autenticación, bajo `./deployment/secrets` por defecto |

Next usa siempre `DATA_MODE=real` y `LOCAL_DATA_API_URL=http://backend:8001`. El navegador consulta el mismo frontend por `/api/v1`. El backend no publica ningún puerto al host. Usuarios internos: backend UID/GID 10001, frontend node UID/GID 1000, sin depender de usuarios homónimos del servidor. Sin capabilities y con no-new-privileges en ejecución normal.
`compose.dev.yaml` es un overlay optativo. Conserva la publicación de la API en `127.0.0.1:8001` para Next ejecutado en el anfitrión y añade el perfil `hot-reload` para Next dentro de un contenedor separado. Los servicios de la instalación base declaran `restart: "no"`; los contenedores actuales ya tienen esa política y esta configuración la conservará al crear contenedores nuevos. `compose.acquisition.yaml` es optativo; añade control y adquisición SofaScore y requiere volúmenes y archivos secretos propios. No forma parte del arranque base. Los Compose de fixture/pruebas de `api/docker/acquisition/compose.*.yaml` son stacks independientes; se conservan junto a sus pruebas y no se combinan con este Compose de instalación.

## Desarrollo local con Hot Reload

Este flujo funciona con Docker Compose desde la raíz del workspace. El servicio ejecuta `next dev` dentro de un contenedor separado y utiliza bind mounts convencionales de solo lectura para `dashboard/src` y `dashboard/public`. Las ediciones locales de React, TypeScript y CSS llegan directamente al contenedor; Next aplica Fast Refresh sin un proceso adicional de Compose Watch ni reconstruir la imagen.

Comprueba que el backend existente está saludable y que el puerto 3201 está libre. Desde la raíz del workspace, arranca solo el frontend de desarrollo:

```sh
docker compose --env-file .env.docker -f compose.yaml -f compose.dev.yaml --profile hot-reload up -d --no-deps frontend-dev
```

La primera vez, o si cambian `package.json` o `package-lock.json`, añade `--build` a `up` para incorporar las dependencias. Los cambios habituales bajo `src/` o `public/` no necesitan reconstrucción ni recreación. Abre `http://127.0.0.1:3201`. La instalación de producción en `http://127.0.0.1:3200` conserva su contenedor. `--no-deps` evita reconciliar el backend y el frontend de producción.

`node_modules` permanece dentro de la imagen de desarrollo y `.next` en el volumen Docker propio `frontend-dev-next`; los bind mounts incluyen solo código fuente y recursos públicos. SQLite y las carpetas del backend no se montan en el frontend. La autenticación conserva los dos montajes individuales de credenciales bajo `/run/secrets`, ambos de solo lectura; esos archivos no forman parte de los bind mounts de código. `next-env.d.ts` y otros artefactos generados quedan en el contenedor. Los cambios de `next.config.ts`, `tsconfig.json` o dependencias requieren recrear el servicio; los archivos de configuración no forman parte de los bind mounts. La opción `allowedDevOrigins` permite el acceso local por loopback y Next solo la utiliza en desarrollo.

El servicio usa `DATA_MODE=real` y consulta la API deportiva existente por la red Docker. Recibe únicamente las credenciales de sesión necesarias para el acceso; `RJ_CONTROL_SECRET_FILE` permanece ausente, así que las operaciones de actualización están deshabilitadas. No arranca SofaScore.

Para detener únicamente el frontend de desarrollo, conservando la imagen y el volumen `.next`:

```sh
docker compose --env-file .env.docker -f compose.yaml -f compose.dev.yaml --profile hot-reload stop frontend-dev
```

No uses `down` sin seleccionar el servicio: el Compose base comparte la identidad de proyecto de la instalación.

## Inicio manual de la instalación

Los contenedores existentes no arrancan automáticamente tras reiniciar el ordenador. Desde la raíz del workspace, cuando quieras iniciar manualmente frontend y backend existentes sin reconstruir ni recrear sus contenedores:

```sh
dc() { docker compose --env-file .env.docker -f compose.yaml "$@"; }
dc up -d --no-build --no-recreate --wait --wait-timeout 120
dc ps
```

Este comando no inicia SofaScore ni el perfil de Hot Reload. Para apagar solo el entorno de desarrollo, usa `docker compose --env-file .env.docker -f compose.yaml -f compose.dev.yaml --profile hot-reload stop frontend-dev`; no detengas ni recrees el backend como parte del flujo Hot Reload.

## 1. Arrancar con almacenamiento existente y base compatible

No inicializar ni crear otro volumen. Configurar RJ_STATE_VOLUME con el nombre exacto del
volumen conocido y comprobar su identidad/propietario antes de montarlo. `/state/real-jaen.sqlite`
debe existir, ser 0004, íntegra y legible/escribible por UID/GID 10001. RJ_IMPORT_DIR debe
existir aunque no haya entradas nuevas. No modificar permisos de un volumen desconocido.

```sh
# Sustituir el nombre por el configurado y comprobar identidad, no elegir por antigüedad.
docker volume inspect rj-analyst-local-state
dc run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite
dc up -d --no-build --wait --wait-timeout 120
dc ps
dc logs --tail 100
```

La verificación exige API detenida para respetar el bloqueo. No usar este bloque sobre
una instalación ya activa. Una base ausente o incompatible es un error: no se crea una
base vacía ni se migra automáticamente al arrancar. Backend healthcheck usa `/health`
sin cambiar el contrato; frontend comprueba su fuente real y el health interno. Compose
espera backend saludable antes de arrancar frontend; unhealthy por sí solo no reinicia.

## 2. Primera instalación: crear almacenamiento e importar snapshot

El snapshot inicial se produce con `persistencia copiar` / `sqlite.copia_consistente`,
con API de origen detenida y bloqueo reservado, nunca copiando un SQLite WAL a mano.
Verificar integridad, claves foráneas, revisión 0004 y equivalencia lógica con el origen
bajo exclusividad. Si es antiguo, migrar/verificar solo una copia aparte y producir otra
copia consistente finalizada. El snapshot debe tener journal DELETE y no WAL/SHM/journal.
Transferir ese archivo terminado a `deployment/imports/snapshot.sqlite`, verificar su SHA256
tras la transferencia y hacer que UID 10001 pueda leerlo y atravesar sus directorios.
No debe haber escritores sobre ese archivo de entrada; se monta RO.

Ejemplo para el nombre de volumen del archivo de ejemplo; si se cambia RJ_STATE_VOLUME,
cambiar también estas órdenes. Se rechaza cualquier volumen existente, aunque parezca vacío:

```sh
vol=rj-analyst-local-state
existing=$(docker volume ls --format '{{.Name}}')
if printf '%s\n' "$existing" | grep -Fxq "$vol"; then
  echo "Volumen existente: revisar identidad, no inicializar" >&2
  exit 1
fi
docker volume create --label rj.installation=rj-analyst-local "$vol"
docker volume inspect "$vol"  # comprobar nombre y etiqueta antes de continuar
dc run --rm --no-deps --user 0:0 --cap-add CHOWN --entrypoint chown backend 10001:10001 /state
dc run --rm --no-deps backend -m scripts.initialize_snapshot /imports/snapshot.sqlite /state/real-jaen.sqlite
dc run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite
# Opcional: pruebas destructivas solo sobre bases privadas creadas en ese volumen.
dc run --rm --no-deps backend -m scripts.check_container --base /state/real-jaen.sqlite
```

Solo la preparación de permisos usa root y CHOWN; el inicializador trabaja como 10001.
Rechaza destino o diarios existentes, comprueba revisión y contenido, prepara/verifica y
publica atómicamente. No hay inicialización implícita ni sobrescritura. La instalación queda
**preparada, sin servicios activos**. Para activarla expresamente, usar el arranque del apartado 1.

El volumen externo es almacenamiento configurable persistente. SQLite, `.lock`, WAL/SHM y
`copias/` viven juntos en /state, con la misma ruta en API y mantenimiento. Rehacer contenedores
no elimina datos; `down` conserva el volumen externo. No usar prune ni borrar volúmenes ajenos.
El volumen local Linux/ext4 es la opción comprobada; un driver de red u otro almacenamiento
requiere volver a validar locking, WAL y permisos. Las copias en el volumen sobreviven al
contenedor, pero no a la pérdida del disco/VM: exportarlas también a almacenamiento independiente.

## Operación y mantenimiento Linux

```sh
dc stop                  # parada, conserva datos
dc down                  # retira contenedores/red del proyecto, conserva volumen externo
dc logs --tail 100 -f
```

Siempre **detener backend → una operación → verificar → arrancar**. No recarga en caliente
ni botón Actualizar. La API sirve una instantánea y mantiene un bloqueo toda su ejecución.
El bloqueo cooperativo coordina nuestras herramientas, no cualquier programa SQLite externo.
El kernel libera el bloqueo si muere el proceso; no borrar `.lock`, WAL ni SHM.

```sh
set -eu
dc stop backend
dc run --rm --no-deps backend -m persistencia migrar --base /state/real-jaen.sqlite
dc run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite
dc start backend
```

En lugar de migrar elegir **una** orden, siempre con la misma ruta y API detenida:

```sh
dc run --rm --no-deps backend -m persistencia importar --base /state/real-jaen.sqlite --exportacion 2841=/imports/nueva-exportacion.jsonl
dc run --rm --no-deps backend -m persistencia reconstruir --base /state/real-jaen.sqlite --confirmar
dc run --rm --no-deps backend -m persistencia sustituciones --base /state/real-jaen.sqlite --archivo /imports/sustituciones.json --ambito /app/ambito.json
```

Estos comandos conservan copia previa. Verificar antes de arrancar. Ante fallo, revisar el
resultado y no ejecutar la siguiente operación. `run --no-deps` usa la misma imagen, usuario,
volumen y ruta, sin arrancar servicios por dependencia. ENTRYPOINT backend: `python -B`.
El ámbito se incluye en la imagen; modificarlo exige reconstruir.

## Copia y recuperación Linux

**Instalación completa** (base, registros de actualización, procedencia y trabajos de adquisición juntos):
`dashboard/scripts/respaldo-instalacion.sh` y `dashboard/scripts/restaurar-instalacion.sh`, descritos en
[despliegue-servidor.md](despliegue-servidor.md). Lo siguiente cubre solo la base.

Con backend detenido:

```sh
dc run --rm --no-deps backend -m persistencia copiar --base /state/real-jaen.sqlite --motivo antes-mantenimiento
```

Anotar la ruta exacta informada. Para exportarla sin arrancar API, crear un contenedor efímero
con `dc run --name rj-export --no-deps --entrypoint sleep -d backend 300`, usar `docker cp
rj-export:/state/copias/NOMBRE-EXACTO.sqlite deployment/imports/copia-exportada.sqlite` y
retirar solo ese contenedor con `docker rm -f rj-export`. Elegir un nombre libre/exclusivo,
verificar la copia exportada y su SHA256; no copiar el principal activo. El backup finalizado
es un único archivo DELETE. Este proceso no requiere montar el volumen en el frontend.

Para recuperar una copia compatible, backend detenido y nombre exacto elegido expresamente:

```sh
set -eu
dc stop backend
dc run --rm --no-deps backend -m persistencia restaurar --base /state/real-jaen.sqlite --copia /state/copias/NOMBRE-EXACTO.sqlite --confirmar
dc run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite
dc start backend
```

Una copia exportada al host se recupera usando `/imports/NOMBRE-EXACTO.sqlite`, sin montarla
como base activa. Restaurar prepara y verifica antes de reemplazar, integra WAL bajo
exclusividad y conserva copia anterior. No borrar diarios a mano. Volver a revisión 0002
requiere revisión explícita y código fase 3 compatible (`c56dc83`), no esta imagen 0004.

## Acceso

Toda la aplicación (páginas, rutas de datos y de actualización) exige una **sesión**, que se abre en `/acceso` con
una **contraseña compartida**. La comprueba `src/proxy.ts` antes de cada petición; las rutas de actualización la
vuelven a comprobar.

**Sesión:**
- cookie `rj_session`, firmada con HMAC-SHA256 y válida 90 días, con `HttpOnly`, `SameSite=Strict`, `Path=/` y
  `Secure` cuando la petición llega por HTTPS (o con `X-Forwarded-Proto: https` de un proxy);
- el navegador nunca guarda la contraseña: solo esa cookie;
- sobrevive a reinicios y recreaciones de los contenedores, porque la clave de firma sale de un archivo persistente,
  no del proceso.

**Rutas:** sin sesión, una página lleva a `/acceso?next=…` y una ruta `/api` responde `401`. Un cambio de estado
desde otro origen se rechaza con `403`.

**Configuración (frontend):** dos secretos fuera del código, de las imágenes, de Git y de `.env.docker`, legibles
por UID 1000.

| Variable | Contenido |
|---|---|
| `RJ_ACCESS_PASSWORD_FILE` | Archivo con la contraseña compartida (12 a 256 caracteres ASCII imprimibles) |
| `RJ_SESSION_SECRET_DIR` | Directorio con el archivo `session-secret` (32 a 256 caracteres aleatorios), que firma las sesiones |

Se monta el directorio, no el archivo, para que una rotación se vea al momento. Sin ellos, con datos reales, la
aplicación no sirve nada: `503`, y el healthcheck del frontend falla. La demostración (`DATA_MODE=demo`) queda
abierta salvo que se configuren.

```sh
umask 077; mkdir -p deployment/secrets/session
# La contraseña: se elige, se escribe sin salto de línea final y se comunica por un canal seguro.
head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > deployment/secrets/session/session-secret
```

**Cerrar sesión:** el botón de la cabecera borra la cookie de ese navegador.

**Cambiar la contraseña:** reescribir `access-password` en su sitio; el frontend la ve al momento. En Windows,
`dashboard/scripts/cambiar-contrasena-acceso.ps1` la pide de forma oculta, guarda la anterior y comprueba la nueva.

**Revocar todas las sesiones:** rotar el secreto en su sitio, sin `mv` ni reinicio. Cambiar la contraseña también
las revoca.

```sh
head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > deployment/secrets/session/session-secret
```

**Límite de intentos:** 5 fallos en 15 minutos bloquean nuevos intentos (`429`) hasta que pase la ventana.
- Una cabecera como `X-Forwarded-For` la puede fijar cualquier cliente, así que no se usa: por defecto el límite es
  común a todos.
- Detrás de un proxy que sobrescriba una cabecera con la dirección del cliente, `RJ_TRUSTED_CLIENT_IP_HEADER`
  (p. ej. `x-real-ip`) lo hace por dirección.
- Los intentos se cuentan en memoria y un reinicio los olvida.

**Limitaciones:**
- una contraseña compartida, sin identidades ni auditoría por persona;
- cerrar sesión no invalida una cookie ya copiada: para eso se revocan todas;
- la comprobación de origen compara `Origin` con `Host`: detrás de un proxy hay que conservar `Host`;
- con el límite común, alguien con acceso a la página puede bloquear los intentos de los demás durante 15 minutos.

Antes de exponerla fuera de la máquina hacen falta HTTPS y un proxy que fije las cabeceras y elimine las del
cliente.

## Proxy inverso y entrega sin fuentes en el servidor

Un proxy del host puede usar 127.0.0.1:3200. Para otra interfaz, configurar RJ_FRONTEND_BIND
y RJ_FRONTEND_PORT sin cambiar imágenes; publicar 0.0.0.0 exige que el administrador configure
acceso/TLS/firewall. No se añade proxy ni autenticación aquí. Para un proxy Docker existente,
añadir un override que conecte frontend a su red externa y usar frontend:3000; conservar también
la red interna con backend. Esa integración depende del proxy del grupo y no está validada.

Alternativamente construir las dos imágenes en la máquina de entrega con etiquetas de versión
explícitas RJ_BACKEND_IMAGE/RJ_FRONTEND_IMAGE; usar `docker image save` / `docker image load`
o el registro autorizado. En el servidor bastan compose.yaml, .env.docker, datos y directorio
imports: **no ejecutar build**, usar `up --no-build --pull never` y las mismas etiquetas cargadas.
`run` tampoco construye automáticamente; exigir imágenes ya cargadas. Las imágenes exportadas
deben corresponder a la arquitectura destino; los digests base multi-arquitectura no convierten
una imagen construida para amd64 en arm64. No se han publicado imágenes ni credenciales.

## Adquisición (overlay opcional)

`compose.acquisition.yaml` añade el servicio interno `acquisition`, que ejecuta la receta fija de SofaScore
(calendario de la ronda 1 y partido 16599363) con el flujo normal del scraper y su navegador. Contrato, garantías y
pruebas: `../../api/docs/contrato-adquisicion-interno.md`; estado y ejecuciones reales:
`../../api/docs/adquisicion-sofascore.md`. Con el overlay, el backend arranca en **modo control**
(`control.py`): sirve las mismas rutas desde el coordinador y ofrece la actualización a la sesión de acceso
desde la interfaz (apartado «Actualización desde la interfaz»). La orden del backend con la API detenida sigue
disponible. Sin el overlay, la instalación de dos servicios no cambia.

**Alcance real.**

- **Por defecto (`RJ_UPDATE_RECIPE` sin definir):** la receta del Grupo 2, botón «Actualizar Grupo 2».
  - Consulta los resultados que faltan, los aplazados, los cambios de calendario (próximos y, por turnos, lejanos)
    y las correcciones de las últimas 72 h.
  - Hasta 120 envíos y 900 s por pulsación.
  - Publica con cobertura parcial: lo que no se obtiene queda pendiente y conserva lo anterior; la interfaz dice
    «Actualización completada con pendientes».
  - **Probada una vez contra SofaScore** el 29-10-2026, sobre una copia aislada y con los detalles de la jornada 9
    (`../../api/docs/prueba-real-grupo2.md`). Aún no se ha usado sobre la base activa.
- **`RJ_UPDATE_RECIPE=sofascore-pilot-16599363-v1`:** solo el piloto (calendario de la jornada 1 y un partido).

Otro alcance exige otra receta revisada y su huella aprobada en `../../api/productores-adquisicion.json`.
Detalle: `../../api/docs/diseno-receta-grupo2.md`.

Requisitos además de los anteriores: la imagen base del scraper auditada (`RJ_SCRAPER_RUNTIME_IMAGE`, construida con
`../../api/docker/scraper`; la imagen de adquisición se construye sin red sobre ella), dos volúmenes externos
nuevos y vacíos, y un archivo secreto de 32 a 256 caracteres ASCII legible por UID 10001, fuera del código, de las
imágenes y de `.env.docker`. Variables en `.env.docker.example` (bloque comentado). La política seccomp de cinco
reglas solo se aplica a `acquisition` y a su administración; el backend conserva la predeterminada.

```sh
set -eu
dca() { docker compose --env-file .env.docker -f compose.yaml -f compose.acquisition.yaml "$@"; }
for vol in rj-analyst-local-acquisition-profiles rj-analyst-local-acquisition-jobs; do
  if docker volume ls --format '{{.Name}}' | grep -Fxq "$vol"; then echo "Volumen existente: $vol" >&2; exit 1; fi
  docker volume create --label rj.installation=rj-analyst-local "$vol"
done
dca config --quiet
dca build acquisition
dca --profile admin run --rm --no-deps acquisition-admin initialize-profile --confirm-new-profile
dca up -d --no-build --wait --wait-timeout 120 acquisition
```

Antes del primer uso sobre la base activa, una sola vez: el coordinador exige que la huella de reglas registrada en
la base coincida con la del código, y la base actual se cargó antes de que existiera esa huella y con reglas
anteriores. Hay que hacer el mantenimiento explícito (copia, `reconstruir --confirmar` y verificación, con la API
detenida). Las actualizaciones siguientes no lo necesitan; solo vuelve a hacer falta al desplegar código nuevo de
persistencia o de la API (motivos en `../../api/docs/contrato-adquisicion-interno.md`, «Activación y
compatibilidad»). Con el overlay, el backend en modo control **no arranca** hasta hacer ese mantenimiento: el
coordinador rechaza la base, y la generación anterior tampoco se sirve. Sin interfaz, cada actualización es una
operación de mantenimiento:

```sh
set -eu
solicitud=$(cat /proc/sys/kernel/random/uuid)   # anotar: repetirla reanuda la misma solicitud
dca stop backend
dca run --rm --no-deps backend -m persistencia adquirir --base /state/real-jaen.sqlite \
  --ambito /app/ambito.json --solicitud "$solicitud"
dca run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite
dca start backend
```

La orden imprime la generación publicada. Si falla, no se publica nada y la generación anterior sigue vigente.
Repetir la **misma** solicitud reutiliza su trabajo y su bundle verificado sin volver a consultar a SofaScore y
reintenta solo la importación, mientras la generación no haya cambiado. Una adquisición fallida, cancelada o
interrumpida no importa nada; para consultar de nuevo hace falta una solicitud nueva. Tras un 403 o un 429 el
servicio queda bloqueado para nuevas consultas hasta la revisión del operador. Si el servicio se detiene durante
un trabajo, el perfil queda pendiente de recuperación y el servicio no arranca hasta recuperarlo a mano:

```sh
dca stop acquisition
dca --profile admin run --rm --no-deps acquisition-admin recover-profile \
  --confirm-service-stopped --confirm-no-external-users
dca up -d --no-build --wait acquisition
```

### Actualización desde la interfaz

Contrato: [contrato-actualizaciones.md](contrato-actualizaciones.md). Requiere, además, el secreto interno
`RJ_CONTROL_SECRET_FILE` (mismos requisitos), compartido solo por el servidor de Next y el backend y legible por UID
10001 (backend) y 1000 (frontend). Sin él, en demostración o sin el overlay, la actualización no existe: la interfaz
no muestra el control y `/api/v1/updates` responde `409 UPDATE_UNAVAILABLE`. Ningún secreto llega al navegador.
No hay clave de operador: la misma sesión de acceso (apartado «Acceso») permite consultar y actualizar.

```sh
set -eu
dca up -d --no-build --wait --wait-timeout 120   # backend en modo control, frontend y acquisition
```

Con la sesión abierta, la cabecera muestra «Actualizar Grupo 2» (o «Actualizar piloto», según la receta) y el
estado del trabajo. Ese estado enlaza con `/operador`, que da el alcance, la última publicación, la fase
(«Consultando datos», «Comprobando los datos recibidos», «Publicando») y el resultado.

- **Un único trabajo activo.** Repetir la pulsación, otra pestaña u otra persona recuperan el mismo trabajo.
- **Cancelar** solo mientras se consulta; nunca durante la comprobación o la publicación.
- **Fallos.** Cualquier fallo, cancelación o reinicio deja publicada la última generación válida. Si falló solo
  la publicación, la siguiente pulsación la reintenta con los datos ya verificados, sin volver a consultar.
- **Reinicio del backend durante un trabajo.** El trabajo queda interrumpido y no se reanuda. Si la publicación ya
  se había confirmado, queda como publicada.
- **Tras publicar,** la interfaz ofrece «Recargar datos».

Las limitaciones de autorización son las de la sesión de acceso (apartado «Acceso»).

**Red y observación (no es un registro exhaustivo).** El backend habla con `acquisition` solo por
`acquisition-control`, interna y sin salida. `acquisition` es el único servicio en `acquisition-egress`, con salida a
Internet: Docker no la filtra por dominio y no hay proxy, así que desde ese contenedor es alcanzable cualquier
destino, también el anfitrión y la red local. El código limita lo que inicia (curl y `fetch()` a las rutas
permitidas de SofaScore; el navegador a `/robots.txt`, el captcha y el challenge de Cloudflare), pero Chromium abre
conexiones de fondo, por ejemplo a Google, que no se pueden impedir. El informe de cada trabajo
(`/internal/v1/acquisitions/{id}/report`) registra los envíos del adaptador, las peticiones de las páginas y una
muestra de los sockets del contenedor cada 0,2 s: IP y puerto, sin nombres DNS ni contenido. Puede perder
conexiones que el servidor cierre en menos de ese intervalo y no ve UDP sin conectar.

Comprobado el 28-10-2026 en un proyecto desechable con volúmenes propios (retirados después): configuración,
construcción sin red, inicialización del perfil, servicio healthy con el proveedor real configurado y sin lanzar
trabajos, montajes limitados a perfil, trabajos y secreto, redes de control y salida, y autenticación desde el
backend por la red de control (404 con el secreto, 401 sin él). El recorrido completo hasta la publicación se
validó con la pila de prueba aislada de `../../api/docker/acquisition`, sin salida a Internet.

La actualización desde la interfaz se validó también el 28-10-2026 con
`../../api/docker/acquisition/test_updates.py`. La pila es temporal, con el proveedor local; la base es una
copia aislada de una copia inactiva y el backend corre en modo control con Next de producción. Comprobado:

- cancelación sin cambios en los datos;
- tres pulsaciones que producen un solo inicio y una publicación;
- SIGKILL del backend durante la consulta: el trabajo queda interrumpido, con la misma generación y los mismos
  datos;
- rechazo del proveedor: fallido, sin cambios;
- reinicio con el estado conservado;
- cookie `HttpOnly` y `SameSite=Strict`, y ningún secreto en respuestas, logs del backend ni del servidor de Next.

El overlay real con el modo control **no** se ha arrancado sobre la base activa.

## Validación y límites

La prueba anterior en Docker Desktop Linux pasó build, salud/DNS, UID, ext4, bloqueo entre
procesos/symlinks, rechazo con API activa, salida normal/SIGKILL, rollback WAL, restauración
fallida y persistencia al recrear. También se abrieron 13 capturas reales a 1440/390 px,
sin regresiones visibles. Esto no acredita el servidor del grupo, otra CPU, un driver de
almacenamiento distinto ni caída completa de VM/host. El informe de traslado de esta entrega
se registra tras ejecutar la prueba en otra ruta; no necesita artifacts ni TEMP para operar.

### Prueba de traslado realizada el 25-10-2026

Se exportaron ambos repositorios a otra carpeta, sin .git, .env.local, node_modules o venv,
y se trasladaron a `/delivery` en un volumen Linux exclusivo. Un cliente Docker con shell
POSIX, sin Python/Node/PowerShell instalados, ejecutó build y operación. El snapshot real
finalizado se suministró por separado como dato inicial y su SHA256 coincidió tras el traslado.
El montaje del directorio de entrada se configuró con su ruta en el host Linux del motor;
no se montó ningún directorio de código en los servicios de producción.

| Comprobación | Resultado propio |
|---|---|
| Primera instalación | Base ausente rechazada; volumen nuevo etiquetado; permisos, inicialización explícita 0004 y verificación correctos |
| Fuentes en otra ruta | Ambos builds correctos desde contextos relativos; servicios healthy; fuente real y DNS interno correctos |
| Linux y almacenamiento | UID 10001/1000, ext4, bloqueo/symlinks, rechazo con API activa, salida/SIGKILL, WAL, mantenimiento y fallo de restauración correctos |
| Volumen existente | Verificado y reutilizado tras retirar los primeros contenedores, sin reinicializar ni perder datos |
| Entrega solo de imágenes | Otra carpeta con solo Compose/configuración, contexto backend inexistente y sin fuentes frontend: `up --no-build --pull never` correcto y fuente real |
| Recuperación POSIX | Copia, restauración CLI, verificación y exportación con contenedor efímero correctas; contenido lógico conservado |
| Exposición | Puerto de prueba exclusivo 59576 en loopback; configuración alternativa 0.0.0.0 validada sin publicarla |

Proyecto `rj-portable-6e788d0151`; imágenes propias con etiqueta v1; volúmenes exclusivos
`rj-portable-6e788d0151-state` y `rj-portable-6e788d0151-delivery`, ambos etiquetados.
Contenedores y red de prueba retirados; volúmenes conservados para inspección. Evidencias
fuera de Git en la carpeta de prueba `rj-portable-6e788d0151` del anfitrión; no son requisitos
de instalación. Ninguna operación se realizó sobre la instalación definitiva ni la base activa.
No se repitió la revisión visual: no hay cambios de UI; se verificaron salud y fuente HTTP real.
Esta prueba ejecuta Linux en Docker Desktop; sigue pendiente la integración en el servidor
real del grupo y su proxy. No se ensayó transferencia a otro daemon ni otra arquitectura.
