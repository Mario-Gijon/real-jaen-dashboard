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
| `GET /api/v1/source` | Si los datos son sintéticos (metainformación de la app) |
| `GET /api/v1/competitions` | Competiciones con sus temporadas |
| `GET /api/v1/seasons/{seasonId}/matches?round=&team=` | Partidos, filtrables por jornada y equipo |
| `GET /api/v1/matches/{matchId}` | Ficha: alineaciones, eventos, estadísticas de equipo y jugador |
| `GET /api/v1/seasons/{seasonId}/teams` | Equipos con su clasificación |
| `GET /api/v1/seasons/{seasonId}/teams/{teamId}` | Temporada del equipo: partidos, acumulados y plantilla |
| `GET /api/v1/players/{playerId}?season={seasonId}` | Temporada del jugador: ficha, acumulados y partidos |
| `GET /api/v1/teams/{teamId}/players` | Jugadores observados del equipo (sin temporada), con su alcance y procedencia; `503 UPSTREAM_UNAVAILABLE` si falla una fuente real |
| `GET /api/v1/players/{playerId}/profile` | Datos personales de un jugador de la fuente real (sin temporada ni equipo), con alcance y procedencia; 404 si no existe, `503 UPSTREAM_UNAVAILABLE` si falla la fuente |

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
