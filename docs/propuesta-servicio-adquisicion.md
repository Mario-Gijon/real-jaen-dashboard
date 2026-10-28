# Servicio de adquisición separado: propuesta (implementada)

> Estado 28-10-2026: implementado como servicio interno con el overlay `compose.acquisition.yaml`
> ([docker.md](docker.md), «Adquisición»). Contrato vigente:
> [../../api-real-jaen/docs/contrato-adquisicion-interno.md](../../api-real-jaen/docs/contrato-adquisicion-interno.md).
> Este documento conserva el diseño y sus motivos; donde difiera, prevalece el contrato.

> Política final del perfil: [diseño administrativo manual](../../api-real-jaen/docs/perfil-adquisicion-diseno-final.md). Prevalece sobre las propuestas anteriores de confirmación del lanzador mediante JSON. Implementados el servicio y la CLI administrativa.

Diseño autorizado el 26-10-2026; no se han creado servicios, endpoints ni configuración
Compose ejecutable. Tampoco se implementan autenticación, botón o políticas históricas.
El coordinador interno de fixtures y el backend deportivo conservan su comportamiento actual.

## Decisión y motivo concreto

Proponer tres servicios: frontend, backend y acquisition. La imagen del backend no incorpora
Chromium ni el scraper. Se retira la opción inicial de ejecutar adquisición como hijo dentro
del backend: el navegador necesita una política de namespaces propia, validada en Docker Desktop x86_64, que no
debe ampliarse también para el proceso que posee SQLite, journal y copias.

No se ha detectado incompatibilidad de paquetes SQL/scraper. La separación ofrece una frontera
de permisos, datos y ejecución, no una solución mágica al sandbox. Bajo las mismas restricciones
el sandbox ya funciona en el diagnóstico Linux x86_64. La recuperación final será manual, según el diseño enlazado. Cualquier nueva excepción precisa revisión y prueba local antes de
adoptarse; nunca privileged, sandbox desactivado o una relajación global de Docker.

## Responsabilidades y almacenamiento

| Componente | Responsabilidad y acceso |
|---|---|
| Frontend | Lecturas y futuro control autorizado a través del backend; sin acceso directo a acquisition ni volúmenes de datos |
| Backend | Único dueño del bloqueo deportivo, importación, verificación, decisiones locales y publicación/recuperación de generaciones |
| Volumen deportivo del backend | Principal, journal operativo, candidatas, copias y staging privado; RW únicamente en backend |
| Acquisition | Consulta mediante scraper fijado, caché, gestión del proceso de navegador y preparación de exportaciones; nunca importa SQLite deportivo ni decide versiones operativas |
| Volumen propio de acquisition | Store/caché y estado de adquisición existentes, perfil de navegador exclusivo y directorios de evidencia/exportación por trabajo |
| Configuración de acquisition | Ámbito y política versionados, de solo lectura; sin órdenes, URLs ni rutas suministradas por un visitante |

Acquisition **no monta el volumen deportivo**, `/state`, journal, candidatas, copias ni secretos
del backend. Tampoco tiene acceso al socket Docker o a directorios del anfitrión con esos datos.
No se comparten perfil ni caché con otra instalación del scraper. UID no root, capabilities
a cero, no-new-privileges, init, límites de memoria/PID y shm suficiente siguen siendo requisitos.
Un perfil seccomp específico, si se aprueba, pertenece solo a acquisition; backend conserva el suyo.

Los contenedores comparten kernel: separar el servicio no elimina la superficie de kernel
que pueda abrir un permiso de namespaces. Si el grupo necesita esa frontera adicional, habrá
que elegir otro entorno/VM de adquisición, no conceder más privilegios al backend.

## Interfaz interna mínima propuesta

Backend llama a `http://acquisition:8002` por DNS de servicio. No hay puerto al host ni acceso
directo del navegador. Esta tabla es una propuesta de contrato para otra entrega, no rutas
implementadas. Puede reutilizar el servidor HTTP/dependencias ya disponibles en el scraper,
exponiendo únicamente este adaptador pequeño, sin su UI ni toda su API de administración.

| Método y ruta propuestos | Semántica |
|---|---|
| POST /internal/v1/acquisitions | Crea una adquisición con requestId del backend, scopeVersion y policyVersion aprobadas; devuelve 202 con ID opaco |
| GET /internal/v1/acquisitions/{id} | Estado, fase, progreso, errores seguros, cobertura y descriptor del bundle cuando esté sellado |
| GET /internal/v1/acquisitions/{id}/bundle | Descarga por streaming de un paquete inmutable de manifiesto y exportaciones, solo cuando esté finalizado |
| POST /internal/v1/acquisitions/{id}/cancel | Cancelación cooperativa del trabajo de adquisición, sin efecto sobre una publicación deportiva ya confirmada |

Una única adquisición activa, sin cola genérica. requestId es idempotente: repetir el mismo
ID y configuración devuelve el mismo trabajo; reutilizar ID con configuración distinta o
pedir otro trabajo mientras haya activo produce conflicto. Ningún parámetro acepta comandos,
flags de CLI, ejecutables, SQL, destinos, URLs o rutas arbitrarias. Se usan únicamente recetas
de adquisición fijadas y configuraciones aprobadas en el servidor. Los 20 equipos y las reglas
de consulta histórica aún necesitan concretarse; este contrato no los decide por conveniencia.

La ausencia de puertos públicos no es autenticación. La identidad interna backend→acquisition
y el acceso del operador son requisitos pendientes de diseñar/aprobar antes de integrar, con
secretos separados de solo lectura o mecanismo del grupo. No se crea aquí una plataforma de
usuarios ni se incluyen secretos en imágenes, ejemplos o respuestas.

## Entrega de exportaciones sin un volumen compartido

Elegir transferencia HTTP interna de un bundle de solo lectura, evitando un montaje que
permita al navegador escribir en staging del backend. No se pasan URLs de descarga externas:
el backend usa siempre la ruta fija del servicio y su ID conocido, con tiempos y tamaño acotados.

Manifiesto mínimo versionado: requestId/ID, ámbito y política, revisión del scraper, inicio/fin,
cobertura y errores, uso/fecha de caché y lista de ficheros con tipo, nombre relativo, bytes,
SHA256 y declaración de equipo cuando corresponda. Contenido: raw originales, events de
calendario y fichas seleccionadas cuando la política lo disponga. Los fetched_at originales
no se sustituyen por la fecha de exportación; no se aplica otra normalización deportiva.

El único escritor del Store termina o libera su fase de escritura antes de exportar. Se
congelan los ficheros, se verifican huellas y se publica el descriptor completo al final;
un directorio a medias nunca queda disponible como bundle completo. Una descarga fallida
conserva evidencia para reintento, pero no habilita automáticamente su importación.

Backend descarga a un directorio privado nuevo, valida ID/ámbito/revisión/cobertura, límites
de tamaños y ficheros, hashes y formato. Rechaza rutas absolutas, `..`, symlinks/hardlinks,
duplicados y contenido fuera de los nombres/tipos admitidos; no extrae un archivo no confiable
directamente sobre el volumen deportivo vigente. Hashes acreditan integridad, no identidad
del emisor: no sustituyen la autorización interna. No ejecuta nada contenido en el paquete.

Solo después entrega las entradas aceptadas a su coordinador. Este conserva en exclusiva
copia consistente, candidata, importación transaccional, verificación, instantánea preparada,
confirmación durable y publicación. Acquisition no accede a esas fases ni declara que el
dashboard está actualizado. `complete` de adquisición significa paquete preparado según su
política, no datos deportivos publicados. Un parcial deportivo no se importa sin una política
explícitamente aprobada; errores/ausencias no se convierten en ceros.

## Progreso, caída y cancelación

El journal del backend es la autoridad sobre el trabajo global y la generación publicada.
El estado de adquisición y sus leases pertenecen al Store del servicio, no al esquema deportivo.
Backend conserva el vínculo requestId↔acquisitionId y el hash del bundle aceptado; no duplica
la implementación del scraper ni inventa otro framework de trabajos.

Si se pierde la respuesta de POST, el backend repite el mismo requestId. Si acquisition cae,
su siguiente arranque marca la ejecución interrumpida, conserva caché/evidencia y no descarga
automáticamente. Reanudar requiere una acción explícita y volver a validar frescura/cobertura.
Si backend cae, primero reconcilia su journal/base; no vuelve a publicar ni a iniciar consultas
externas por detectar simplemente un trabajo pendiente. Estado de adquisición y estado deportivo
son distintos y se concilian por ID/manifiesto, no por PID o nombres de fichero recientes.

Cancelar adquisición cierra cooperativamente scraper/navegador y conserva parciales; nunca
equivale a revertir un COMMIT o una generación confirmada. Si ya se transfirió un paquete,
backend aplica sus propias fronteras de cancelación/publicación. SIGTERM y reinicios requieren
pruebas específicas de lease/perfil/hijos; no asumir que un contenedor reiniciado recupera
automáticamente una sesión de navegador funcional.

## Entrega portable y red

La entrega futura contendrá dos repositorios y una exportación inmutable del scraper fijado,
o imágenes ya construidas/versionadas. No depende de un checkout Windows ni de su package-lock
ajeno, `.env.local`, venv, node_modules, artifacts o carpetas temporales. El candidato actual
`api-real-jaen/docker/scraper` solo sirve para empaquetado/diagnóstico, no implementa el servicio.

Variables propuestas, sin secretos: ACQUISITION_URL por DNS, versiones/huellas de ámbito y
política y nombres de volúmenes. Rutas internas fijas como `/acquisition` se configuran sin
incrustar rutas del anfitrión; permisos del almacenamiento se comprueban antes del arranque.
Cada imagen mantiene versión/digest y sus dependencias; los perfiles seccomp del diagnóstico
amd64 actual no se activan automáticamente ni se consideran portables a otro motor/CPU.

Frontend y backend conservan su red actual. Backend y acquisition tendrían una red interna
separada de control/transferencia. Solo acquisition tendría la salida necesaria al proveedor
cuando se autorice probarla; no se incorpora proxy, cola o servicio adicional sin necesidad.
Hasta entonces las pruebas siguen con red exterior deshabilitada y páginas locales. No se
configura egress real ni se eluden rechazos, límites o mecanismos existentes del scraper.

## Condiciones para la siguiente entrega

1. Mantener las cinco reglas del sandbox aprobadas y los diagnósticos superados de
   sandbox, cookies, concurrencia, señales y recuperación con copia preservada.
2. Implementar solo tras revisión el [diseño final de perfil](../../api-real-jaen/docs/perfil-adquisicion-diseno-final.md):
   recuperación administrativa manual con servicio detenido y confirmación explícita;
   sin autorización mediante JSON, socket Docker o fallback a perfil vacío. Los scripts
   diagnósticos históricos no son el comando administrativo futuro.
3. Verificar el servidor del grupo: perfil efectivo, filtros heredados, namespaces, LSM,
   rootless/remap, UID/GID, arquitectura, perfil exclusivo, memoria/PID/shm e init. Un resultado
   local no certifica ese servidor. No modificar políticas globales como atajo.
4. Aprobar contrato interno, autorización, límites/retención y aceptación de cobertura antes
   de implementar el servicio o tocar Compose. Las políticas históricas siguen fuera de esta entrega.
5. Validar el protocolo con bundles sintéticos y fallos de transferencia/reinicio antes de
   autorizar cualquier consulta real. El backend no pierde su última generación válida.

Esta propuesta sustituye únicamente la opción de adquisición embebida del diseño exploratorio;
no cambia las invariantes aprobadas de bloqueo, candidata, restauración y confirmación durable.
