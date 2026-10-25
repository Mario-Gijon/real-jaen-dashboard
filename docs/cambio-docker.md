# Cambio de instalación, sin activación automática

El procedimiento portable y los comandos POSIX están en [docker.md](docker.md).

1. Acordar cuál será la instalación vigente. Windows y Docker son copias independientes;
   no existe sincronización automática ni coordinación de bloqueo entre hosts.
2. Anunciar la parada de la API de origen. Obtener un snapshot consistente mediante el
   mecanismo existente bajo bloqueo; verificar revisión 0004, integridad, claves foráneas,
   filas y equivalencia lógica. No usar un respaldo antiguo como prueba de actualidad.
3. Reanudar el servicio de origen si todavía no se hará el cambio. Preparar en el destino
   configuración, imágenes, permisos y almacenamiento según primera instalación o base
   existente. No arrancar Docker todavía. Si hubo importaciones posteriores, renovar la copia.
4. Al autorizar el cambio, detener expresamente los servicios anteriores y arrancar Compose.
   Comprobar salud, Inicio, Equipos/jugadores, piernas, derivados y eventos sustituidos.
5. Si falla antes de nuevas importaciones, detener solo ese proyecto Docker y reanudar el
   servicio anterior sin restaurar una base que no se ha modificado. Si hubo escrituras en
   Docker, preservar copia consistente y decidir cómo trasladarlas antes de volver.

No borrar datos, WAL/SHM, archivos de bloqueo o volúmenes para forzar el arranque. Mantenimiento
y recuperación usan parada, operación explícita, verificación y arranque; ante fallo se detiene
la secuencia. Datos, configuración local y registros de instalación permanecen fuera de Git.
