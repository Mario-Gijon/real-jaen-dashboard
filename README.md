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
| `scripts` | Utilidades de desarrollo, como el generador de datos sintéticos |

**Frontera:** la interfaz nunca importa `src/server` ni `data/`. Lo impide
ESLint (`no-restricted-imports`) y lo comprueba `src/architecture.test.ts`.
Sin base de datos, Docker, workers ni autenticación.

## Independencia de la fuente de datos

El contrato describe lo que necesita el analista. Una fuente nueva (una API
deportiva, datos del club, vídeo, archivos importados…) es un adaptador que
implementa `DataSource` y devuelve tipos del contrato; las pantallas no cambian.

Las métricas distinguen siempre tres casos y nunca convierten una ausencia en cero:

- `{ "value": 0 }`: valor real;
- `{ "value": null, "reason": "not_available" }`: la fuente no lo ofrece o no aplica;
- `{ "value": null, "reason": "not_collected" }`: debería existir y aún no se ha recopilado.

## Datos sintéticos

En desarrollo la aplicación usa una temporada inventada (`DATA_SOURCE=synthetic`,
valor por defecto). El Real Jaén CF es el club principal; rivales, jugadores,
resultados y estadísticas son ficticios, y la interfaz lo indica con el aviso
«Datos sintéticos».

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
