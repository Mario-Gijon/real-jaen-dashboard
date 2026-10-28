# Sandbox de adquisición: configuración propuesta, no aplicada

> Diseño final vigente: [recuperación administrativa manual](../../../api-real-jaen/docs/perfil-adquisicion-diseno-final.md). Las confirmaciones JSON del lanzador descritas en pruebas posteriores son mecanismos históricos del diagnóstico; no se usarán en el servicio. No se alteran los resultados conservados.

Revisión documental del 26-10-2026. No autoriza nuevas excepciones, integración ni
tráfico del scraper. Complementa la propuesta del servicio separado. Los perfiles
diagnósticos existentes del backend siguen sin referencias desde Compose.

## Versión y fuentes oficiales

El manifiesto de [Playwright 1.63.0](https://raw.githubusercontent.com/microsoft/playwright/v1.63.0/packages/playwright-core/browsers.json)
asocia revisión 1243 con Chromium 153.0.8010.12, la versión de la imagen probada.
Se ha revisado el código de esa etiqueta, no solo documentación de otra versión.
El binario procede de Patchright: esta revisión del upstream explica la secuencia,
pero no sustituye auditar sus parches ni verificar el sandbox del binario ejecutado.

- [NamespaceSandbox](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.12/sandbox/linux/services/namespace_sandbox.cc):
  por defecto solicita NEWUSER, NEWPID y NEWNET; también contiene un fork con NEWPID.
- [Lanzamiento POSIX](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.12/base/process/launch_posix.cc):
  incorpora SIGCHLD a los flags de clone.
- [Credentials](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.12/sandbox/linux/services/credentials.cc):
  prueba clone NEWUSER, mapas UID/GID y unshare NEWUSER; el aislamiento posterior
  incluye chroot a un directorio vacío y retirada de capabilities.
- [ZygoteHost](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.12/content/browser/zygote_host/zygote_host_impl_linux.cc):
  exige que el lanzamiento del zygote produzca un proceso válido.
- [Sandbox Linux](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.12/sandbox/linux/README.md):
  combina aislamiento y reducción de superficie del kernel mediante seccomp-BPF.
- [Playwright Docker](https://playwright.dev/docs/docker) y su
  [perfil fijado a 1.63.0](https://github.com/microsoft/playwright/blob/v1.63.0/utils/docker/seccomp_profile.json):
  recomiendan usuario separado y permiten clone, setns y unshare sin filtro de argumentos.
  También recomiendan init y memoria compartida suficiente. Su imagen es para pruebas y
  desarrollo, no una garantía de seguridad para visitar sitios no confiables.
- [Docker seccomp](https://docs.docker.com/engine/security/seccomp/): el perfil predeterminado
  restringe creación de namespaces; sustituirlo requiere revisar el perfil completo.

## Qué está demostrado y qué no

En Docker Desktop Linux/amd64: UID 10001, capabilities cero, NNP=1, seccomp=2,
red none y un volumen de perfil exclusivo. Primero se ejecutó sin ptrace: SIGTRAP,
sin solicitudes al servidor local y sin hijos restantes. Después, en el mismo
contenedor, clone(0x10000011) y unshare(0x10000000) funcionaron; clone(0x70000011)
devolvió EPERM. El baseline propio deniega esta última combinación. Un ALLOW local
no elimina filtros heredados ni restricciones LSM/kernel.

**Sí, 0x70000011 es una combinación esperada del sandbox**: NEWUSER | NEWPID |
NEWNET | SIGCHLD en el ABI nativo Linux x86_64 probado (clone syscall 56, flags en
arg0, SIGCHLD=17). La prueba inicial de NEWUSER no acredita el aislamiento completo.
NamespaceUtils comprueba existencia de archivos /proc/self/ns, lo que no garantiza
que seccomp permita crear esos namespaces.

Hipótesis fuerte: al fallar ese clone, el lanzamiento devuelve un proceso inválido
y el CHECK del zygote termina el navegador. [ImmediateCrash de esta versión](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.12/base/immediate_crash.h)
usa una instrucción int3 en x86, compatible con SIGTRAP. Falta stack/símbolos o un
mensaje fatal inequívoco para atribuir el SIGTRAP sin traza a ese CHECK concreto.
SIGTRAP no demuestra una acción TRAP del seccomp externo, que aquí devuelve errno.
El EPERM de Crashpad bajo ptrace no justifica SYS_PTRACE; puede deberse al trazador.
Los avisos de cpufreq ausente tampoco demuestran la causa del cierre.

## Configuración mínima candidata completa

Es una especificación para revisión y posterior prueba; NO una configuración ya
validada de producción ni una promesa de que no aparecerán más requisitos.

1. Imagen propia versionada por digest, scraper fijado a
   611e436a1528b0f487aa56a045f023e8ae8ae098 y dependencias/navegador fijados. La imagen
   diagnóstica actual no es aún una imagen del servicio. Excluir frontend y su lock ajeno;
   en la imagen definitiva de adquisición tampoco hacen falta las dependencias SQL deportivas.
2. Usuario 10001:10001, cap_drop ALL, no-new-privileges, init, sin privileged ni
   namespaces host, socket Docker, dispositivos o puertos publicados. Mantener sandbox
   explícito y validación TLS; no aceptar parámetros arbitrarios del solicitante.
3. Root filesystem de solo lectura como objetivo; tmpfs /tmp y HOME escribible
   exclusivo, volumen propio /acquisition para caché, perfil y exportaciones. Validar las
   rutas de escritura de esta versión antes de adoptar read_only. Inicializar permisos
   explícitamente; no arrancar como root para corregirlos silenciosamente.
4. IPC privado con shm_size 512 MiB como punto de partida; no ipc:host. Una sola sesión,
   pids_limit 256, memoria 2 GiB, CPU 1 y parada de 30 s como límites iniciales ajustables
   tras medir carga; no son requisitos oficiales ni valores de capacidad demostrados.
5. Red interna backend–acquisition sin frontend, y salida separada cuando se autoricen
   consultas. Una red Compose con salida no constituye una allowlist de destinos.
   Para pruebas continuar network none y contenido loopback. Sin volumen deportivo,
   journal, copias, credenciales del backend ni montajes de código del anfitrión.
6. Interfaz interna de recetas fijas y exportaciones verificables según la propuesta
   separada; backend único importador/publicador. Sin comandos arbitrarios, consola remota
   de navegador ni actualizaciones automáticas al reiniciar. Autorización pendiente antes
   de implementar la interfaz. Sin integración en esta entrega.

### Política seccomp propuesta para esa candidata

Conservar el baseline completo revisado, su acción ERRNO y sus demás reglas. Para
Linux x86_64, el contrato mínimo deducido de la secuencia de sandbox es:

| Llamada | Condición | Evidencia y estado |
|---|---|---|
| unshare | arg0 EQ 0x10000000 | Prueba de credenciales y entrada en user namespace; ya probada |
| clone | arg0 EQ 0x10000011 | Prueba de user namespace; ya probada |
| clone | arg0 EQ 0x70000011 | Arranque normal user/PID/net; denegación observada, NO autorizada ni aplicada |
| clone | arg0 EQ 0x20000011 | Fork en PID namespace del código de esta versión; requisito estático, aún no alcanzado |
| chroot | Sin filtro escalar de ruta | Aislamiento del filesystem en Credentials; requisito estático, aún no alcanzado |

El baseline cap0 capturado NO permite chroot. El perfil oficial de Playwright lo
condiciona a CAP_SYS_CHROOT, capability presente en muchos contenedores predeterminados
pero ausente con cap_drop ALL. Copiar solo su regla clone/setns/unshare no resuelve esa
diferencia. Se propone permitir la syscall chroot en adquisición sin conceder la
capability al contenedor: el kernel exige la autoridad correspondiente en el user
namespace donde Chromium se confina. Seccomp clásico no puede validar la cadena de
ruta ni limitar esta regla al hijo del navegador; afecta a todo el servicio. Crear user
namespaces amplía superficie del kernel y debe aprobarse expresamente.

No se propone setns genérico ni clone3: no hay requisito demostrado en esta ruta;
conservar el fallback ENOSYS actual para clone3. Clones de hilos y del helper chroot
sin bits de namespace siguen sujetos a las reglas existentes. Este conjunto cubre los
requisitos estáticos identificados, pero NO demuestra exhaustividad de todas las rutas,
procesos auxiliares ni parches de Patchright. Ante otra barrera, detenerse y revisarla.
No se ha generado ni aplicado un nuevo perfil con estas reglas.

La alternativa oficial es permitir clone/setns/unshare completos. Es más amplia y
tampoco basta por sí sola bajo cap0 por chroot; no se recomienda adoptarla automáticamente.
Tampoco se adoptan ipc:host o SYS_ADMIN de las sugerencias de diagnóstico de Playwright.
El helper SUID no es la vía elegida: NNP permanece y no se altera su modo para ganar privilegios.

## Requisitos del servidor y aceptación

Comprobar con su administrador arquitectura/ABI (no extrapolar índices de argumentos),
kernel con user/PID/network namespaces y seccomp-filter, cuotas anidadas de namespaces,
política de userns no privilegiado, UID/GID maps y setgroups, procfs necesario, LSM
(AppArmor/SELinux), filtros heredados, versión Docker/runc/libseccomp y modo rootless/remap.
Leer políticas y comprobar funcionalmente bajo el usuario final; una versión de kernel o
una syscall aislada exitosa no certifican toda la secuencia. No modificar políticas globales.
Revisar además permisos del almacenamiento exclusivo y límites de memoria/PID/shm/disco.

Tras aprobación independiente del perfil: primero navegador sin trazado y sin red;
contenido local y chrome://sandbox (namespaces y seccomp-BPF activos), contraste /proc,
cookies entre sesiones y recreación con perfil exclusivo, cierre normal/SIGTERM/caída
sin hijos huérfanos, recuperación del perfil y fallos por límites. No habilitar tráfico
real si falta una comprobación. Si el servidor prohíbe userns, separar acquisition en otro
contenedor idéntico no ayuda: haría falta un entorno administrado que los permita, por
ejemplo VM dedicada con kernel/política revisados, manteniendo sandbox y sin datos deportivos.

Esta revisión solo modifica documentación. No aplica permisos ni certifica el servidor.

## Resultado posterior de la prueba autorizada

La configuración de cinco reglas se aprobó y probó el 26-10-2026. El texto anterior
se conserva como especificación de la candidata, no como estado actual de ejecución.
Sandbox activo confirmado por chrome://sandbox y /proc, contenido local, cookies en
recreaciones normales y SIGTERM correctos en Docker Desktop Linux x86_64.
SIGKILL elimina los procesos, pero la recuperación del perfil falla: SingletonLock
con hostname del contenedor anterior provoca que el scraper use un perfil temporal
vacío. No se demuestra pérdida de cookies del perfil original. Se detuvo la prueba
sin borrar locks, ampliar permisos ni integrar servicios.

Perfil, delta exacto, resultados y reproducción portable están en api-real-jaen:
`docker/scraper/policies/full-candidate.results.json`,
`docker/scraper/test_full_sandbox.py` y `docs/diagnostico-sandbox-linux.md`.
La recuperación de propietario único sigue pendiente de diseño/revisión y validación;
no se activa esta candidata. La compatibilidad con el servidor sigue pendiente.
### Prueba posterior de recuperación con propietario único

La estrategia se presentó y validó mediante adaptador diagnóstico, sin modificar el
scraper instalado: flock permanente durante la sesión, estado incompleto que exige
confirmación del lanzador de confianza de que terminó el contenedor anterior,
copia verificada y limpieza solo en candidata. Se recuperaron las cookies con otro
hostname; dos competidores fueron rechazados, y pasaron SIGTERM y el fallo inyectado
con fuente/respaldo intactos. No se amplió el perfil seccomp. Ver en api-real-jaen
`docs/recuperacion-perfil-linux.md` y `policies/profile-recovery.results.json` bajo
`docker/scraper/`. No está integrado ni autoriza recuperación automática en el servidor;
la frontera de confianza de la confirmación externa sigue necesitando revisión.