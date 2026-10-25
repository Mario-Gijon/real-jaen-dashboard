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
DataSource (src/server)  ──►  API local de datos (modo real) o temporada de demostración (DATA_MODE=demo)
```

| Carpeta | Responsabilidad |
|---|---|
| `src/contract` | Tipos del contrato `/api/v1`: lo que ve el analista, no lo que devuelve un proveedor |
| `src/app` | Páginas y route handlers de `/api/v1` |
| `src/client` | Cliente tipado: la única vía de las pantallas hacia los datos |
| `src/server` | Interfaz `DataSource`, su selección por `DATA_MODE` y sus adaptadores (`local-api/` real, `synthetic/` demostración) |
| `src/ui` | Tokens visuales, base y componentes compartidos |
| `src/features/{matches,teams,players}` | Componentes de cada área |
| `data/synthetic` | Temporada ficticia de la demostración (sólo la lee el adaptador sintético) |
| `scripts` | Generador de la temporada de demostración (`npm run data:generate`) |

**Frontera:** la interfaz nunca importa `src/server` ni `data/`. Lo impide
ESLint (`no-restricted-imports`) y lo comprueba `tests/architecture/architecture.test.ts`.
El frontend no incorpora base de datos, workers ni autenticación. El despliegue local
con Docker Compose y el backend independiente se documenta en [docs/docker.md](docs/docker.md).

## Modo de datos

`DATA_MODE` decide qué datos sirve `/api/v1` (en `.env.local`, ver `.env.example`; reinicia el
servidor Next al cambiarlo):

| `DATA_MODE` | Datos |
|---|---|
| `real` (o sin definir) | Todas las pantallas desde la API local de datos en `LOCAL_DATA_API_URL`, obligatoria. Cada sección lo indica con «Datos reales». |
| `demo` | La temporada inventada de `data/synthetic`, señalada en la cabecera con «Demostración · datos sintéticos». No se consulta la API local. |

- Nunca se pasa de un modo al otro. Un `DATA_MODE` distinto de `real` o `demo`, o el modo real
  sin `LOCAL_DATA_API_URL`, hacen que toda ruta responda `503 UPSTREAM_UNAVAILABLE` con el
  motivo (también en el log del servidor), y las pantallas muestran ese error. Si la API local
  falla o no responde, 503 y error con reintento.
- En modo real ninguna ruta sirve la temporada de demostración, ni desde un enlace antiguo:
  `/competitions` devuelve una lista vacía y una temporada, partido o jugador de la
  demostración, 404. En demostración, las rutas reales responden 404.
- Cada pantalla pregunta el modo a `GET /api/v1/source` y elige su vista real o la de
  demostración. Los parámetros `view=observed` y `view=profile` de los enlaces se aceptan pero
  no cambian el modo: un ID del otro modo simplemente no se encuentra.
- `OBSERVED_PLAYERS_SOURCE`, `MATCHES_SOURCE`, `TEAMS_SOURCE` y `DATA_SOURCE` (los selectores
  anteriores, por sección) ya no se leen; si siguen definidos, el servidor lo advierte una vez
  en el log.
- La llamada a la API local la hace el servidor Next (`src/server/local-api`), nunca el
  navegador: `127.0.0.1` debe ser la máquina donde corre `next dev`/`next start`.

En el código, cada pantalla tiene un selector de modo (`HomeView`, `MatchesView`, `TeamsView`,
`MatchView`, `PlayerView`) y una vista por modo (`Real…`/`Synthetic…`, `PlayerProfileView`/
`PlayerDetailView`). Lo que ambas dibujan igual (`PreparationParts`, `TeamShell`,
`TeamPerformanceParts`, `TeamStatsComparison`, `TeamPlayersTable`…) y las funciones puras no
cargan datos. `tests/architecture` comprueba que sólo los selectores llevan a datos de los dos
modos y que los módulos compartidos no llevan a los de ninguno.

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

En modo real, «Equipos › Jugadores» y las fichas de jugador leen de la API local de datos
(servicio independiente) los jugadores observados en convocatorias, con sus acumulados (ver
«Acumulados de jugadores») y sus datos personales.

- Hay correspondencia explícita para el Real Jaén (`team-real-jaen` ↔ equipo `2841`) y para
  los otros 19 equipos de Primera Federación, Grupo 2, 26/27 (`sofascore-team-{id}` ↔ `{id}`,
  el id que ya usan las listas de partidos; ids comprobados en el catálogo del scraper), en
  `SOURCE_TEAM_IDS` de `src/server/local-api/local-api-source.ts`.
  Además, el equipo debe tener una exportación propia declarada por la API local
  (`teams_with_own_export` en `/api/v1/scope`, del manifiesto del importador); si no,
  responde 404. Nunca se relacionan equipos ni jugadores por nombre.
- Los IDs de jugador (`sofascore-player-966303`) se derivan del ID del proveedor: son
  estables mientras se use esa fuente, pero no son una identidad independiente de ella.
- Si la API falla, no responde en 5 s o devuelve algo no válido, la pestaña muestra el
  error: nunca jugadores sintéticos en su lugar.
- Cada jugador abre su ficha real (`/players/{id}?view=profile`), sólo con datos
  personales: posición, nacimiento, estatura, pierna dominante y país, tal como los da la
  fuente; lo desconocido se muestra «—». Sin temporada, equipo actual ni estadísticas. El
  servidor traduce el ID derivado al de la fuente; la fecha de descarga (`fetched_at`) no
  se usa como fecha de actualización. En la demostración no hay fichas de este tipo (404).
- La ficha real añade «Partidos», con la presentación de la ficha sintética: a la izquierda
  las convocatorias que registra la fuente (`GET /api/v1/players/{id}/matches` de la API
  local), de la más reciente a la más antigua, con su propia competición y temporada (la
  `season` de la URL sólo sirve para volver a Equipos); a la derecha la actuación en el
  partido seleccionado. En móvil (≤ 900 px) el detalle se abre bajo la fila, como en la
  ficha sintética. Seleccionar otro partido no sale de la ficha y lo guarda en la URL
  (`&match=…`, sin nueva entrada de historial), así que se conserva al recargar. Sin `match`
  se selecciona el partido cuyas alineaciones abrieron la ficha o, si no, la actuación más
  reciente; un `match` que no está entre las convocatorias no selecciona nada y lo dice.
  Si fallan los partidos, la ficha personal sigue visible.
- Detalle: rival, resultado, condición, fecha, competición, rol y minutos; posición en el
  partido (`match_position`, distinta de la habitual de la cabecera) y valoración de
  SofaScore. Sin participación confirmada sólo dice que fue convocado, sin minutos ni
  estadísticas (nunca «No participó»). Con ella, los grupos de la ficha sintética con lo
  que la fuente da; la posición en el partido decide si son los de portero. Todas las
  cifras vienen normalizadas por la API local (`normalized` y `normalized.stats`; reglas en
  `api-real-jaen/docs/normalizacion-estadisticas-individuales.md`); el dashboard no repite
  reglas. Una clave que la fuente omite es «—», nunca 0, salvo que la API la deduzca de
  valores explícitos (hoy solo tiros a puerta = 0 cuando fuera y bloqueados suman todos los
  tiros): se marca con `*` y se explica en una leyenda. Cifras contradictorias (`†`),
  versiones o duplicados que no coinciden (`‡`) y valores no válidos (`§`) son «—» con su
  marca, distintos de una simple ausencia. Sin tarjetas, goles encajados ni «Acciones» (no
  están en estas estadísticas). Correspondencia (clave original de `statistics`):

  | Interfaz | Clave de la fuente |
  |---|---|
  | Minutos | `minutes_played` (o `statistics.minutesPlayed`) |
  | Goles / Asistencias | `goals` / `goalAssist` |
  | Tiros / Tiros a puerta | `totalShots` / `onTargetScoringAttempt` (0 deducido por la API con `shotOffTarget` y `blockedScoringAttempt` explícitos) |
  | xG | `expectedGoals` |
  | Pases / Pases completados | `totalPass` / `accuratePass` |
  | Precisión de pase | calculada por la API: `accuratePass / totalPass`, sólo con ambos y `totalPass` > 0 |
  | Regates / Regates ganados | `totalContest` / `wonContest` |
  | Recuperaciones / Pérdidas | `ballRecovery` / `possessionLostCtrl` |
  | Duelos ganados / perdidos | `duelWon` / `duelLost` |
  | Faltas (cometidas) | `fouls` |
  | Paradas (portero) | `saves` |
  | Valoración de SofaScore | `rating` |

- El detalle ofrece «Ver partido completo», que abre el detalle
  real (`/matches/{id}?view=observed&from=player&player=…`); su «Volver al jugador» regresa
  a la ficha con ese partido seleccionado y su propio origen (equipo o alineaciones de un
  partido real); nunca una ficha de la demostración. El contexto
  tiene un solo nivel: un jugador abierto desde las alineaciones de ese partido vuelve a
  ellas, y de ahí a la lista de partidos. Un retorno o una selección manipulados se
  descartan y se usa un destino interno.
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

En modo real, «Partidos» muestra el calendario y los resultados reales del Real Jaén.

- Si la fuente real falla, error y reintento, nunca los partidos de la demostración.
- Ámbito: esta versión sólo sirve **Primera Federación, Grupo 2** (26/27). Lo decide el
  servicio de datos (`ambito.json` de la API local, que filtra partidos, convocatorias,
  jugadores y secciones de detalle) y lo declara en `GET /api/v1/scope`. El servidor Next
  lo lee en cada consulta de partidos: la lista incluye `competitions` (las del ámbito) y
  un partido fuera de él invalida la respuesta (503), nunca se muestra. Un servicio sin
  `/api/v1/scope` tampoco se usa. Con una sola competición no hay selector: se nombra. Un
  partido excluido (Copa del Rey) no se abre ni por su identificador. El ámbito es una
  lista: otra competición o temporada se añade en `ambito.json`, sin tocar la interfaz.
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
  ficha real; desde ella «Volver» regresa a la
  pestaña «Alineaciones» del partido real. No se consulta ninguna ficha por jugador.
- Un aviso indica que la muestra no es necesariamente un calendario completo.
- Un enlace con `?season=` (temporada sintética) o `?team=` de un equipo sin
  correspondencia muestra un estado explícito con un enlace a los partidos reales del
  Real Jaén; nunca se sustituye el equipo o la temporada sin decirlo.

## Equipos reales desde la API local

En modo real, «Equipos» lee de la API local. La API local debe ser una versión con
`GET /api/v1/teams/{id}/performance` (y `/api/v1/scope`): si está en marcha una anterior,
reiníciala (`python api.py`), porque lee código y datos al arrancar.

- En modo real la página no carga nada sintético: ni competiciones, ni clasificación, ni
  plantilla. La cuadrícula muestra sólo los equipos analizables: correspondencia explícita y
  exportación propia declarada (no acredita un calendario completo). Un rival que sólo
  aparece en partidos ajenos no figura. El Real Jaén sigue siendo el predeterminado y el
  único con escudo; el resto, escudo neutro hasta disponer de un archivo adecuado. Con datos
  importados sin manifiesto no hay equipos analizables: reimporta con `importar.py`.
- La URL guarda lo elegido (`?team=`, `season=`, `tab=players`; `teamsHref`), en modo real y
  sintético: se reemplaza sin recargar ni añadir entradas al historial, así que Atrás desde un
  partido, recargar o abrir el enlace devuelven el mismo equipo, temporada y pestaña. Lo no
  elegido no se escribe (sin `team`, el Real Jaén). Un equipo desconocido o sin exportación
  propia muestra su estado y la URL no se sustituye por la del Real Jaén.
- Competición y temporada son las del ámbito de la API local (`GET /api/v1/scope`). Cada
  entrada (un grupo en una temporada) tiene un id propio derivado del proveedor,
  `sofascore-scope-{tournament_id}-{season_id}` (hoy `sofascore-scope-94191-97382`): estable
  mientras se use esa fuente y nunca relacionado con una temporada sintética. Un `?season=`
  sintético muestra un estado explícito, nunca se sustituye.
- «Rendimiento del equipo» reutiliza la presentación sintética: balance (PJ, V, E, D, GF,
  GC y DG), Casa / Fuera, resultados por jornada, «Rendimiento» (producción y concesión
  por partido, «Temporada» / «Últimos 3») y partidos disputados. Sin clasificación ni
  puntos (no hay datos que los respalden).
- Producción y concesión las calcula el servicio Python sobre los mismos partidos que el
  balance, con el periodo `ALL` de las estadísticas de cada partido (nunca la suma de las
  partes): lo propio del lado del equipo y lo concedido del rival. Goles desde el marcador;
  xG `expectedGoals`, tiros `totalShotsOnGoal`, a puerta `shotsOnGoal`, posesión
  `ballPossession` (media aritmética de los porcentajes) y córners `cornerKicks` (sólo del
  equipo, como en la versión sintética). Cada media es la de los partidos con dato válido,
  con cuántos de cuántos (`*` si es parcial); sin ningún dato, «—», nunca 0. Un valor fuera
  de su dominio (booleano, no finito, negativo, decimal donde va un entero, posesión fuera
  de 0–100), una clave repetida con valores distintos o una sección ausente, vacía o sin un
  único periodo `ALL` no cuentan como dato. «Últimos 3» son los tres partidos contados más
  recientes con fecha (por instante real; a igualdad, por id; nunca por jornada), y sólo
  después se calcula la cobertura. Si las cifras no se pueden leer, se dice y el balance
  sigue visible.
- Los cálculos los hace el servicio Python: sólo partidos del ámbito, finalizados y con
  marcador válido (enteros no negativos; un booleano no lo es). Un finalizado sin marcador
  válido no cuenta, ni como 0–0, y se dice cuántos quedan fuera; los pendientes, tampoco.
  Un finalizado cuyas versiones guardadas se contradicen (estado o identidad del partido,
  según el importador) tampoco cuenta, y también se dice. Un evento que una decisión local
  da por sustituido por otro (`api.py --sustituciones`, ver el README del servicio) no es
  encuentro vigente ni pendiente: se cuenta aparte y se dice; su ficha sigue accesible, avisa
  de que es una decisión local (no un dato de SofaScore) y enlaza al vigente, y la del vigente
  enlaza al sustituido. El servidor Next comprueba que el agregado está en el ámbito y es coherente (estados,
  balance, Casa / Fuera y cada resultado con su marcador); si no, 503.
- Un aviso «Datos reales» dice que son los partidos finalizados observados, cuántos de
  cuántos, y que no es necesariamente la temporada completa. Cero partidos finalizados se
  dice como tal; un error de la fuente, con reintento.
- Los partidos disputados abren su detalle real.
- «Jugadores» muestra los jugadores reales con sus acumulados (ver abajo; su ficha vuelve a
  esta temporada real), nunca la plantilla de la demostración.

### Acumulados de jugadores

En modo real, «Equipos › Jugadores» usa la
tabla original (nombre y posición, PJ, Tit., Min., Goles, Asist., estatura y pierna) con
los acumulados reales de la competición que elige el selector de temporada. La API local
debe tener `GET /api/v1/teams/{id}/player-stats`; si está en marcha una versión anterior,
reiníciala.

- Los calcula el servicio Python (`GET /api/v1/teams/{id}/player-stats`, una petición para
  todas las competiciones del ámbito, con estatura y pierna incluidas; ninguna por jugador)
  sobre los mismos partidos contados que el balance, por equipo y competición-temporada.
  Next lo valida (ámbito, enteros no negativos, cada cifra sobre las convocatorias del
  jugador, totales que cuadran) y si no, 503; la interfaz lo presenta.
- Las reglas de cada convocatoria las aplica el servicio una sola vez
  (`normalized` en `/players/{id}/matches` y en `/matches/{id}/lineups`), así que
  acumulados, ficha (Partidos) y alineaciones dicen lo mismo. Next no las repite. El
  servicio conserva los valores originales y el origen de cada normalizado (ver
  `README.txt` de la API).
- **Participación**: jugó (minutos o `played`; entrada registrada en las incidencias;
  titular de una alineación confirmada), **no utilizado** (suplente sin minutos ni entrada,
  sólo con el resto de banquillo `totalShots`/`statisticsType`, en una alineación confirmada
  cuyas entradas registradas coinciden exactamente con los suplentes con minutos de ese
  lado) o **sin resolver** (una contradicción, estadísticas o incidencias sin entrada, o
  cobertura insuficiente). `totalShots: 0` por sí solo no prueba nada.
- **PJ**: convocatorias en que jugó, sobre las de participación conocida; sólo una
  convocatoria sin resolver la hace parcial. **Tit.**: `substitute` explícito.
- **Min.**: los que informa la fuente, nunca derivados de eventos; un no utilizado suma 0.
- **Goles** y **Asist.**: los de `statistics`; si una actuación con estadísticas
  sustanciales (minutos > 0 y al menos 3 claves individuales) omite `goals` o
  `goalAssist`, cuenta 0 (regla para esta fuente, que omite los ceros: no es un 0 del
  payload). Se contrastan con las incidencias cuando éstas cuadran con el marcador: goles
  normales y de penalti del jugador y `assist1`; el autogol y la tanda no son goles del
  jugador. Si discrepan, la cifra de ese partido queda sin dato y se cuenta como
  contradicción; nunca se suman ni se elige una fuente.
- El equipo es el del lado de la alineación; un `team_id`/`source_team_id` distinto se
  conserva como advertencia, no descarta la convocatoria.
- La regla del 0 no se extiende a xG, valoración, otras estadísticas ni datos personales.
- Toda cifra dice de cuántas convocatorias tiene dato: `*` si es parcial («Dato de X de Y
  convocatorias», «Participación conocida en X de Y convocatorias») y «—» («Sin datos») si
  ninguna. El aviso general recuerda que son los partidos disponibles; los avisos
  concretos sólo aparecen si hay convocatorias sin resolver, contradicciones, duplicados o
  descartes.
- Al ordenar por una cifra, en cualquier sentido: primero las completas, después las
  parciales (cada grupo por su valor) y al final las que no tienen datos. Ni una parcial
  pasa por total ni una ausente por 0.
- El dorsal es el de la última convocatoria observada con fecha (se indica así): no
  necesariamente el actual. No es una plantilla completa ni necesariamente actual.

## Escudos

Los datos de la fuente no traen escudos: ni las exportaciones raw ni el almacén de
`sofascore_scraper` incluyen imágenes ni URL de imagen de los equipos (sólo nombre, `nameCode`
y colores). Por eso un escudo es un archivo local en `public/`, servido por el propio
dashboard; el navegador nunca lo pide a un proveedor.

- `src/features/team-crests.ts` es el único registro: identificador público del equipo → archivo.
  Lo usan todas las vistas reales (Inicio, cuadrícula y cabecera de Equipos, rendimiento, lista
  y detalle de partidos) a través de `observedCrest`. Las vistas sintéticas toman el escudo de sus
  datos.
- Sin entrada en el registro, o si el archivo no carga, `TeamCrest` dibuja el escudo neutro con
  las iniciales.

| Equipo | Archivo | Procedencia |
|---|---|---|
| Los 20 equipos del Grupo 2, 26/27, Real Jaén incluido (ver `team-crests.ts`) | `public/crests/{nombre-del-club}.webp` (150×150 WebP) | Descargados por el analista e importados el 2026-10-23 desde `artifacts/crest-import/` (WebP guardados con extensión `.png`), copiados sin convertir. Cada uno comprobado contra el club que nombra su escudo y el nombre del equipo en la fuente; los filiales llevan el escudo de su club |

El Real Jaén usa el mismo archivo (`public/crests/real-jaen.webp`) en la cabecera, en el modo real
y en la demostración (`data/synthetic/season.json` y su generador). Sustituye al escudo anterior,
`public/real-jaen-crest.png` (recurso del proyecto desde el commit `af3ba28`), ya eliminado.

Para añadir el escudo de un equipo con correspondencia: obtén la imagen de un origen adecuado
(el club o una descarga autorizada; es una marca del club, uso interno), compruébala (tipo,
tamaño y que sea ese club), guárdala como `public/crests/{nombre-del-club}.{png|webp|svg}` (nombre
normalizado del club, nunca su id del proveedor), añade la entrada en `src/features/team-crests.ts`
y anota en esta tabla el origen y la fecha. La aplicación sólo usa `public/`: `artifacts/` es
material local, fuera de Git.

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
| `GET /api/v1/source` | El modo de datos: en modo real `synthetic: false`, «Datos reales» y todas las secciones en `realSections`; en demostración `synthetic: true`, «Demostración · datos sintéticos» y `realSections` vacío. 503 con el motivo si la configuración no es válida |
| `GET /api/v1/competitions` | Competiciones con sus temporadas |
| `GET /api/v1/seasons/{seasonId}/matches?round=&team=` | Partidos, filtrables por jornada y equipo |
| `GET /api/v1/matches/{matchId}` | Ficha: alineaciones, eventos, estadísticas de equipo y jugador |
| `GET /api/v1/matches/{matchId}/observed` | Partido real con sus estadísticas colectivas y el estado de esa sección; 404 para un ID sintético o desconocido, `503 UPSTREAM_UNAVAILABLE` si falla la fuente |
| `GET /api/v1/seasons/{seasonId}/teams` | Equipos con su clasificación |
| `GET /api/v1/seasons/{seasonId}/teams/{teamId}` | Temporada del equipo: partidos, acumulados y plantilla |
| `GET /api/v1/players/{playerId}?season={seasonId}` | Temporada del jugador: ficha, acumulados y partidos |
| `GET /api/v1/teams/{teamId}/players` | Jugadores observados del equipo (sin temporada), con su alcance y procedencia; `503 UPSTREAM_UNAVAILABLE` si falla una fuente real |
| `GET /api/v1/players/{playerId}/profile` | Datos personales de un jugador de la fuente real (sin temporada ni equipo), con alcance y procedencia; 404 si no existe, `503 UPSTREAM_UNAVAILABLE` si falla la fuente |
| `GET /api/v1/players/{playerId}/observed-matches` | Partidos en los que la fuente real registra al jugador, del más reciente al más antiguo, con su posición en el partido y sus estadísticas individuales; lista vacía si no hay, 404 si no existe, `503 UPSTREAM_UNAVAILABLE` si falla la fuente |
| `GET /api/v1/teams/{teamId}/observed-performance` | Resultados del equipo en cada competición del ámbito real (`ObservedTeamPerformance`): recuentos por estado, balance con diferencia, Casa / Fuera y partidos contados; 404 sin correspondencia, `503 UPSTREAM_UNAVAILABLE` si falla la fuente o su agregado no es coherente |
| `GET /api/v1/teams/{teamId}/observed-squad` | Jugadores observados del equipo con sus acumulados en cada competición del ámbito real (`ObservedSquad`); 404 en la demostración o sin correspondencia, `503 UPSTREAM_UNAVAILABLE` si falla la fuente o su agregado no es coherente |
| `GET /api/v1/teams/{teamId}/observed-matches` | Partidos del equipo en la fuente real (calendario y resultados), por fecha, y las competiciones de su ámbito (`competitions`); lista vacía si no hay, 404 sin correspondencia, `503 UPSTREAM_UNAVAILABLE` si falla la fuente |

Los tipos están en `src/contract`; las pantallas usan las funciones de `src/client/api.ts`
(`getSeasonMatches`, `getMatch`…) y nunca construyen URLs. Los errores tienen la forma
`{ error: { code, message } }`, con `BAD_REQUEST` (400), `NOT_FOUND` (404) o
`UPSTREAM_UNAVAILABLE` (503: fuente real no disponible o configuración de datos no válida).
Las rutas de temporada (`/competitions`, `/seasons/…`, `/matches/{id}`, `/players/{id}`)
sólo tienen datos en la demostración.

## Modo demostración (datos sintéticos)

Con `DATA_MODE=demo` la aplicación usa una temporada inventada, para demostraciones y para
las pruebas E2E (que la activan en `playwright.config.ts`). El Real Jaén CF es el club
principal; la competición («Liga de Demostración»), rivales, jugadores, resultados y
estadísticas son ficticios, y la cabecera lo indica con «Demostración · datos sintéticos».
Los datos de prueba que no son de la demostración viven en `tests/` y `e2e/`.

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
