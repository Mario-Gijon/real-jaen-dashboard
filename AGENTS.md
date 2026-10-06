# Instrucciones para agentes

## Propósito

`rj-analyst` es una aplicación independiente para el analista deportivo del Real Jaén CF. Mantenerla deliberadamente pequeña y centrada en necesidades reales del analista.

RealHive es un proyecto anterior: usarlo únicamente como referencia visual/UX cuando se solicite explícitamente. No reutilizar su arquitectura ni modificarlo desde este proyecto.

## Arquitectura

Mantener: `UI → typed client → /api/v1 → DataSource → data source`.

- La UI nunca accede directamente a datos, servidor o proveedor.
- El frontend no conoce Sofascore, BeSoccer ni otros proveedores.
- `/api/v1` es la frontera estable; `DataSource` permite sustituir la fuente sintética por adaptadores futuros.
- Los IDs públicos son propios y estables.
- No introducir base de datos, backend Python, Docker, Redis, workers, scraping, ingest ni autenticación salvo decisión explícita.

## Datos

Actualmente se utiliza `SyntheticSource` y `data/synthetic`.

- Real Jaén puede usar identidad real; jugadores, rivales, resultados y estadísticas son sintéticos.
- Mantener visible el aviso de datos sintéticos.
- Nunca convertir ausencia de dato en cero. Respetar `not_available`, `not_collected` y cobertura `complete/partial/none`.
- No modificar ni regenerar los JSON sintéticos salvo petición explícita.
- No ejecutar `npm run data:generate` salvo autorización explícita.

## Contrato y API

- No ampliar ni modificar contrato/API por conveniencia de una pantalla.
- Si una funcionalidad requiere cambiar contrato, endpoints o `DataSource`, detenerse y explicar primero el impedimento y la propuesta mínima.
- No añadir endpoints sin aprobación. Mantener la API de solo lectura mientras no se indique lo contrario.
- Preferir datos derivados correctamente antes que duplicar información.

## Producto

La navegación principal es **Partidos** y **Equipos**. Los jugadores se alcanzan desde estas áreas y posteriormente mediante `/players/[id]`.

- **Equipos:** análisis longitudinal/de temporada de cualquier equipo y participación/aportación de sus jugadores.
- **Partidos:** análisis detallado de un encuentro.
- **Jugador:** análisis longitudinal individual e historial de acciones.

No convertir la aplicación en una plataforma genérica de scouting ni añadir funcionalidades porque los datos lo permitan. Cada elemento debe justificar una necesidad del analista.

## UX

- Interfaz funcional, compacta y orientada a análisis; priorizar jerarquía, legibilidad e interpretación frente a decoración.
- Evitar proliferación de cards, gráficos decorativos y KPIs sin contexto.
- Objetivos: escritorio **1440 px**, móvil **390 px**.
- No introducir scroll horizontal salvo cuando sea deliberado y funcional.
- Mantener accesibilidad de teclado y foco en componentes interactivos.

## Git y seguridad de cambios

Por defecto:

- Trabajar en la rama actual; no hacer push ni mergear `main` con otras ramas.
- No modificar RealHive ni hacer cambios de producción.
- No hacer commits hasta que la tarea lo solicite explícitamente.
- No descartar, sobrescribir ni revertir cambios locales existentes que no haya creado el agente.
- Preservar y entender los cambios locales previos antes de trabajar sobre ellos.

Cuando se solicite un commit, debe ser pequeño y corresponder únicamente a la tarea acordada.

## Validación

Antes de considerar terminada una implementación, ejecutar según corresponda:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run e2e`

Para cambios visuales importantes, comprobar escritorio a 1440 px y móvil a 390 px. No arreglar fallos ajenos a la tarea sin autorización.

## Forma de trabajo

Cuando una petición sea exploratoria o solicite una prueba visual:

- Hacer el mínimo cambio necesario.
- No convertir automáticamente el prototipo en una decisión definitiva.
- Generar las capturas solicitadas.
- Detenerse para revisión antes de continuar.

Si una petición contiene explícitamente «detente», no continuar con tareas relacionadas aunque parezcan el siguiente paso lógico.
