# Propuesta del botón «Actualizar»

> Estado 28-10-2026: la descarga real funciona con el flujo normal del scraper también en el contenedor de
> adquisición, y el servicio interno con su overlay de Compose publica por el coordinador (orden del backend, sin
> botón todavía; ver [docker.md](docker.md), «Adquisición»). Estado vigente y pendientes:
> [../../api-real-jaen/docs/adquisicion-sofascore.md](../../api-real-jaen/docs/adquisicion-sofascore.md).

Estado: orientación y primera entrega interna con fixtures aprobadas. Consolidación del 26-10-2026.
El botón, la red, el scraper y los contratos públicos de esta propuesta **no están implementados**.
La especificación concreta figura debajo; detalles en
`../api-real-jaen/docs/coordinador-fixtures.md`. No se consultó SofaScore ni se modificaron
configuración local, datos activos o servicios. Revisión final del 26-10-2026.

## Primera entrega autorizada: especificación cerrada antes de codificar

Este apartado sustituye el orden de confirmación del diseño exploratorio de la sección 5.
Se implementa exclusivamente una biblioteca interna SQL con fixtures locales, sin conectar
api.main ni Compose: control habitual deshabilitado por ausencia de cualquier punto de entrada.
No hay red, endpoints, scraper, interfaz ni reanudación automática de trabajos.

**Invariantes:** un propietario mantiene el bloqueo original por ruta en un mismo hilo desde
antes de reconciliar hasta cerrar; como máximo un trabajo pendiente/activo en journal SQLite
separado, FULL synchronous y transacciones breves. Las solicitudes se deduplican mientras haya
activo. Principal y candidata nunca comparten conexiones abiertas al restaurar. Las generaciones
son objetos publicados que no se mutan; cada lector captura una referencia y la conserva.

**Punto exacto de confirmación:** COMMIT del journal que, en una sola transacción, marca el
trabajo completed y actualiza generación, huella del principal, código y ámbito confirmados.
Se ejecuta con la puerta de captura de lectores cerrada, después de restaurar/verificar el
principal y preparar la instantánea. Inmediatamente después se intercambia la referencia y
se abre la puerta. Lectores antiguos conservan su referencia; nuevos esperan ese tramo breve.
Si muere después del COMMIT y antes del intercambio, al arrancar se carga la base confirmada,
sin revertir. Un error posterior al COMMIT no convierte un trabajo confirmado en fallido.

Orden durable: (1) registrar queued y sus entradas; (2) congelar fixtures; (3) copia B verificada
y registrar su ruta/huella antes de modificar cualquier principal; (4) copiar candidata C e
importar transaccionalmente con funciones existentes; (5) verificar y cargar N, comprobar JSON;
(6) journal publishing con B, hash anterior y esperado, antes de promover; (7) restaurar C en
principal, verificar equivalencia y cerrar conexiones; (8) cerrar puerta, confirmar journal y
cambiar referencia; (9) abrir puerta. No se adelanta completed ni se modifica principal antes
de disponer de B. Copias/candidata/fixtures se conservan, incluso en fallo; no hay limpieza.

Reinicio: queued/preparing sin publishing se marca interrupted sin importar. publishing o
recovering sin confirmación siempre restaura B y verifica su huella antes de servir. Si B
falta/no es válida, o falla restauración/journal, se bloquea el control y el arranque no sirve
una base ambigua. completed implica validar huella/código/ámbito y cargar esa generación.
Si COMMIT devolvió error ambiguo, releer journal antes de decidir: si completed, conservar N;
si no se puede leer, bloquear sin intentar otra escritura ni declarar recuperación completa.
En ese caso también se bloquean nuevas capturas antes de abrir la puerta de confirmación;
las referencias antiguas ya entregadas siguen utilizables hasta que el llamante las libere.

**Única vía de promoción/recuperación:** sincronizacion.restaurar (que usa sqlite.restaurar).
No os.replace propio, no copiar principal a mano, no borrar WAL/SHM. Recuperación usa esa misma
función con B y coteja la descripción completa. Un rollback SQL no deshace COMMIT de C.
El trabajo fallido permanece en journal; la evidencia de C no desaparece al restaurar B.

**Cambios de reglas:** además de comprobar versiones y sincronización en seco, persistir
sha256_agregada de carga.referencia_del_codigo (todos sus archivos, no el commit de Git ni
solo rule_set.version) y hash del ámbito. Compararlos al arrancar, antes y después de preparar
y publicar. En primera apertura exigir huella de código conservada en una ejecución deportiva
confirmada: si no puede acreditarse, rechazar, sin aceptar una línea base silenciosa. Cambios
de código o ámbito requieren mantenimiento explícito y una futura política de adopción; no
reconstruir ni migrar automáticamente. La detección es conservadora: también rechaza cambios
de código sin efecto deportivo. Los fixtures se cargan después de crear este módulo.

**Disco:** exigir mismo sistema de archivos para trabajo y principal. Preflight conservador:
12 veces (tamaño principal + diarios + entradas) más reserva fija configurable (64 MiB por
defecto), para B, C, copias internas de importación/restauración y WAL. No es cota matemática
de expansión: SQLite y JSON pueden crecer más. No reservar espacio no equivale a garantizarlo.
Ante ENOSPC antes de publishing: principal intacto, trabajo fallido si journal puede escribir;
si tampoco puede, queda activo durable para reconciliación al reiniciar. Durante publishing:
no arrancar nuevos trabajos; recuperar B si es posible. Si falta espacio para restaurar o
registrar recuperación, recovery_required y error explícito, sin borrar evidencia para ganar
sitio. El administrador deberá liberar espacio fuera de estos archivos y reabrir para recuperar.
SQLite FULL cubre cierre/terminación del proceso con almacenamiento que respete fsync; no se
promete resistencia a pérdida de alimentación, corrupción del disco o filesystem no conforme.

Validación final propia (26-10-2026): 13 pruebas focalizadas correctas en Windows y las mismas
13 en Linux sin red; suite completa de API 238 pruebas con SQL (2 omitidas) y sin dependencias
SQL (91 omitidas), ambas correctas. Incluyen 11 fronteras de terminación abrupta/reapertura,
concurrencia, confirmación ambigua e ilegible, disco lleno y conservación de datos/respuestas.
Los resultados y límites detallados están en el documento del backend, incluido el protocolo
de respaldo coherente de base y journal bajo bloqueo. La aprobación no habilita integración
HTTP, peticiones reales ni el resto de esta propuesta exploratoria.

## 1. Lo que hay y lo que falta

Fuentes revisadas, relativas a los tres repositorios hermanos:

| Componente | Evidencia actual e implicación |
|---|---|
| rj-analyst (`c786fff`) | `compose.yaml`, Dockerfile, `src/server/data-source.ts` y `src/server/local-api/local-api-source.ts`: Next real llama a backend:8001; navegador usa /api/v1; demostración explícita y separada. El adaptador contiene las correspondencias de los 20 equipos y una caché de nombres de una hora |
| api-real-jaen (`f8386a3`) | `api.py`: GET sobre un objeto `datos` cerrado por los handlers; `datos_de_sql` toma el bloqueo antes de cargar y lo conserva hasta salir. SQLite se cierra después de cargar. No existe coordinador de actualización ni publicación dinámica |
| Persistencia | `sincronizacion.importar_evidencia`: copia previa, transacción con evidencia y sincronización, verificación interna, historial e IDs conservados; registra fallo aparte. `verificar` comprueba integridad/coherencia y diferencia en seco. `lectura.cargar_desde_base` construye la instantánea; `sqlite.restaurar` prepara, verifica y reemplaza bajo exclusividad |
| Scraper instalado | Tercer repositorio `sofascore_scraper/sofascore_scraper`, rama `real-jaen/follow-next-pages`, HEAD `611e436a1528b0f487aa56a045f023e8ae8ae098`, versión 3.1.0. Tiene un cambio local ajeno en frontend/package-lock.json; no debe incluirse automáticamente en una imagen de entrega |
| Scraper, planificación | `services/follow_sync.py`, `planning.py`, `listing.py`, `refresh.py`, `cli/commands/sync.py`: seguimientos, caché persistente, trabajo full/refill/refresh, cancelación, errores parciales, paginación next corregida. Exportación raw, events y player_profiles en `cli/commands/export.py` |
| Scraper, transporte | `client/transport.py`, `client/bridge.py`, `client/profile_lock.py`: límites/reintentos, Retry-After, cortacircuitos, bloqueo del perfil y puente de navegador headless con Scrapling/patchright. Son mecanismos del scraper, no garantías de acceso al proveedor |
| Docker actual | Solo frontend y backend; backend instala requirements-sql.txt. **No incluye scraper, Chromium ni sus bibliotecas**. /imports es RO y /state persistente; no hay socket Docker en servicios |
| Docker del scraper | Existe Dockerfile propio con Python, constraints, instalación de Chromium mediante patchright, bibliotecas del sistema, tini y perfil persistente. También construye su propia UI/servidor, innecesarios para este botón. Sus imágenes base no están fijadas con la misma precisión que las nuestras |

El README del backend aún cita un commit previo del parche de paginación; el código y HEAD
instalados son posteriores. El alcance de `ambito.json` es competición/temporada, **no una
lista de equipos**: unique_tournament 17073, tournament/grupo 94191, season 97382 (26/27).
No se debe deducir que cualquier seguimiento preexistente del scraper pertenece al ámbito.

## 2. Elección mínima y responsabilidades

**Actualización de diseño del 26-10-2026:** la opción de adquisición embebida queda superada
por [el servicio de adquisición separado](propuesta-servicio-adquisicion.md), cuyo diseño
está autorizado pero no integrado. Compose sigue teniendo solo sus dos servicios actuales.
La propuesta futura añade acquisition con caché/perfil propios y sin volumen deportivo;
backend sigue siendo el único propietario de SQLite, journal, importación y publicación.
El motivo es aislar cualquier política específica que necesite el sandbox del navegador,
sin relajar el backend. No se ha encontrado incompatibilidad de dependencias Python.

No añadir la UI del scraper, Redis, cola o servicio de control Docker. No montar socket
Docker, ejecutar comandos desde Next ni detener contenedores para publicar. La interfaz
interna propuesta entrega exportaciones inmutables por HTTP y no acepta comandos arbitrarios.

Flujo: **UI → cliente tipado de actualización → /api/v1/updates de Next → servicio de
actualización del servidor → API interna backend → coordinador → acquisition / importador**.
El scraper permanece dentro de acquisition; únicamente el importador opera la base del backend.
El nuevo servicio de control es hermano del DataSource de lectura; no se añaden métodos de
escritura a cada fuente deportiva. Los identificadores y respuestas públicas no exponen al
proveedor. La UI nunca conoce rutas de archivos ni ejecutables. Todo cambio de contrato
descrito aquí necesita aprobación antes de implementarlo.

## 3. Qué significa consultar los 20 equipos

Configuración de adquisición versionada: 20 IDs externos cotejados con las correspondencias
existentes, ámbito, secciones y política de refresco. Validar que son exactamente 20 equipos
distintos y registrar su huella en cada trabajo. No derivarlos solo de quienes tengan datos
descargados; no sincronizar seguimientos ajenos. Deduplicar partidos compartidos por dos equipos.
Un cambio de temporada/plantilla del ámbito es configuración deliberada, no descubrimiento
silencioso. La normalización continúa exclusivamente en api-real-jaen.

Propuesta de política deportiva inicial, que debe concretarse con el analista:

1. Sincronizar los 20 seguimientos de equipo y la lista/calendario de la competición-temporada.
   Recorrer next y last según el scraper; complementar con calendario por jornadas para
   incorporar encuentros que todavía no tienen /event raw. Exportar tanto raw como events
   normalizados para `--calendario`; no perder pendientes por no estar en raw.
2. Reutilizar sus selecciones de secciones y planificación full/refill para partidos nuevos,
   recién finalizados, pendientes cambiados y secciones incompletas. Pedir solo lo necesario
   para las pantallas actuales (evento, alineaciones, estadísticas e incidencias disponibles),
   sin añadir cuotas, live continuo u otros deportes. Un partido futuro no exige estadísticas.
3. Mantener la política existente de refresco de /event: ventana por defecto 72 h desde el
   inicio y mínimo 6 h entre observaciones. La nueva lista puede marcar un evento como stale
   por estado, marcador o fecha aunque sea antiguo. **Esto no revisa por sí solo todas las
   estadísticas/alineaciones ya completas**, ni detecta toda corrección histórica.
4. Para cubrir esas correcciones: proponer revisión de las secciones deportivas de encuentros
   finalizados en los últimos 7 días, si han pasado 6 h desde su consulta; más una ronda rotatoria
   de hasta 20 partidos antiguos por actualización, pendientes de auditoría a partir de 7 días.
   Persistir el cursor y la última consulta por sección. Se conserva un presupuesto total de
   peticiones/tiempo; lo no recorrido se informa como pendiente planificado, no revisado hoy.
   Esos valores son propuesta, no comportamiento actual. El adaptador deberá expresar una
   reconsulta selectiva mediante el transporte existente: **no existe una opción genérica
   verificada de CLI que fuerce todo esto**. No reutilizar `ssc refresh` como si refrescara
   todas las secciones: solo vuelve a consultar /event. Probar esta extensión primero offline.

Caché: persistir el Store/catálogo del scraper y perfil entre trabajos, no reconstruirlos
en cada clic. Según el código, listas de temporadas y jornadas incompletas tienen TTL de
6 h y calendario 15 min; jornadas completas pueden omitirse. Los seguimientos de equipo
vuelven a listar, con sus límites. Registrar si se reutilizó caché y su fecha original:
«consultado ahora» no significa que cada payload se descargó ahora. No falsear fetched_at
ni invalidar toda la caché para dar apariencia de frescura. Un clic inmediato puede acabar
sin cambios, explicando cuándo vence la siguiente revisión.

Límites observados: last hasta 5 páginas; next hasta 10. next informa page_limit,
repeated_page y errores como parcial. El bucle last no prueba por sí solo haber recorrido
una temporada larga si agota su ventana: el manifiesto debe verificar cobertura y señalar
truncamiento; la lista de competición-temporada permite contrastarla. No anunciar «20/20»
si una paginación quedó sin demostrar. No ampliar límites ni saltarse rechazos automáticamente.

### Fichas personales, por separado

No crear 532 seguimientos ni descargar todas las fichas en cada actualización. El scraper
tiene `fetch player --ids-file`, sin descargar partidos: omite fichas válidas ya guardadas;
`--refresh` fuerza solo los IDs dados; errores se reintentan y los 404 tienen su propia política.

Propuesta: nuevos jugadores sin ficha primero, después hasta 10 fichas conocidas por trabajo
si tienen más de 30 días (cola rotatoria persistente); reintentos/404 respetan el scraper y
el presupuesto, sin reintentar indefinidamente. El refresco periódico requiere seleccionar
los IDs explícitamente; no suponer un TTL de fichas que el CLI no tiene. Exportar únicamente
las fichas obtenidas/seleccionadas con evidencia y fecha originales. Nulos no borran atributos
conocidos; las fichas no acreditan pertenencia al equipo. El enriquecimiento personal no
bloquea una publicación deportiva correcta, pero un fallo deja estado **parcial**, con
«datos deportivos publicados; fichas pendientes». La fecha deportiva y la cobertura de
fichas son campos distintos. Acordar este carácter opcional antes de implementar.

## 4. Trabajo, progreso, reanudación y descarga parcial

Un solo trabajo activo para esta instalación/base; no una cola ilimitada. UUID opaco,
petición idempotente y restricción transaccional en el registro de trabajos. Una segunda
pulsación, otra pestaña o usuario autorizado recibe el mismo trabajo activo. Un Idempotency-Key
repetido devuelve el mismo resultado incluso si ya terminó, durante una retención acordada.
Ni polling ni refrescar la página crean trabajo. Límite entre trabajos y Retry-After ante
presupuesto/cooldown; no repetir automáticamente un fallo de acceso a SofaScore.

Registro separado `jobs.sqlite` (operación, no estado deportivo): trabajo, fases, timestamps,
cancelación solicitada, contadores, manifiesto/hash, versiones de herramientas/políticas,
base y generación inicial, copia previa, candidata y fases de publicación. No añadir estas
filas de progreso al esquema deportivo 0004 ni usar import_run como sustituto de la cola.
Escrituras del registro breves y serializadas; transacciones y restricción de un activo,
no un booleano solo en RAM. La exclusión OS de la base evita dos instancias coordinadoras.

Fases internas: queued, downloading, validating_download, preparing_candidate, importing,
verifying, preparing_publication, publishing, recovering y terminal. Resultado separado de
la fase: completed, partial, failed, cancelled. Progreso por fase, equipos n/20, partidos
resueltos/descubiertos y solicitudes realizadas; el total puede crecer al paginar. No inventar
porcentaje estable o ETA. Error público con código y mensaje útil; trazas completas y rutas
solo en logs privados asociados al UUID.

Cada ejecución conserva directorio propio con manifiesto sellado, ficheros originales,
huellas, origen/fecha de cada sección, caché usada, cobertura, errores, límites y exportaciones.
Los listados de seguimiento no se conservan íntegramente por defecto en el scraper: para
demostrar cobertura se deben capturar sus respuestas/resultado en la frontera de adquisición,
sin inventar otra normalización. Congelar evidencia satisfactoria **antes** de reintentar;
no dejar que una nueva exportación del caché sustituya la evidencia de un intento previo.
Exportar solo después de finalizar/parar el único escritor del Store, pues export no toma
un bloqueo de descarga. Validar esquema y manifiesto, no solo exit code o existencia de fichero.

Política mínima de importación propuesta:

- Si falla una descarga/lista/sección deportiva requerida, hay bloqueo o cobertura truncada:
  **partial sin importación ni publicación**; se conserva lo obtenido y sigue sirviéndose la
  generación anterior. Si no hay evidencia utilizable o falla infraestructura: failed.
- Conservar caché y parciales para reanudar. Un reintento es un nuevo intento enlazado al
  anterior; revalidar frescura, ámbito y cobertura del conjunto antes de sellarlo. Nunca
  considerar completo el último export simplemente porque contiene datos antiguos válidos.
- Ausencia explícita confirmada por el scraper, sección no aplicable o espera normal por
  partido futuro no equivalen a error de transporte; se explican en cobertura. Un error,
  timeout o payload ilegible no se transforma en ausencia ni en cero. La política existente
  de confirmación de «sin datos» continúa vigente.
- Fichas opcionales fallidas permiten publicación deportiva y estado partial, con
  `published=true`; el caso deportivo incompleto tiene `published=false`. No existe botón
  «importar de todos modos» en la primera versión. Cualquier política futura de publicación
  deportiva parcial requerirá aprobación y pruebas propias.

## 5. Bloqueo y publicación coherente

**Especificación vigente:** la primera entrega descrita al principio y
`api-real-jaen/docs/coordinador-fixtures.md` prevalecen sobre esta exploración. La confirmación
durable sucede ANTES del intercambio de referencia, con la puerta de capturas cerrada.
Los apartados de HTTP/frontend de esta sección son únicamente diseño futuro, no comportamiento
implementado ni una alternativa autorizada al protocolo vigente.

### Un propietario, sin ventana desprotegida

Conservar el mismo bloqueo exclusivo por ruta normalizada durante toda la vida del backend,
incluidas descarga, importación y recuperación. Las herramientas externas continúan rechazadas.
No liberar el descriptor entre lectura y escritura, ni poner un permiso global que omita el
bloqueo. El kernel conserva la liberación por muerte del propietario; el archivo .lock permanece.

El coordinador es el **mismo hilo propietario** que adquirió ese bloqueo antes de cargar;
atiende una cola serial de operaciones, mientras el HTTP sirve en otro hilo y sus handlers.
Esto importa: `bloqueo.py` permite reentrada por proceso **e hilo**, no desde cualquier worker.
Las llamadas al importador/verificador se ejecutan en ese hilo propietario, con los decoradores
existentes; no crear un subprocess de importación contra la base activa que chocaría con la API.
El servicio acquisition no tiene ese papel ni comparte descriptores del backend; sus hijos
pertenecen a su propio proceso/almacenamiento. No se heredan bloqueos deportivos entre servicios.

### Preparar fuera de la base vigente

1. Descargar manteniendo la instantánea G disponible. Tras sellar evidencia, tomar copia
   consistente verificada B de la base vigente y registrar G, huella y B. Reservar espacio
   para B, candidata, copia de importador y restauración; si no cabe, abortar antes de escribir.
2. Crear candidata C desde B por el mecanismo SQLite existente, en el mismo almacenamiento.
   Importar **una vez** todo el manifiesto aceptado en C con `importar_evidencia`: reutiliza
   evidencia/identidades/selecciones/decisiones locales y su transacción, sin reglas duplicadas.
   El importador conserva además su copia previa de C. No reconstruir una base vacía desde
   los últimos raw: se perderían historial, decisiones e identidades.
3. Verificar C, integridad/revisión/coherencia, IDs/decisiones y cargar una nueva instantánea
   N mediante `cargar_desde_base`; validar que se puede serializar y atender los endpoints
   necesarios. Calcular el resumen real de cambios; nuevas observaciones sin cambios deportivos
   no son «cero consultas». Hasta aquí el principal sigue siendo G aunque C ya hizo COMMIT.
4. Registrar duraderamente `publication_prepared` con B, C, huella anterior/nueva y generación.
   Cerrar conexiones de C y producir imagen consistente finalizada. Promover sobre la misma
   ruta activa usando el procedimiento seguro de restauración, con bloqueo vigente: staging,
   copia anterior, integración WAL, cierre y reemplazo atómico. No usar copyfile sobre una
   base activa ni retirar WAL/SHM por cuenta del coordinador. Verificar principal promovido
   y correspondencia con N antes del intercambio de referencia.
5. Cerrar la puerta de nuevas capturas; confirmar en UNA transacción del journal el resultado
   completed y la generación/huella/código/ámbito; intercambiar la referencia a N sin mutar G
   y abrir la puerta. Ese COMMIT es la confirmación durable. Una publicación sin cambios puede
   confirmar una nueva generación, pero no inventar cambios deportivos. Este orden sustituye
   la propuesta inicial de intercambiar primero y registrar después, que queda retirada.

El coste de copiar una base pequeña es preferible inicialmente a introducir una familia de
bases activas y un nuevo mecanismo de mantenimiento. El detalle de adaptación de la restauración
existente y su comprobación adicional de archivos abiertos debe probarse en Windows y Linux.

### Peticiones en curso y caché de Next

Cada GET captura `(generación, datos)` una sola vez al entrar; una petición ya iniciada acaba
con G aunque se publique N, y las nuevas usan N. G se libera cuando no queden referencias.
El intercambio no espera las descargas ni cierra conexiones HTTP. Un objeto publicado no
se modifica en sitio. Evitar un mutex durante cálculos o serialización largos.

Una pantalla puede efectuar varias peticiones: la atomicidad por GET no basta para asegurar
una pantalla entera de la misma generación. Proponer encabezado de generación en respuestas,
reenviado por Next, y reintento acotado de la carga agregada si mezcla generaciones; el
adaptador Next debe capturar/reintentar también sus múltiples consultas internas. No prometer
coherencia global entre peticiones sin ese control. Después de confirmar, invalidar cachés
de consultas y `router.refresh`; revisar expresamente la caché de nombres de equipo (1 h),
que debe quedar ligada a generación o invalidarse. Polling del trabajo no refresca continuamente
toda la pantalla. /health conserva su contrato actual.

### Fallos después del COMMIT y reinicio

| Punto de fallo | Resultado y recuperación |
|---|---|
| Descarga/export/manifiesto | G y principal intactos; parciales conservados; no importar |
| Importar C | Rollback deportivo en C, posible auditoría failed; G intacta; B/evidencia conservadas |
| COMMIT de C, pero carga/verificación de N fallida | C no se publica; **no es un rollback de aquel COMMIT**; se descarta como candidata operativa y conserva evidencia de fallo |
| Promoción de principal o publicación posterior fallida | Mantener G en RAM, bloquear nuevas actualizaciones y restaurar B con el procedimiento seguro; verificar principal y conservar candidata comprometida/evidencia. No reimportar a ciegas |
| Restauración de B fallida | recovery_required: nuevas capturas y escrituras bloqueadas; referencias G ya entregadas siguen utilizables. Tras reinicio no cargar una base ambigua; resolver con B/journal o no servir deporte. No anunciar éxito por /health |
| Muerte después del reemplazo, antes de confirmar trabajo | El journal obliga a recuperación antes de cargar/servir deporte. Política conservadora: restaurar B y marcar intento interrumpido, aunque principal coincida con N. No publicar silenciosamente una importación sin confirmación durable |
| Journal dice confirmado pero respuesta al cliente se perdió | El GET recupera resultado por UUID; arrancar desde principal verificado y generación confirmada, sin repetir importación |

El registro durable es el punto de confirmación y precede al intercambio. La puerta impide
que una captura nueva observe el intervalo entre ambos. Si muere después del COMMIT, el
reinicio conserva N; no se restaura B por no haber llegado al intercambio en RAM. Si no se
puede determinar el resultado del COMMIT, se bloquean capturas y escrituras hasta reconciliar.
Si la confirmación existe pero falla notificar al navegador, no se revierte por ese fallo.
Queda retirada la alternativa exploratoria de publicar en RAM y deshacer después una respuesta
ya enviada. La reconciliación distingue las huellas de B/C/principal y conserva conflictos.

Inicio: adquirir bloqueo, reconciliar journal/publicación, validar la base y cargar la última
generación confirmada, después servir deporte. Un queued/downloading interrumpido queda
interrupted recuperable (presentado como fallido/interrumpido), sin reanudar peticiones reales
automáticamente. El usuario puede reintentar reutilizando evidencia/caché. El trabajo y su
progreso sobreviven al contenedor; no depende de PID o booleanos en RAM.

Cancelar: durante descarga pedir cancelación cooperativa a acquisition; ese servicio cierra
su scraper/navegador y espera a sus hijos, con timeout propio y conservando parciales. Backend
no recibe un PID remoto ni ejecuta comandos para terminarlos. Antes de promoción,
descartar candidata operativa. Durante restauración/intercambio no cortar ni matar al dueño:
devolver conflicto «confirmando datos; espera» y acabar publicación o recuperación. Cancelación
no equivale a deshacer un trabajo ya confirmado. SIGTERM del contenedor drena el tramo crítico
con tiempo de gracia; SIGKILL se resuelve por journal al reiniciar.

## 6. Docker, navegador y acceso de escritura

Tres servicios propuestos (solo dos implementados), rutas internas configurables y revisión del scraper fijada desde una tercera
fuente de build o paquete de entrega inmutable. No montar el checkout instalado del anfitrión.
Actualizar la entrega documentada para incluir esa fuente/imagen; el scraper no aparece por
tenerlo instalado en Windows. Dependencias exactas con constraints, base por digest y sin
arquitectura forzada; comprobar compatibilidad del paquete editable y recursos locales del scraper
(pyproject/locales) en imagen, no asumir que copiar solo su carpeta Python funciona.

| Servicio/almacenamiento | Acceso mínimo propuesto |
|---|---|
| frontend | Sin volúmenes de datos; URL backend por nombre de servicio; secreto interno de control RO si se adopta; puerto/proxy configurable |
| backend /state | RW: principal, .lock, copias, candidatas y journal de trabajos en subdirectorios separados; UID/GID interno sin root |
| acquisition /acquisition | Volumen propio RW: Store/caché, perfil exclusivo y exportaciones; sin montaje de /state, journal ni copias del backend |
| configuración | Ámbito/20 equipos/política en imagen o montaje RO; secretos en archivos de secrets, no en imagen ni ejemplo .env |
| /imports actual | Mantener RO para mantenimiento manual/primera instalación; el botón no intenta escribir ahí |

El proceso de adquisición recibe solo configuración fijada y no tiene montaje ni acceso
al volumen deportivo. La interfaz entrega un bundle validable, no una ruta arbitraria o un
volumen RW compartido con el backend. El coordinador conserva su autoridad exclusiva.
Copias/exportaciones y datos personales requieren retención, cuota y acceso restrictivo.
No borrar B ni evidencia de un trabajo ambiguo por una limpieza automática.

El puente existente usa Chromium headless; **no necesita una sesión de escritorio Windows**.
El empaquetado Linux ya se construyó y las dependencias se validaron en una prueba posterior.
El navegador protegido sigue bloqueado; se observó `clone(CLONE_NEWUSER | SIGCHLD) → EPERM`
con el perfil diagnóstico vigente. El permiso adicional está propuesto, no aplicado; ver el
informe de sandbox del backend. Requiere binario patchright compatible, bibliotecas del sistema, memoria,
/dev/shm dimensionada y perfil escribible/exclusivo. Usar init para recoger hijos. Validar
el sandbox con usuario sin privilegios y restricciones actuales; no añadir privileged,
SYS_ADMIN o desactivar controles como solución automática. Si un challenge exige intervención
o llega 403/429 persistente, terminar parcial/fallido y respetar Retry-After/circuit breaker.
No cambiar identidad/proxy, resolver CAPTCHA ni añadir rutas para eludir rechazos. Un navegador
que abre offline no demuestra que SofaScore vaya a aceptar la IP del servidor del grupo.

Acceso: backend no publicado no basta; cualquier visitante podría invocar un POST en Next.
Propuesta para servidor: proxy del grupo con autenticación y rol operador; Next valida identidad
y permiso en **POST, estado y cancelación**, con cabeceras de identidad aceptadas solo desde
proxy confiable que elimina las del cliente. Bloquear bypass directo. Backend exige credencial
interna distinta en sus rutas de control; nunca se envía al navegador. Aplicar mismo origen,
CSRF si hay credenciales de navegador y rate limiting. Sin proxy/identidad correctamente
configurados, actualización deshabilitada por defecto; lectura puede seguir pública.
En local, elegir expresamente el mecanismo de operador, no asumir que loopback identifica
al usuario. No implementar una nueva plataforma de usuarios: concretar primero el mecanismo
existente del grupo y una opción local mínima. No aceptar ejecutable, URL, equipo, ruta, SQL,
flags de scraper o comandos libres en el cuerpo del POST.

## 7. Contratos nuevos propuestos (no vigentes)

No modificar respuestas deportivas por conveniencia. Control de actualización separado;
extensión de cabeceras para generación necesita aprobación explícita. Rutas públicas en Next:

| Método y ruta | Respuesta |
|---|---|
| POST /api/v1/updates | Cuerpo vacío; Idempotency-Key. 202 con job, Location y pollAfterSeconds. Si ya hay activo, devolver ese job con reused=true; no crear otro |
| GET /api/v1/updates/current | 200 con activeJob o null, última confirmación deportiva, generación y cobertura/fichas; incluye último resultado aunque sea fallido |
| GET /api/v1/updates/{id} | 200 estado/progreso/resultado autorizado; 404 desconocido/expirado |
| POST /api/v1/updates/{id}/cancel | 202 cancelación solicitada, idempotente; 409 si ya publica o terminó |

Backend implementa homólogas `/updates`, `/updates/current`, `/updates/{id}` y cancel, solo
en SQL y modo de control habilitado, autenticadas internamente. Cliente servidor de control
tipado, sin usar subprocess desde Next ni exponer errores crudos. Demo oculta botón y estas
operaciones responden 409 UPDATE_UNAVAILABLE sin consultar al backend. Se preserva DataSource
de lectura; ni él ni SyntheticSource ejecutan escrituras.

Ejemplo de forma pública (nombres a acordar):

```json
{
  "id": "uuid",
  "status": "running",
  "phase": "downloading",
  "progress": {"teamsDone": 8, "teamsTotal": 20, "eventsDone": 37, "eventsTotal": null},
  "reused": false,
  "published": false,
  "generation": null,
  "requestedAt": "UTC ISO-8601",
  "startedAt": "UTC ISO-8601",
  "finishedAt": null,
  "pollAfterSeconds": 3,
  "coverage": {"policyVersion": "v1", "queriedFrom": null, "queriedTo": null, "pending": []},
  "summary": null,
  "error": null
}
```

Al terminar: summary con partidos nuevos/corregidos, convocatorias/estadísticas modificadas,
fichas nuevas/pendientes y sin cambios; no convertir contadores internos de tablas en métricas
que engañen. Error seguro `{code,message,retryable,retryAfterSeconds}`. Status internos queued,
running, completed, partial, failed, cancelled; recovering se refleja como running/recuperando
y recovery_required como error persistente que deshabilita nuevos POST. Responder 401/403 por
permiso, 409 por modo/recuperación/cancelación no admisible, 429 por cooldown y 503 por
coordinador indisponible. Todas las consultas de control no-store, sin tokens en logs/respuestas.

## 8. Interfaz propuesta

Botón único en la cabecera global del **modo real**, junto a una línea discreta de estado;
visible al operador, para no crear una cuarta sección de navegación. Texto contextual en
Inicio con el último resumen. Usuarios de lectura ven fecha/cobertura permitidas, no el control.

| Estado visible | Texto y comportamiento |
|---|---|
| Listo | «Actualizar» y fecha de última confirmación; si nunca se publicó mediante este flujo, indicarlo, no usar la hora de arranque |
| En curso | «Consultando equipos 8/20», después «Comprobando datos» o «Publicando»; botón deshabilitado; Cancelar solo donde sea seguro |
| Completado | «Datos deportivos comprobados a las …; 2 partidos nuevos, 1 corregido» o «Sin cambios»; refrescar consultas una vez |
| Parcial, no publicado | «Consulta incompleta. Se mantienen los datos anteriores. Puedes reintentar»; detalle breve de cobertura pendiente |
| Parcial, publicado | «Datos deportivos publicados; 3 fichas personales pendientes»; fecha deportiva avanza, no afirmar cobertura personal completa |
| Fallido/interrumpido | «No se pudo actualizar. Conservamos la última versión válida»; si recuperación no está verificada, decir «No se pudo confirmar la recuperación», no prometer datos íntegros |

«Actualizado» significa **generación deportiva publicada y verificada**, con inicio/fin de
consulta, hora de publicación y política/cobertura conocidas. No significa directo ni que el
proveedor sea completo o correcto. Mostrar «algunas respuestas reutilizadas de caché» y
pendientes históricos/fichas cuando aplique. Separar último intento de última confirmación;
un parcial sin publicar no avanza esta última. UTC en API, zona local en UI. Progreso accesible
aria-live moderado; escritorio y 390 px sin nuevas cards o detalles de filesystem/procesos.

## 9. Alternativas y plan de implementación

| Alternativa | Motivo |
|---|---|
| Detener/reiniciar contenedor desde frontend | Rechazada: privilegios Docker y caída innecesaria; no resuelve publicación durable |
| Soltar bloqueo para que escriba CLI | Rechazada: ventana de carreras y API sirviendo una generación sin coordinación |
| Importar directamente en principal y luego recargar | Menos copias, pero fallo posterior al COMMIT exige recuperar principal ya cambiado; candidata reduce esa exposición |
| Familias de bases inmutables y puntero CURRENT | Publicación/reversión elegante, pero cambia ruta/bloqueos y todos los comandos de mantenimiento; demasiado para la primera versión |
| Servicio scraper separado | Elegida para el diseño de adquisición: frontera de permisos, política propia revisada, sin volumen deportivo; no integrado |
| Coordinador en backend + candidata | Implementado solo para fixtures: conserva bloqueo/ruta/herramientas, lectura y recuperación. Se mantiene con adquisición separada |

Fases pequeñas, cada una revisable antes de la siguiente:

1. Acordar políticas, seguridad y contratos; fixtures de 20 equipos/ámbito, paginación y
   cobertura. Definir invariantes de publicación, catálogo de errores y retención.
2. Coordinador/journal y bloqueo en un solo propietario, sin red ni UI. Pruebas de concurrencia,
   idempotencia, dos instancias, hilo propietario y CLI externas rechazadas. Probar adquisición
   de bloqueo y recuperación antes de atender deporte en Windows y Linux.
3. Candidata/importación/publicación con fixtures. Fallos antes/dentro/después del COMMIT,
   falta de disco, errores de copia/replace, carga/serialización, confirmación del journal,
   restauración fallida, SIGKILL en cada frontera y recuperación. Comparar IDs, historial,
   originales, decisiones, filas y respuestas antiguas/nuevas; conservar G en peticiones en curso.
4. Adaptador scraper e imagen fijada. Fakes de transporte, caché, 404, 403, 429/Retry-After,
   5xx, cortes de páginas, last truncado, cancelación y fichero inválido. Probar revisión selectiva
   de secciones completas y fichas sin descargar todas. Chromium offline en Linux no root,
   perfil persistente, memoria/shm, limpieza de hijos y compatibilidad de dependencias.
5. API de control/seguridad y UI detrás de feature flag, inicialmente deshabilitada. Tests
   de rol/CSRF/origen/bypass, cuerpos arbitrarios rechazados, polling sin duplicación,
   reinicio de Next/backend, terminales, generaciones mezcladas y cachés. Revisión visual
   1440/390 px y teclado; JSON/dependencias SQL opcionales y demo siguen sin escrituras.
6. Prueba controlada autorizada: primero alcance pequeño para transporte/browser en la IP
   Linux destino; después los 20 equipos con presupuesto y tiempos acordados, solo sobre
   copia deportiva de prueba. Confirmar parciales, rate limits, uso real de caché, cobertura,
   cancelación y recuperación. Comparar endpoints, no solo exit code. No usar la base activa
   ni habilitar el botón real hasta aprobar estos resultados.

Sin peticiones reales pueden validarse toda la coordinación, transacciones, conservación,
recuperación, contratos, seguridad, UX y empaquetado offline del navegador. No pueden acreditarse
acceso actual a SofaScore, aceptación del puente por la IP del grupo, comportamiento real de
sus límites ni suficiencia de la muestra/presupuesto. Ninguno se ha probado en esta tarea.

## 10. Decisiones que hay que cerrar antes de implementar

- Aprobar contratos de control, cabecera de generación y coordinación de cachés/peticiones.
- Confirmar estrategia candidata + propietario único, journal y política conservadora de
  recuperación; presupuesto de disco/memoria y comportamiento si recuperar B falla.
- Fijar exactamente 20 equipos, secciones, calendario y política histórica (propuesta
  7 días/6 h + 20 antiguos por ejecución), límites globales, cooldown y cuándo una cobertura
  pendiente planificada merece «completado» frente a «parcial». Nunca ocultar esos pendientes.
- Aprobar regla deportiva todo-o-nada y fichas opcionales (30 días/máximo 10 por trabajo),
  así como retención de intentos, raw, copias y claves de idempotencia.
- Elegir autenticación/rol del proxy del grupo y mecanismo local de operador. Hasta entonces,
  control de escritura deshabilitado, incluso si el dashboard se puede leer públicamente.
- La revisión del scraper ya está fijada y su cambio ajeno excluido. La separación está
  aprobada para diseño; siguen pendientes sandbox funcional, contrato/autorización interna,
  recursos y almacenamiento Linux antes de implementar cualquier servicio.
- Autorizar por separado la prueba de red controlada y sus límites. No interpretar este
  documento como autorización para descargas, implementación o activación.
