# rj-analyst

Dashboard de análisis deportivo del **Real Jaén CF**. Su única finalidad es que
el analista consulte partidos, equipos y jugadores con sus estadísticas.

No es una versión reducida de RealHive: es una aplicación nueva. De RealHive
sólo se reutilizan, de forma selectiva, elementos visuales y decisiones de UX;
una vez copiados, este proyecto es la referencia.

## Arquitectura

Una única aplicación Next.js (App Router) con su API interna:

```
Interfaz (src/app, src/features, src/ui)
  │  cliente tipado (src/client)
  ▼
/api/v1  (src/app/api/v1: route handlers)
  ▼
DataSource (src/server)  ──►  fuente de datos (hoy: sintética)
```

| Carpeta | Responsabilidad |
|---|---|
| `src/contract` | Tipos del contrato `/api/v1`: lo que ve el analista, no lo que devuelve un proveedor |
| `src/app` | Páginas y route handlers de `/api/v1` |
| `src/client` | Cliente tipado: la única vía de las pantallas hacia los datos |
| `src/server` | Interfaz `DataSource` y sus adaptadores (`synthetic/`) |
| `src/ui` | Tokens visuales, base y componentes compartidos |
| `src/features/{matches,teams,players}` | Componentes de cada área |
| `data/synthetic` | Temporada ficticia (sólo la lee el adaptador sintético) |
| `scripts` | Generador de la temporada sintética (`npm run data:generate`) |

**Frontera:** la interfaz nunca importa `src/server` ni `data/`. Lo impide
ESLint (`no-restricted-imports`) y lo comprueba `tests/architecture/architecture.test.ts`.
Sin base de datos, Docker, workers ni autenticación.

## Independencia de la fuente de datos

El contrato describe lo que necesita el analista. Una fuente nueva (una API
deportiva, datos del club, vídeo, archivos importados…) es un adaptador que
implementa `DataSource` y devuelve tipos del contrato; las pantallas no cambian.

Las métricas distinguen siempre tres casos y nunca convierten una ausencia en cero:

- `{ "value": 0 }`: valor real;
- `{ "value": null, "reason": "not_available" }`: la fuente no lo ofrece o no aplica;
- `{ "value": null, "reason": "not_collected" }`: debería existir y aún no se ha recopilado.

Los acumulados de temporada (`SeasonStat`) añaden su cobertura: `complete`, `partial`
(sólo `matches` de `of` partidos tenían el dato, así que el total no es de toda la
temporada) o `none` (con su `reason`). La regla está en `seasonStat` (`src/contract`), que
comparten el servidor y las pantallas para cualquier conjunto de partidos.

Cada partido de un equipo (`TeamMatch`) incluye sus estadísticas de equipo vistas desde ese
equipo: `own` (lo que hizo) y `opponent` (lo que hizo el rival, es decir, lo que concedió).

## Jugadores observados desde la API local

«Equipos › Jugadores» puede leer los jugadores observados en convocatorias, y sus fichas
personales, desde una API local de datos (servicio independiente). Por defecto todo es
sintético. Para activarla, en `.env.local` (ver `.env.example`) y reiniciando el servidor:

```
OBSERVED_PLAYERS_SOURCE=local
LOCAL_DATA_API_URL=http://127.0.0.1:8001
```

- La llamada la hace el servidor Next (`src/server/local-api`), nunca el navegador:
  `127.0.0.1` debe ser la máquina donde corre `next dev`/`next start`.
- Sólo se muestran nombre y posición, con su procedencia («Datos reales») y su alcance. El
  listado no depende de la temporada seleccionada. Sin estadísticas ni enlace a la ficha.
- Sólo hay correspondencia explícita para el Real Jaén (`team-real-jaen` ↔ equipo `2841`
  de la fuente); el resto de equipos responde 404. Nunca se relacionan jugadores por nombre.
- Los IDs de jugador (`sofascore-player-966303`) se derivan del ID del proveedor: son
  estables mientras se use esa fuente, pero no son una identidad independiente de ella.
- Si la API falla, no responde en 5 s o devuelve algo no válido, la pestaña muestra el
  error: nunca jugadores sintéticos en su lugar.
- Cada jugador abre su ficha real (`/players/{id}?view=profile`), sólo con datos
  personales: posición, nacimiento, estatura, pierna dominante y país, tal como los da la
  fuente; lo desconocido se muestra «—». Sin temporada, equipo actual ni estadísticas. El
  servidor traduce el ID derivado al de la fuente; la fecha de descarga (`fetched_at`) no
  se usa como fecha de actualización. En modo sintético no hay fichas de este tipo (404).
- La ficha real añade «Partidos observados»: las convocatorias que registra la fuente, del
  más reciente al más antiguo, con su propia competición y temporada (la de la URL sólo
  sirve para volver). Fecha, rival y condición, resultado, titular/suplente y, si existen,
  minutos, goles, asistencias, tiros, xG, pases completados/intentados y valoración de
  SofaScore. Una estadística omitida es «—», nunca 0. Si fallan los partidos, la ficha
  personal sigue visible. Con `MATCHES_SOURCE=local` cada partido enlaza a su detalle real
  (`/matches/{id}?view=observed&from=player&player=…`), cuyo «Volver al jugador» regresa a la
  ficha con su propio origen (equipo o alineaciones de un partido real); sin partidos reales
  se muestra sin enlace, nunca una ficha sintética. El contexto tiene un solo nivel: un
  jugador abierto desde las alineaciones de ese partido vuelve a ellas, y de ahí a la lista
  de partidos. Un retorno manipulado se descarta y se usa un destino interno.
- Participación (`played` / `minutes_played`): confirmada con `played: true` (minutos > 0
  o ausentes) o, sin `played`, con minutos > 0. `played: false` o sin datos, con 0 minutos
  o sin ellos, queda desconocida: no se afirma que no jugara. Si se contradicen
  (`played: true` con 0 minutos, `played: false` con minutos > 0) no se elige ninguno:
  participación desconocida, sin estadísticas, y un aviso en el registro del servidor. Sin
  participación confirmada no hay estadísticas: un `statistics` con `totalShots: 0` no
  prueba nada.
- Los nombres de equipo se piden a la fuente (`/api/v1/teams/{id}`) de uno en uno y se
  reutilizan durante una hora en el servidor (también los equipos que la fuente no
  conoce; los fallos no se guardan), así que listas que comparten equipos no repiten
  consultas. **Pendiente:** investigar por qué el servicio local rechazó conexiones
  (`ECONNREFUSED`) con unas diez peticiones simultáneas (seis respondieron); en serie todas
  responden. El servicio ya usa `ThreadingHTTPServer`, así que la causa no está
  comprobada; hasta entonces se mantiene la petición secuencial.

## Partidos reales desde la API local

«Partidos» puede mostrar el calendario y los resultados reales del Real Jaén con un
selector propio, independiente de `OBSERVED_PLAYERS_SOURCE` y sintético por defecto:

```
MATCHES_SOURCE=local
LOCAL_DATA_API_URL=http://127.0.0.1:8001
```

- La pantalla sabe qué mostrar por `GET /api/v1/source` (`realSections`); partidos reales
  y sintéticos nunca se mezclan en una lista. Si la fuente real falla, error y reintento,
  sin volver a los sintéticos.
- Fecha, equipos, local/visitante, competición, temporada, jornada, estado y resultado,
  tal como los da la fuente (`/api/v1/teams/2841/matches`, sólo el Real Jaén tiene
  correspondencia), por fecha de inicio. Filtros por las temporadas y competiciones de la
  fuente y por estado (finalizados / pendientes: programados o aplazados). Las temporadas
  y jornadas sintéticas no intervienen.
- Sólo un partido finalizado muestra resultado; uno pendiente muestra su hora o «Por
  definir», nunca 0–0. Un estado desconocido se dice como tal.
- Cada fila abre el detalle real del partido, marcado explícitamente como real:
  `/matches/{id}?view=observed`. Sin `view=observed` la ruta es siempre la ficha
  sintética; un ID sintético nunca se consulta como real ni al revés.
- Detalle real (`GET /api/v1/matches/{matchId}/observed`, desde `/api/v1/matches/{id}` y
  `/api/v1/matches/{id}/statistics` de la API local): cabecera con los nombres de la fuente
  y las ocho estadísticas colectivas de la ficha sintética, tomadas del periodo `ALL`. Una
  estadística que la fuente no da (p. ej. `redCards`, ausente en la mayoría de partidos)
  se muestra «—», nunca 0. La sección distingue estadísticas guardadas, guardadas sin
  contenido, no guardadas (normal en un partido pendiente) y error de consulta, que
  mantiene visible la cabecera con reintento. `fetched_at` se muestra como fecha de
  obtención. El detalle real se organiza como el sintético: cabecera, pestaña «Resumen»
  (estadísticas) y pestaña «Alineaciones»; no hay «Cronología» todavía.
- Alineaciones reales (desde `/api/v1/matches/{id}/lineups`), con el formato sintético:
  por equipo (el lado del payload, no el `teamId` de cada jugador), «Once inicial» y
  «Banquillo» según el campo explícito `substitute`, en el orden de la fuente, con dorsal
  («—» si falta), nombre y posición. Un jugador sin rol informado se lista aparte, sin
  adivinarlo. Sin esquema táctico, posiciones en el campo ni capitán. Se muestra si la
  fuente da las alineaciones por confirmadas, no confirmadas o no lo indica, y se avisa de
  un equipo sin 11 titulares o con roles sin informar.
- Indicadores, sólo desde las incidencias (`/api/v1/matches/{id}/incidents`), nunca desde
  estadísticas ni minutos: balón por los goles del jugador (el rótulo distingue los
  penaltis), balón con «?» aparte por un gol de tipo no reconocido (nunca se suma a los
  goles normales), «p.p.» por un gol en propia puerta (no cuenta como gol ni
  da asistencia), bota por las asistencias que la fuente nombra (`assist1`), dobles flechas
  con el minuto en el titular sustituido y la línea «↑ minuto · Sale · …» en el suplente que
  entra. Las tandas de penaltis no son goles. Tarjetas, VAR y penaltis fallados no se marcan
  (el formato sintético de alineaciones no los muestra). Un suplente sin entrada registrada
  muestra sus minutos si están confirmados o «Participación no confirmada»; nunca se deduce
  un cambio de los minutos.
- Estadísticas, alineaciones e incidencias tienen cada una su estado (guardada, vacía, no
  guardada, error con reintento). Si fallan las incidencias se ven igual alineaciones y
  estadísticas, sin marcas; el reintento conserva la pestaña. Los nombres enlazan a la
  ficha real sólo si `OBSERVED_PLAYERS_SOURCE=local`; desde ella «Volver» regresa a la
  pestaña «Alineaciones» del partido real. No se consulta ninguna ficha por jugador.
- Un aviso indica que la muestra no es necesariamente un calendario completo.
- Un enlace con `?season=` (temporada sintética) o `?team=` de un equipo sin
  correspondencia muestra un estado explícito con un enlace a los partidos reales del
  Real Jaén; nunca se sustituye el equipo o la temporada sin decirlo.

## Goles y tarjetas

- Un evento `goal` lleva el jugador que lo realiza y su equipo (`teamId`). Si `ownGoal` es
  `true`, el gol suma en el marcador del rival (`scoringSide` en `src/contract`), no tiene
  asistencia, no es penalti y no cuenta en los `goals` del jugador.
- Un evento `card` conserva la tarjeta real: `yellow`, `second_yellow` o `red`. Las
  estadísticas se derivan así: `yellowCards` cuenta los eventos `yellow` y `redCards` los
  `second_yellow` y `red`. Un expulsado por doble amarilla tiene `yellowCards: 1` y
  `redCards: 1`.

## API v1 (sólo lectura)

| Endpoint | Devuelve |
|---|---|
| `GET /api/v1/source` | Si los datos son sintéticos y qué secciones sirve la fuente real (`realSections`) |
| `GET /api/v1/competitions` | Competiciones con sus temporadas |
| `GET /api/v1/seasons/{seasonId}/matches?round=&team=` | Partidos, filtrables por jornada y equipo |
| `GET /api/v1/matches/{matchId}` | Ficha: alineaciones, eventos, estadísticas de equipo y jugador |
| `GET /api/v1/matches/{matchId}/observed` | Partido real con sus estadísticas colectivas y el estado de esa sección; 404 para un ID sintético o desconocido, `503 UPSTREAM_UNAVAILABLE` si falla la fuente |
| `GET /api/v1/seasons/{seasonId}/teams` | Equipos con su clasificación |
| `GET /api/v1/seasons/{seasonId}/teams/{teamId}` | Temporada del equipo: partidos, acumulados y plantilla |
| `GET /api/v1/players/{playerId}?season={seasonId}` | Temporada del jugador: ficha, acumulados y partidos |
| `GET /api/v1/teams/{teamId}/players` | Jugadores observados del equipo (sin temporada), con su alcance y procedencia; `503 UPSTREAM_UNAVAILABLE` si falla una fuente real |
| `GET /api/v1/players/{playerId}/profile` | Datos personales de un jugador de la fuente real (sin temporada ni equipo), con alcance y procedencia; 404 si no existe, `503 UPSTREAM_UNAVAILABLE` si falla la fuente |
| `GET /api/v1/players/{playerId}/observed-matches` | Partidos en los que la fuente real registra al jugador, del más reciente al más antiguo; lista vacía si no hay, 404 si no existe, `503 UPSTREAM_UNAVAILABLE` si falla la fuente |
| `GET /api/v1/teams/{teamId}/observed-matches` | Partidos del equipo en la fuente real (calendario y resultados), por fecha; lista vacía si no hay, 404 sin correspondencia, `503 UPSTREAM_UNAVAILABLE` si falla la fuente |

Los tipos están en `src/contract`; las pantallas usan las funciones de `src/client/api.ts`
(`getSeasonMatches`, `getMatch`…) y nunca construyen URLs. Los errores tienen la forma
`{ error: { code, message } }`, con `BAD_REQUEST` (400) o `NOT_FOUND` (404).

## Datos sintéticos

En desarrollo la aplicación usa una temporada inventada (`DATA_SOURCE=synthetic`,
valor por defecto). El Real Jaén CF es el club principal; la competición («Liga de
Demostración»), rivales, jugadores, resultados y estadísticas son ficticios, y la
interfaz lo indica con el aviso «Datos sintéticos».

- 20 equipos de 24 jugadores y un calendario de 38 jornadas a doble vuelta.
- Jornadas 1–14 disputadas (el Real Jaén – rival de la 9 está aplazado); el resto, programadas.
- Las 14 primeras jornadas del Real Jaén siguen un guion (`RJ_PLAN` en
  `scripts/synthetic/generate.mts`) para que existan todos los casos que la interfaz debe
  mostrar: victoria, empate y derrota en casa y fuera, 0-0, 4-3, penalti, gol en el
  añadido, gol en propia puerta, doble amarilla, cinco cambios, varias formaciones, rival sin formación conocida,
  canterano sin estadísticas detalladas, partido con datos `not_collected`, xG `not_available`…

```
data/synthetic/
  season.json            competición, temporada, equipos y plantillas
  players.json           datos personales
  rounds/round-NN.json   partidos de cada jornada (alineaciones, eventos, estadísticas)
```

Sólo `src/server/synthetic` conoce estos archivos. Se generan con semilla fija y se versionan:

```bash
npm run data:generate   # regenera data/synthetic desde scripts/synthetic
```

`tests/data/dataset.test.ts` falla si los archivos no coinciden con el generador
y comprueba su coherencia interna (identificadores, plantillas, alineaciones, sustituciones,
goles frente al marcador, minutos, estadísticas frente a eventos).

## Comandos

```bash
npm install          # dependencias
npm run dev          # desarrollo en http://localhost:3000
npm run lint         # ESLint (incluye la frontera de arquitectura)
npm run typecheck    # TypeScript
npm test             # Vitest + Testing Library
npm run build        # build de producción
npm run check        # lint, tipos, pruebas y build
npx playwright install chromium   # una vez, para las pruebas e2e
npm run e2e          # Playwright a 1440 y 390 px
```
