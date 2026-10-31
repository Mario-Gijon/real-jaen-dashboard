# Instrucciones para agentes

## Propósito

`rj-analyst` es una aplicación independiente para el analista deportivo del Real Jaén CF. Mantenerla deliberadamente pequeña y centrada en necesidades reales del analista.

RealHive es un proyecto anterior: usarlo únicamente como referencia visual/UX cuando se solicite explícitamente. No reutilizar su arquitectura ni modificarlo desde este proyecto.

## Repositorios

Estas instrucciones valen solo para este repositorio. El sistema tiene tres piezas:

- `dashboard` (este): dashboard Next.js, su API `/api/v1`, Dockerfile y scripts de instalación, copia y recuperación.
- `../api`: backend Python (base SQLite, importación, control de actualizaciones, servicio de adquisición). Tiene su propio `AGENTS.md`; léelo antes de cambiar algo allí.
- La orquestación compartida (`../compose.yaml` y overlays) y `.env.docker` viven en la raíz del workspace; la plantilla versionada está en `.env.docker.example`. Ejecuta sus comandos desde esa raíz.
- `sofascore_scraper`: proyecto externo, usado a una revisión fijada con dos commits propios (`../api/docs/scraper-empaquetado-linux.md`). No modificarlo desde aquí.

Documentación: `README.md` (índice), `docs/docker.md` (instalación y operación), `docs/despliegue-servidor.md` (servidor del grupo), `docs/contrato-actualizaciones.md` (botón «Actualizar»).

## Arquitectura

Mantener el flujo: `UI → cliente HTTP tipado → BFF Next.js (/api/v1) → DataSource → adaptador → servicio de datos`.

- La UI nunca accede directamente a datos, servidor o proveedor.
- El frontend no conoce Sofascore, BeSoccer ni otros proveedores.
- `/api/v1` es la frontera estable. `DataSource` tiene dos adaptadores: `local-api` (modo real, el backend de `api`) y `synthetic` (demostración).
- `src/app` contiene las páginas y el BFF `/api/v1`; `src/features`, las áreas de negocio; `src/ui`, los componentes visuales compartidos; `src/client`, el cliente HTTP tipado.
- `src/server` contiene autenticación, selección de fuente y adaptadores; `src/contract`, los contratos públicos; `src/lib`, utilidades puras compartidas; `src/hooks`, hooks de cliente reutilizables.
- `src/lib` no depende de features, UI, cliente ni servidor. `src/hooks` puede usar el cliente, pero no debe depender de features ni UI.
- La API deportiva es un servicio independiente. El futuro servicio de vídeo también se integrará como servicio independiente mediante su propia API REST; no implementarlo ni añadir código hipotético antes de una petición concreta.
- Los IDs públicos son propios y estables.
- Ya decididos e implementados: backend Python con SQLite, Docker Compose como instalación habitual, adquisición desde SofaScore en un servicio aislado y acceso con contraseña compartida (`src/proxy.ts`, `src/server/auth`). No introducir otros (Redis, workers, otra base, otro proveedor, identidades de usuario) salvo decisión explícita.

## Datos

`DATA_MODE` decide los datos de todo el dashboard (README, «Modo de datos»):

- `real` (por defecto): datos reales servidos por el backend. Nunca sustituirlos por sintéticos ante un error.
- `demo`: temporada inventada de `data/synthetic`, con el aviso de datos sintéticos siempre visible.
- Nunca convertir ausencia de dato en cero. Respetar `not_available`, `not_collected` y cobertura `complete/partial/none`.
- No modificar ni regenerar los JSON sintéticos salvo petición explícita. No ejecutar `npm run data:generate` salvo autorización explícita.
- Los datos reales, bases, copias, perfiles de navegador y secretos viven fuera de Git (volúmenes Docker y carpetas de la instalación). No modificar la base activa, los volúmenes ni los servicios en marcha sin autorización; nunca consultar SofaScore ni pulsar «Actualizar» sin autorización expresa.

## Contrato y API

- No ampliar ni modificar contrato/API por conveniencia de una pantalla.
- Si una funcionalidad requiere cambiar contrato, endpoints o `DataSource`, detenerse y explicar primero el impedimento y la propuesta mínima.
- No añadir endpoints sin aprobación. Los datos deportivos son de solo lectura. Las únicas escrituras aprobadas son la sesión (`/api/v1/session`) y las actualizaciones (`POST /api/v1/updates` y su cancelación), definidas en `docs/contrato-actualizaciones.md`.
- Preferir datos derivados correctamente antes que duplicar información.
- Secretos (contraseña, secreto de sesión, tokens): solo en archivos montados, nunca en Git, imágenes, logs, navegador ni informes.

## Producto

La navegación principal es **Inicio**, **Partidos** y **Equipos**. Los jugadores se alcanzan desde estas áreas y posteriormente mediante `/players/[id]`.

- **Equipos:** análisis longitudinal/de temporada de cualquier equipo y participación/aportación de sus jugadores.
- **Partidos:** análisis detallado de un encuentro.
- **Jugador:** análisis longitudinal individual e historial de acciones.

No convertir la aplicación en una plataforma genérica de scouting ni añadir funcionalidades porque los datos lo permitan. Cada elemento debe justificar una necesidad del analista.

Drill-down analítico: los datos agregados deben conducir a sus partidos, jugadores y acciones cuando los datos disponibles lo permitan. Los clips son evidencia asociada a acciones, no una sección independiente. No mostrar placeholders de vídeo no disponible.

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

No arreglar fallos ajenos a la tarea sin autorización.

### Revisión visual

En cambios de interfaz, revisar visualmente con capturas (Playwright u otra automatización de navegador) a 1440 px y 390 px, sin pedir autorización cada vez. Los tests E2E no sustituyen esta revisión.

- Comprobar alineación, espaciados, textos cortados o desbordados, scroll horizontal, superposiciones, responsive, estados seleccionados/desplegados y coherencia con el resto del dashboard.
- Corregir solo errores visuales evidentes causados por la tarea; proponer, sin implementar, cualquier mejora de diseño subjetiva.
- Guardar las capturas fuera del repositorio (o en `artifacts/`, siempre fuera de Git). No modificar el proyecto solo para generarlas.
- En el informe: resoluciones, pantallas y estados revisados, problemas detectados, correcciones y puntos para revisión manual. Si no se ha podido capturar, decirlo; no presentar tests como revisión visual.

## Forma de trabajo

Cuando una petición sea exploratoria o solicite una prueba visual:

- Hacer el mínimo cambio necesario.
- No convertir automáticamente el prototipo en una decisión definitiva.
- Generar las capturas solicitadas.
- Detenerse para revisión antes de continuar.

Si una petición contiene explícitamente «detente», no continuar con tareas relacionadas aunque parezcan el siguiente paso lógico.
