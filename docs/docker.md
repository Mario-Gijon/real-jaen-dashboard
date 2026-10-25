# Producción local con Docker Compose

Preparación y cambio explícito de la instalación Windows: [cambio-docker.md](cambio-docker.md).

Esta configuración coordina **dos repositorios**, sin fusionarlos. `compose.yaml` vive en
`rj-analyst`: construye este frontend y el backend desde `RJ_BACKEND_CONTEXT` (por defecto
el hermano `../api-real-jaen`). Cada repositorio mantiene su Dockerfile y su contexto
permitido. El frontend no conoce SQLite ni monta su volumen.

## Qué se ejecuta

- Backend: Python **3.14.4**, dependencias exactas de `requirements-sql.txt`, el servidor
  HTTP existente y `--host 0.0.0.0`. La ejecución Windows conserva por defecto `127.0.0.1`.
  No se añade Gunicorn, proxy, worker ni otra base de datos. No publica puertos al host.
- Frontend: Node **22.22.2**, `npm ci` con el lockfile, build Next de producción con webpack
  y salida standalone. Ejecuta `node server.js`, sin HMR, bind mounts de código ni servidor
  de desarrollo. La configuración standalone solo se prepara dentro del build; no se
  modifica `next.config.ts` ni se reinicia un `next dev` del host.
- Ambas bases Debian bookworm-slim están fijadas por versión **y digest multi-arquitectura**
  en sus Dockerfiles. Actualizarlas deliberadamente implica volver a construir y validar.
- Next usa `DATA_MODE=real` explícito y `LOCAL_DATA_API_URL=http://backend:8001` en ejecución.
  Las variables son del servidor, no `NEXT_PUBLIC_*`. El navegador sigue consultando
  exclusivamente `/api/v1` en su frontend. No hay CORS, rutas ni contratos nuevos.
- No se copian `.env.local`, `.git`, SQLite, exportaciones o dependencias del host a los
  contextos. El frontend tampoco incorpora los JSON sintéticos: esta pila es para datos reales.
- Usuarios de ejecución: backend **10001:10001**, frontend **node (1000:1000)**. Se eliminan
  capabilities y se usa `no-new-privileges`. Solo la preparación explícita de permisos usa root
  temporalmente, con `CHOWN` como única capability adicional.
- El frontend se publica en **127.0.0.1:3200** por defecto. El backend solo está en la red de
  Compose. Su healthcheck reutiliza `/health`; el frontend comprueba su `/api/v1/source`
  real y el `/health` interno del backend. `depends_on: service_healthy` ordena el arranque.
  No implica recarga de datos ni mantenimiento automático. `unless-stopped` respeta la parada
  explícita durante mantenimiento; un contenedor unhealthy por sí solo no se reinicia.

## Datos y almacenamiento

Se elige un **volumen externo con nombre**, no un bind mount del directorio Windows activo.
Dentro de todos los procesos del backend, la base es siempre **`/state/real-jaen.sqlite`**.
En el mismo volumen viven `.lock`, WAL/SHM/journal y `copias/`. El frontend no monta nada
de ello. Eliminar/recrear contenedores o hacer `compose down` no elimina un volumen externo.
No usar limpiezas globales. Las copias en el volumen sobreviven a los contenedores, pero no
a la pérdida de la VM de Docker Desktop: exportar copias consistentes también al host.
La base instalada en el volumen es una copia independiente: las importaciones posteriores
de la instalación Windows no actualizan Docker. Elegir expresamente qué instalación se
mantiene al activar el despliegue; no hay sincronización automática entre ambas.

En Docker Desktop el volumen vive en el sistema de archivos Linux de su VM. Esto evita
compartir la base activa con Windows/NTFS. No se presupone que flock o WAL funcionen solo
porque sea Linux: `scripts.check_container` debe comprobarlos **sobre `/state`**, con el
usuario normal, y registrar su montaje y versión SQLite. Un bind mount de SQLite, un
sistema de archivos de red o un cambio de almacenamiento exige repetir esas comprobaciones.
No se garantiza coordinación entre Windows y Linux sobre una misma base ni entre hosts.

El bloqueo es **cooperativo**: coordina nuestra API y herramientas, no cualquier programa
SQLite externo. Una API carga una instantánea y conserva el bloqueo hasta salir. Importar,
reconstruir, migrar, incorporar decisiones y restaurar se rechazan mientras esté activa.
El kernel libera flock tras una caída; **no borrar el `.lock`**, WAL o SHM para forzar nada.
La restauración existente prepara/verifica una imagen, conserva copia previa e integra el WAL
antes de reemplazar bajo exclusividad. No hay recarga en caliente ni botón Actualizar.

## Preparación e instalación

Requisitos: Docker Desktop instalado y su **motor Linux arrancado por el usuario**, Compose
con soporte de `service_healthy`, y los dos repositorios compatibles. Comprobar antes de
construir; estas órdenes no arrancan Docker Desktop:

```powershell
docker version
docker compose version
```

Desde `rj-analyst`, crear un archivo específico, sin cambiar `.env.local`:

```powershell
Copy-Item -LiteralPath .env.docker.example -Destination .env.docker
New-Item -ItemType Directory -Force -Path artifacts/docker-imports
docker compose --env-file .env.docker -f compose.yaml config
docker compose --env-file .env.docker -f compose.yaml build
docker volume create rj-analyst-local-state
docker compose --env-file .env.docker -f compose.yaml run --rm --no-deps --user 0:0 --cap-add CHOWN --entrypoint chown backend 10001:10001 /state
```

Editar `.env.docker` antes de ejecutar si cambian contexto, volumen, entradas o puerto.
Variables (sin secretos):

| Variable | Uso |
|---|---|
| `COMPOSE_PROJECT_NAME` | Proyecto y nombres de imágenes; separar una prueba de cualquier pila existente |
| `RJ_BACKEND_CONTEXT` | Ruta al repositorio backend, relativa a Compose o absoluta del host |
| `RJ_FRONTEND_PORT` | Puerto localhost del frontend; escoger uno libre |
| `RJ_STATE_VOLUME` | Volumen externo creado expresamente; no se crea ni selecciona una base por defecto |
| `RJ_IMPORT_DIR` | Directorio existente de **copias** y exportaciones de entrada; bind mount **solo lectura** en `/imports`; nunca el directorio SQLite activo |

Comprobar permisos con el usuario normal antes de instalar datos:

```powershell
docker compose --env-file .env.docker -f compose.yaml run --rm --no-deps backend -c "import os,tempfile; print('uid',os.geteuid()); f=tempfile.TemporaryFile(dir='/state'); f.close()"
```

Preparar `artifacts/docker-imports/snapshot.sqlite` mediante el mecanismo de copia de
`api-real-jaen` (`persistencia copiar` o `sqlite.copia_consistente`), **no copiando a mano una
base WAL activa**. La API Windows debe estar cerrada para copiar esa base; no eludir su
bloqueo. Se puede partir de una copia verificada anterior sin tocar el servicio activo,
indicando la antigüedad del snapshot. Si es `0002`, migrar explícitamente **una copia aparte**
y verificarla antes de instalarla. Después de migrar, producir **otra copia consistente**: la
migración vuelve a activar WAL. Esa última copia finalizada en DELETE es la entrada; el inicializador no migra.

La copia final debe estar en revisión **0004**, journal DELETE y sin diarios auxiliares,
como las copias finalizadas por el mecanismo existente. Instalar solo en un volumen vacío:

```powershell
docker compose --env-file .env.docker -f compose.yaml run --rm --no-deps backend -m scripts.initialize_snapshot /imports/snapshot.sqlite /state/real-jaen.sqlite
docker compose --env-file .env.docker -f compose.yaml run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite
docker compose --env-file .env.docker -f compose.yaml run --rm --no-deps backend -m scripts.check_container --base /state/real-jaen.sqlite
```

El inicializador reserva el destino, rechaza sobrescrituras, verifica el snapshot de solo
lectura, usa el mecanismo de copia SQLite sobre una copia privada y verifica antes del
reemplazo atómico. No crea una base vacía para arrancar ni migra automáticamente. Para una
base ya instalada se usan las operaciones normales de mantenimiento, no el inicializador.
Los archivos de entrada deben ser legibles por UID 10001; en Linux ajustar permisos de las
copias de entrada si hace falta, sin cambiar los originales ni ejecutar la API como root.
El ámbito es el `ambito.json` del backend de la imagen; cambiarlo exige reconstruir la imagen.

## Arranque, parada y logs

```powershell
docker compose --env-file .env.docker -f compose.yaml up -d --wait --wait-timeout 120
docker compose --env-file .env.docker -f compose.yaml ps
docker compose --env-file .env.docker -f compose.yaml logs --tail 100 -f
docker compose --env-file .env.docker -f compose.yaml stop
docker compose --env-file .env.docker -f compose.yaml down
```

Abrir `http://127.0.0.1:3200` (o el puerto elegido). No se publican 3000/8001 del host.
Un estado unhealthy o una revisión incorrecta requiere revisar logs y actuar expresamente,
no ejecutar migraciones al reiniciar. Diagnóstico del backend sin publicarlo al host:

```powershell
docker compose --env-file .env.docker -f compose.yaml exec -T backend python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8001/health').read().decode())"
```

## Mantenimiento explícito

Siempre **detener backend → operación → verificar → arrancar backend**. El frontend puede
permanecer activo y mostrará el error de fuente mientras no haya API. `run --no-deps` utiliza
la misma imagen, usuario, volumen y ruta; no arranca la API accidentalmente. El ENTRYPOINT
del backend es `python -B`: para `run` se pasan directamente `-m persistencia …`; para `exec`
se incluye `python` porque Docker no aplica ENTRYPOINT a `exec`.

```powershell
docker compose --env-file .env.docker -f compose.yaml stop backend
docker compose --env-file .env.docker -f compose.yaml run --rm --no-deps backend -m persistencia importar --base /state/real-jaen.sqlite --exportacion 2841=/imports/nueva-exportacion.jsonl
docker compose --env-file .env.docker -f compose.yaml run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite
docker compose --env-file .env.docker -f compose.yaml start backend
```

En lugar de importar, ejecutar **una** operación necesaria, con backend detenido:

```powershell
docker compose --env-file .env.docker -f compose.yaml run --rm --no-deps backend -m persistencia migrar --base /state/real-jaen.sqlite
docker compose --env-file .env.docker -f compose.yaml run --rm --no-deps backend -m persistencia reconstruir --base /state/real-jaen.sqlite --confirmar
docker compose --env-file .env.docker -f compose.yaml run --rm --no-deps backend -m persistencia sustituciones --base /state/real-jaen.sqlite --archivo /imports/sustituciones.json --ambito /app/ambito.json
docker compose --env-file .env.docker -f compose.yaml run --rm --no-deps backend -m persistencia copiar --base /state/real-jaen.sqlite
docker compose --env-file .env.docker -f compose.yaml run --rm --no-deps backend -m persistencia restaurar --base /state/real-jaen.sqlite --copia /state/copias/NOMBRE-EXACTO.sqlite --confirmar
```

Importar/migrar/reconstruir/decisiones/restaurar conservan copia previa; no elegir una copia
por «la más reciente». Tras un fallo, no arrancar hasta verificar/revisar el resultado.
La transacción fallida puede dejar la fila de auditoría `failed`, no datos deportivos parciales.
Una caída abrupta durante inicialización/restauración puede dejar un temporal propio para
inspección; nunca activarlo solo por el nombre. Restaurar `0002` requiere `--revision 0002`
y una imagen/código de fase 3 compatible después: la imagen actual sirve **0004**.

Para sacar al host una copia finalizada (usar el nombre exacto del informe de `copiar`):

```powershell
docker compose --env-file .env.docker -f compose.yaml cp backend:/state/copias/NOMBRE-EXACTO.sqlite ./artifacts/docker-imports/copia-exportada.sqlite
```

## Prueba temporal y evidencias

Desde PowerShell, con el entorno SQL Windows del backend y Node/Playwright del frontend:

```powershell
npm.cmd ci
npx.cmd playwright install chromium
& ./scripts/test-docker.ps1 -Snapshot 'RUTA-ABSOLUTA-A-UNA-COPIA-VERIFICADA.sqlite'
```

El script comprueba el motor **antes de crear recursos**, genera proyecto/volumen/directorio
temporales con nombres únicos, elige un puerto libre distinto de 3000/3100/8001, prepara su
copia consistente y migra únicamente esa copia. No para servicios ajenos. Comprueba permisos,
flock entre procesos, symlinks, rechazo con API viva, cierre normal, SIGKILL, rollback WAL y
restauración fallida sobre el volumen real. Después levanta los dos servicios, revisa HTTP/UI
real sin mocks a 1440 y 390 px, captura Inicio, Equipos, jugadores, pierna, estadística derivada,
sustitución y selector móvil desplegado; comprueba mismo origen y ausencia de HMR. Recrea
los contenedores y compara la huella lógica. Al salir baja solo su proyecto, **conservando**
el volumen externo y las evidencias en TEMP para revisión. No hay `prune` ni borrado de volúmenes.

Las capturas se deben **abrir e inspeccionar**: las aserciones de navegador no sustituyen
esa revisión. `scripts/verify-production.mjs URL DIRECTORIO` también permite revisar una pila
temporal de producción fuera de Docker, pero eso no acredita Docker ni almacenamiento Linux.
El verificador requiere el snapshot real conocido (Moha Keita con un valor derivado, piernas
observadas y la sustitución 16599919 → 16969545); otra muestra necesita ajustar las referencias
de prueba explícitamente, sin inventar datos para hacerla pasar.

## Estado de validación

**Resultados propios (25-10-2026), sin commits ni activación de Docker:**

| Comprobación | Resultado |
|---|---|
| Estado inicial | Ambos repositorios limpios. Backend `feature/stats-normalization`, HEAD `23fc5ad`; frontend `feature/rj-analyst`, HEAD `33a86c1`. Instrucciones de cada repositorio revisadas; las del frontend no se aplican al backend |
| Docker | Cliente 29.5.2 y Compose v5.1.4 presentes. Motor `desktop-linux` inaccesible (`dockerDesktopLinuxEngine` no existe); no se arrancó Docker Desktop, no hubo builds, contenedores ni volúmenes Docker creados |
| Imágenes | Manifiestos y digests oficiales de Node 22.22.2 y Python 3.14.4 consultados correctamente en el registro; eso no equivale a construir imágenes |
| Compose | `config --quiet` y JSON efectivo correctos: frontend solo localhost, backend sin puertos al host, volumen externo solo en backend, imports RO, real explícito, upstream por nombre de servicio, dependencia saludable |
| Scripts | Sintaxis PowerShell/Node/Python comprobada. El script Docker se detuvo por falta de motor **antes de crear recursos** |
| Inicialización | 3 pruebas nuevas, correctas con ResourceWarning como error; además inicialización real verificada sobre un snapshot temporal finalizado en DELETE, sin sobrescribir destinos |
| Backend SQL | 225 pruebas, OK; 2 omitidas (caso sin dependencias y symlink Windows sin privilegios) |
| Backend sin dependencias SQL | 225 pruebas, OK; 78 omitidas |
| Frontend | lint y typecheck correctos; 40 archivos / 596 pruebas correctas |
| Build de producción | Standalone/webpack correcto en copia temporal que reproduce el contexto Docker permitido, sin `.env*` ni JSON sintéticos; original `.next` y configuración de dev sin modificar |
| HTTP/UI real | API y standalone temporales en puertos 53097/53098, cerrados al terminar. 12 pantallas/estados y 13 capturas a 1440 y 390 px; sin mocks, peticiones de navegador a otro origen, HMR, errores de página ni desbordamiento de página |
| Datos usados | Copia consistente de la copia de seguridad `antes-de-migrar-0002`, migrada solo en TEMP y verificada. El contenido del backup original se comprobó antes/después. No se abrió, copió a mano, montó ni migró la base activa. No es un snapshot nuevo de importaciones posteriores |

**Revisión visual manual realizada** abriendo las 13 capturas: Inicio, Equipos/rendimiento,
Equipos/jugadores, selector móvil desplegado, Moha Keita con J8 seleccionado y tiros a puerta
`0*` deducidos, perfil con pierna dominante y evento sustituido con enlace al vigente. No se
apreciaron defectos nuevos de alineación, espaciado, superposición o responsive. Tabla de
jugadores móvil e histórico conservan su scroll interno deliberado; abreviaciones móviles son
las del diseño existente. No se hicieron cambios de UI ni mejoras subjetivas.

Capturas e informe: `artifacts/docker-review-2026-10-25/` (ignorado por Git). Builds, snapshots y
logs de procesos temporales quedan en `%TEMP%/rj-docker-check-n9_mxlpq/`; no se incorporan bases,
originales o copias a los repositorios. `.env.local` y `next.config.ts` originales se comprobaron
por huella antes/después, sin divulgar su contenido. Los servicios originales de 3000 y 8001 no
se detuvieron ni reiniciaron. No se ejecutó el E2E habitual, que usa demo y 3100: se hizo la
comprobación real de producción en puerto libre mediante `verify-production.mjs`.

### Validación Docker Linux ejecutada después (25-10-2026)

El motor Linux ya responde. `scripts/test-docker.ps1` terminó con código **0** en el proyecto
`rj-check-50bca3bcd6b2`, puerto temporal **127.0.0.1:53229**, volumen externo
`rj-check-50bca3bcd6b2-state`. Antes de crearlo se comprobó su ausencia y después su etiqueta
`rj.validation=rj-check-50bca3bcd6b2`. No se reutilizaron volúmenes existentes.

Se generó otra copia consistente desde el respaldo finalizado
`real-jaen.20261025-165659-903771.antes-de-migrar-0002.sqlite`, se migró y verificó solo la copia
temporal y se produjo otro snapshot consistente DELETE **0004**. No se abrió ni montó la base
activa. La muestra conserva la antigüedad de aquel respaldo, sin acreditar importaciones posteriores.
Huella lógica instalada y conservada tras recrear contenedores:
`eaddcded604fec2263a949ced67d1f7d98a996681bc47639e54887d265dc771e`.

| Comprobación ejecutada en Docker | Resultado |
|---|---|
| Build | Ambas imágenes construidas; Next standalone de producción |
| Salud y red | Ambos healthy; Next resuelve backend y consulta http://backend:8001/health con su contrato existente |
| Aislamiento | Solo frontend publicado en localhost:53229; backend sin puerto host; frontend sin volumen de datos ni .env.local |
| Usuarios y almacenamiento | Backend UID 10001, frontend UID 1000; /state en /dev/sdd, ext4 rw, SQLite 3.40.1; permisos correctos |
| Bloqueo Linux | Exclusión entre procesos, rutas equivalentes y symlinks; rechazo de importar/reconstruir/migrar/decisiones/restaurar con API hija activa; migrar también rechazado con el servicio Compose activo |
| Liberación | Salida normal y SIGKILL liberan el bloqueo; archivo de coordinación conservado; mantenimiento posterior correcto |
| Fallos | Escritor terminado antes de COMMIT: rollback WAL sin cambios lógicos; fallo inyectado de reemplazo al restaurar: contenido conservado; restauración posterior verificada |
| Persistencia | Backend detenido, verificar correcto, ambos contenedores recreados, healthy y misma huella lógica |
| HTTP/UI | 12 estados reales y 13 capturas a 1440 y 390 px, sin mocks, errores JS, HMR, peticiones a otro origen ni desbordamiento de página |

Se abrieron e inspeccionaron las **13 capturas Docker**: Inicio, Equipos, jugadores, Moha/J8
con estadística deducida, pierna dominante, evento sustituido y selector móvil desplegado.
No se observaron regresiones de alineación, espaciado, superposición o responsive. La tabla
móvil y el histórico conservan su desplazamiento interno deliberado. No se modificó la UI.

Evidencias completas en `%TEMP%/rj-check-50bca3bcd6b2/`: snapshot, identidad del volumen,
inspección de contenedores, logs y screenshots/report.json. Copia de consulta sin bases en
`artifacts/docker-linux-review-2026-10-25/`, ignorada por Git. La pila temporal se bajó al
terminar; el volumen externo de prueba queda conservado y etiquetado. No hubo commit, push
ni limpieza global Docker. Los servicios Windows y la base activa permanecieron intactos.

Se corrigió el tratamiento de stderr de progreso/avisos en PowerShell 5: el código nativo
determina el éxito. Los primeros intentos se detuvieron antes de crear volumen o servicios.
Un fallo inesperado aborta la secuencia y no arranca el backend. Los fallos inyectados son
pruebas deliberadas que comprueban invariantes antes de continuar.

Linux y symlinks quedan validados **en este volumen ext4 de Docker Desktop**. Siguen fuera
del alcance otros almacenamientos, bind mounts NTFS, sistemas de red, coordinación entre
Windows y Linux sobre una misma base y caída completa de la VM/host. No se ha activado una
instalación con datos actuales ni sincronizado futuras importaciones Windows. El bloqueo
es cooperativo y no coordina cualquier programa externo que abra SQLite.

Referencias: [Compose y dependencias saludables](https://docs.docker.com/reference/compose-file/services/),
[Next.js standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
[variables del servidor en ejecución](https://nextjs.org/docs/app/guides/self-hosting#environment-variables).
