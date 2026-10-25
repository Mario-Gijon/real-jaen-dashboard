# Instalación habitual y cambio explícito a Docker

Proyecto: `rj-analyst-local`. Volumen externo: `rj-analyst-local-state`.
Frontend: **http://127.0.0.1:3200**; backend sin puerto publicado al host.
Configuración local ignorada: `C:\Users\broke\dev\rj-analyst\.env.docker`.
Entradas y snapshot fuera de Git: `C:\Users\broke\dev\datos-importados\docker\imports`.
Base y copias Docker: `/state/real-jaen.sqlite` y `/state/copias`, en el volumen externo.

Preparar datos mediante una parada anunciada y breve de la API Windows, sin activar Docker.
Reservar el bloqueo de la base Windows durante toda la descripción, copia y comparación.
Usar `sqlite.copia_consistente`, `sqlite.comprobar_copia` y `sincronizacion.verificar` existentes;
exigir revisión 0004, integridad correcta, claves foráneas válidas y las mismas filas/huella
lógica antes/después en origen y snapshot. No migrar la base Windows ni copiar su archivo a mano.
Reanudar la API Windows con su misma configuración tras liberar el bloqueo. Un snapshot
preparado hoy deja de ser actual si se importa más evidencia después: antes del cambio,
repetir la copia coordinada si hubo escrituras. No ejecutar simultáneamente importaciones
independientes en Windows y Docker: no se sincronizan.

La preparación puede construir imágenes e inicializar/verificar un volumen nuevo mediante
contenedores efímeros. Eso no arranca los servicios habituales. Comprobar ausencia del nombre
antes de crear el volumen; etiquetarlo `rj.installation=rj-analyst-local`, inspeccionar identidad
y rechazar cualquier destino SQLite existente. No reutilizar el volumen de pruebas.
El informe local de preparación y el nombre exacto del snapshot quedan en el directorio
`datos-importados\docker`, fuera de los repositorios. No guardar configuraciones locales,
datos o informes con datos en Git. Inicialización y límites: [docker.md](docker.md).

## Cambio pendiente: ejecutar solo al decidir activar Docker

1. Confirmar que el snapshot instalado incluye las últimas importaciones. Si hubo cambios,
   preparar otro snapshot con la API Windows detenida y actualizar el volumen por el mecanismo
   seguro de restauración, nunca sobrescribiendo SQLite/WAL/SHM a mano.
2. Anunciar y detener la API Windows y el frontend Windows con el método usado para arrancarlos.
   Conservar la base Windows como punto de vuelta; no borrar datos ni volúmenes.
3. Arrancar Docker y comprobar salud y pantallas. Estas órdenes no se ejecutan al preparar:

```powershell
docker compose --project-name rj-analyst-local --env-file C:\Users\broke\dev\rj-analyst\.env.docker --file C:\Users\broke\dev\rj-analyst\compose.yaml up -d --wait --wait-timeout 120
if ($LASTEXITCODE -ne 0) { throw 'Arranque fallido: revisar logs; no migrar automaticamente' }
docker compose --project-name rj-analyst-local --env-file C:\Users\broke\dev\rj-analyst\.env.docker --file C:\Users\broke\dev\rj-analyst\compose.yaml ps
docker compose --project-name rj-analyst-local --env-file C:\Users\broke\dev\rj-analyst\.env.docker --file C:\Users\broke\dev\rj-analyst\compose.yaml logs --tail 100
```

Abrir localhost:3200. Revisar Inicio, Equipos/jugadores, piernas, datos derivados y sustituciones.
Si falla, detener solo este proyecto y volver a los comandos Windows originales; no restaurar
la base Windows para deshacer un cambio que no la ha modificado. Si ya se importaron datos en
Docker, conservar una copia consistente y resolver explícitamente qué instalación es vigente
antes de volver: la base Windows no contendrá esas nuevas importaciones.

## Parada y mantenimiento

```powershell
docker compose --project-name rj-analyst-local --env-file C:\Users\broke\dev\rj-analyst\.env.docker --file C:\Users\broke\dev\rj-analyst\compose.yaml stop
```

Para mantenimiento: detener **backend**, ejecutar una operación, comprobar su código de salida,
verificar, y solo después arrancarlo. En PowerShell 5, un comando nativo fallido no detiene
por sí solo los siguientes; comprobar `$LASTEXITCODE` tras cada orden. Ejemplo de migración
explícita con copia previa automática (no se ejecuta durante la preparación):

```powershell
docker compose --project-name rj-analyst-local --env-file C:\Users\broke\dev\rj-analyst\.env.docker --file C:\Users\broke\dev\rj-analyst\compose.yaml stop backend
if ($LASTEXITCODE -ne 0) { throw 'Parada fallida' }
docker compose --project-name rj-analyst-local --env-file C:\Users\broke\dev\rj-analyst\.env.docker --file C:\Users\broke\dev\rj-analyst\compose.yaml run --rm --no-deps backend -m persistencia migrar --base /state/real-jaen.sqlite
if ($LASTEXITCODE -ne 0) { throw 'Mantenimiento fallido: no arrancar backend' }
docker compose --project-name rj-analyst-local --env-file C:\Users\broke\dev\rj-analyst\.env.docker --file C:\Users\broke\dev\rj-analyst\compose.yaml run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite
if ($LASTEXITCODE -ne 0) { throw 'Verificacion fallida: no arrancar backend' }
docker compose --project-name rj-analyst-local --env-file C:\Users\broke\dev\rj-analyst\.env.docker --file C:\Users\broke\dev\rj-analyst\compose.yaml start backend
```

Importar, reconstruir e incorporar decisiones usan la misma secuencia y ruta; ver opciones
en [docker.md](docker.md). No hay botón Actualizar, recarga ni migraciones al arrancar.

## Copia y recuperación

Con backend detenido, `run --rm --no-deps backend -m persistencia copiar --base
/state/real-jaen.sqlite --motivo antes-mantenimiento` produce una copia verificada e informa
su nombre exacto. Exportarla también al host: el volumen no protege frente a pérdida de la VM.
Para restaurar, elegir esa ruta exacta, mantener backend detenido y ejecutar:

```powershell
docker compose --project-name rj-analyst-local --env-file C:\Users\broke\dev\rj-analyst\.env.docker --file C:\Users\broke\dev\rj-analyst\compose.yaml run --rm --no-deps backend -m persistencia restaurar --base /state/real-jaen.sqlite --copia /state/copias/NOMBRE-EXACTO.sqlite --confirmar
if ($LASTEXITCODE -ne 0) { throw 'Restauracion fallida: no arrancar backend' }
```

Verificar y arrancar solo si pasa, como arriba. No borrar `.lock`, WAL o SHM. El bloqueo es
cooperativo, no cubre programas SQLite externos. La imagen actual requiere 0004; recuperar
0002 necesita revisión explícita y código de fase 3 compatible (`c56dc83`), no esta imagen.
Linux/symlinks están probados en ext4 Docker Desktop; otros almacenamientos y caída completa
de la VM/host siguen sin validar. `compose down` conserva este volumen externo; no usar prune.
