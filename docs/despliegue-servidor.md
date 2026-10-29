# Despliegue en el servidor del grupo (primera versión)

Preparado el 29-10-2026 para la persona que instala el servidor. Complementa a [docker.md](docker.md), que es la
referencia de cada pieza. Todo se hace desde una shell POSIX en Linux; nada depende de rutas de Windows.

## Qué se despliega

| Pieza | Revisión / imagen |
|---|---|
| rj-analyst (frontend, Compose, scripts) | `feature/rj-analyst`, el commit de este documento |
| api-real-jaen (backend, adquisición) | `feature/stats-normalization`, código de `2c4008b` |
| Scraper (dentro de la imagen de adquisición) | `sofascore_scraper` `611e436a1528b0f487aa56a045f023e8ae8ae098` |
| Imagen del backend | `rj-analyst-backend:2c4008b` (`sha256:63bf24d4c7b8…`) |
| Imagen del frontend | `rj-analyst-frontend:d7dfe26` (`sha256:ca43216e9428…`) |
| Imagen de adquisición | `rj-analyst-acquisition:2c4008b` (`sha256:49fd238c03b8…`); byte a byte el código de la ejecución real del 29-10 |
| Imagen de comprobación (opcional) | `rj-acq-real-test:5c5fa98c20bd` (`sha256:efa70ddde7f9…`): solo para verificar el sandbox de Chromium sin red |

Las cuatro imágenes son linux/amd64. Otra arquitectura exige construirlas y validarlas allí.

## 1. Entrega

En la máquina de origen, desde la carpeta que contiene los dos repositorios:

```sh
set -eu
D=entrega-$(date +%Y%m%d); mkdir "$D"
git -C rj-analyst archive --prefix=rj-analyst/ HEAD | tar -x -C "$D"
git -C api-real-jaen archive --prefix=api-real-jaen/ HEAD | tar -x -C "$D"
docker image save rj-analyst-backend:2c4008b rj-analyst-frontend:d7dfe26 rj-analyst-acquisition:2c4008b \
  rj-acq-real-test:5c5fa98c20bd | gzip > "$D/imagenes.tar.gz"
(cd "$D" && sha256sum imagenes.tar.gz > imagenes.tar.gz.sha256)
```

Se añade aparte el **respaldo** del estado (apartado 4). La entrega no lleva:
- secretos, `.env.*` locales ni `.git`;
- bases activas ni perfiles de navegador;
- capturas ni evidencias temporales.

En el servidor:

```sh
set -eu
sudo mkdir -p /srv/rj-analyst && cd /srv/rj-analyst    # carpeta libre; se usan rutas relativas a ella
# copiar aquí rj-analyst/, api-real-jaen/ e imagenes.tar.gz* de la entrega
sha256sum -c imagenes.tar.gz.sha256
gunzip -c imagenes.tar.gz | docker image load
mkdir -p deployment/imports deployment/secrets/session
```

**Construir en el servidor**, en lugar de cargar las imágenes, es posible pero hace falta:
- red durante la construcción (PyPI y npm);
- la imagen base del scraper, construida con `api-real-jaen/docker/scraper` (`docs/scraper-empaquetado-linux.md`
  de api-real-jaen).

Las imágenes resultantes son otras, con otros identificadores, y hay que validarlas de nuevo.

## 2. Configuración

En `rj-analyst/.env.servidor` (ignorado por Git), con rutas relativas a `rj-analyst/`:

```sh
COMPOSE_PROJECT_NAME=rj-analyst
RJ_BACKEND_CONTEXT=../api-real-jaen
RJ_BACKEND_IMAGE=rj-analyst-backend:2c4008b
RJ_FRONTEND_IMAGE=rj-analyst-frontend:d7dfe26
RJ_FRONTEND_BIND=127.0.0.1
RJ_FRONTEND_PORT=3200
RJ_STATE_VOLUME=rj-analyst-state
RJ_IMPORT_DIR=../deployment/imports
RJ_ACCESS_PASSWORD_FILE=../deployment/secrets/access-password
RJ_SESSION_SECRET_DIR=../deployment/secrets/session
RJ_TRUSTED_CLIENT_IP_HEADER=x-real-ip
RJ_SCRAPER_RUNTIME_IMAGE=rj-scraper-package-efcadb386d:candidate
RJ_ACQUISITION_IMAGE=rj-analyst-acquisition:2c4008b
RJ_ACQUISITION_PROFILE_VOLUME=rj-analyst-acquisition-profiles
RJ_ACQUISITION_JOBS_VOLUME=rj-analyst-acquisition-jobs
RJ_ACQUISITION_SECRET_FILE=../deployment/secrets/acquisition-token
RJ_ACQUISITION_ENABLE_REAL=1
RJ_CONTROL_SECRET_FILE=../deployment/secrets/control-token
```

Notas:
- `RJ_TRUSTED_CLIENT_IP_HEADER=x-real-ip` solo es correcto si el proxy del apartado 5 sobrescribe esa cabecera. Sin
  ese proxy, se deja vacío.
- `RJ_SCRAPER_RUNTIME_IMAGE` solo se usa para construir, pero Compose lo exige.
- En el servidor **no** se usa `compose.dev.yaml`: el backend no publica ningún puerto.

```sh
cd /srv/rj-analyst/rj-analyst
dc() { docker compose --env-file .env.servidor -f compose.yaml -f compose.acquisition.yaml "$@"; }
dc config --quiet
```

## 3. Secretos nuevos del servidor

Se generan allí: no se copian los de la máquina de origen.

| Archivo | Uso | Legible por |
|---|---|---|
| `access-password` | La contraseña compartida (la elige el responsable) | frontend (UID 1000) |
| `session/session-secret` | Firma de las sesiones | frontend (UID 1000) |
| `control-token` | Next ↔ backend | backend (10001) y frontend (1000) |
| `acquisition-token` | Backend ↔ adquisición | backend y adquisición (10001) |

```sh
set -eu
cd /srv/rj-analyst/deployment/secrets
umask 077
rand() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
rand > acquisition-token; rand > control-token; rand > session/session-secret
read -r -s -p 'Contraseña de acceso (12-256 caracteres ASCII, sin espacios): ' p; echo
printf '%s' "$p" > access-password; unset p
sudo chown 10001:10001 acquisition-token
sudo chown 10001:1000 control-token && sudo chmod 0440 control-token
sudo chown 1000:1000 access-password session session/session-secret && sudo chmod 0500 session
```

- `read -s` no muestra la contraseña ni la deja en el historial.
- El bloque usa `bash` (`read -s`).
- **Cambiarla más tarde:** se reescribe el mismo archivo en su sitio; el frontend lo ve al momento, sin recrearlo, y
  se cierran todas las sesiones:
  `read -r -s -p 'Nueva: ' p; echo; printf '%s' "$p" | sudo tee access-password >/dev/null; unset p`
  (en Windows, `scripts/cambiar-contrasena-acceso.ps1`).
- **Revocar todas las sesiones** sin cambiar la contraseña: reescribir el secreto en su sitio,
  `head -c 32 /dev/urandom | od -An -tx1 | tr -d ' 
' | sudo tee session/session-secret >/dev/null`.

## 4. Datos iniciales

Se parte del **respaldo del estado habitual**, hecho con `scripts/respaldo-instalacion.sh`. Contiene:
- la base;
- sus registros de actualización (generación confirmada, trabajos y bundles sellados);
- la procedencia archivada;
- los trabajos de adquisición.

Se copia la carpeta del respaldo a `deployment/imports/` y se restaura. El script:
1. comprueba las sumas;
2. crea volúmenes **nuevos** (se niega si existen);
3. verifica la base y que el coordinador acepta la misma generación;
4. inicializa un perfil de navegador nuevo.

No arranca nada.

```sh
cd /srv/rj-analyst/rj-analyst
ENV_FILE=.env.servidor COMPOSE_FILES="-f compose.yaml -f compose.acquisition.yaml" \
  sh scripts/restaurar-instalacion.sh ../deployment/imports/respaldo-habitual-AAAAMMDD
```

## 5. Dominio, HTTPS y proxy

El frontend escucha solo en `127.0.0.1:3200`. Un proxy del servidor publica el dominio por HTTPS. Ejemplo con nginx
(el certificado, de la CA o de Let's Encrypt, lo gestiona el administrador):

```nginx
server {
    listen 80;
    server_name analisis.ejemplo.es;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name analisis.ejemplo.es;
    ssl_certificate     /etc/ssl/rj-analyst/fullchain.pem;
    ssl_certificate_key /etc/ssl/rj-analyst/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;
    location / {
        proxy_pass http://127.0.0.1:3200;
        proxy_http_version 1.1;
        proxy_set_header Host $host;                 # la comprobación de origen compara Origin con Host
        proxy_set_header X-Forwarded-Proto https;    # cookie con Secure
        proxy_set_header X-Real-IP $remote_addr;     # sobrescrita: el límite de intentos es por dirección
        proxy_set_header X-Forwarded-For "";         # no se reenvía la del cliente
    }
}
```

Requisitos:
- solo el proxy debe alcanzar el puerto 3200;
- no se expone el backend;
- el cortafuegos abre 80/443 hacia el proxy;
- con el proxy del grupo (otro software), se mantienen las mismas cuatro cabeceras.

## 6. Arranque

```sh
dc up -d --no-build --pull never --wait --wait-timeout 180
dc ps
curl -fsS http://127.0.0.1:3200/api/v1/session      # {"required":true,"signedIn":false}
```

Después, en `https://analisis.ejemplo.es`, comprobar:
- que pide la contraseña y que entra;
- que Partidos muestra J9 finalizada;
- que `/operador` muestra la última publicación;
- que «Cerrar sesión» funciona.

**No pulsar «Actualizar»** hasta completar el apartado 8.

## 7. Copias y recuperación

**Respaldo consistente:** detiene frontend, backend y adquisición alrededor de un minuto y los vuelve a arrancar.
Se niega si hay una actualización en curso.

```sh
ENV_FILE=.env.servidor COMPOSE_FILES="-f compose.yaml -f compose.acquisition.yaml" \
  sh scripts/respaldo-instalacion.sh ../deployment/imports/respaldo-$(date +%Y%m%d-%H%M)
```

- Recomendado después de cada actualización, o semanal.
- El respaldo hay que copiarlo **fuera del servidor**, con `SHA256SUMS`.
- `manifest.json` dice la generación, la huella, la última importación y la última publicación.

**Recuperación:** se restaura **junta** la base con sus registros de actualización. Una base sola pierde:
- el historial de actualizaciones;
- la cobertura de la última publicación;
- la memoria de rotación de jornadas y los bloqueos de adquisición.

Pasos:
1. `dc down` (conserva los volúmenes).
2. Apartar los volúmenes actuales:
   - para conservarlos, se cambian `COMPOSE_PROJECT_NAME` y `RJ_*_VOLUME` a nombres nuevos;
   - nunca se borran sin revisar su contenido.
3. Lanzar `restaurar-instalacion.sh` con el respaldo elegido.
4. `dc up -d --no-build --pull never --wait`.

**Recuperación de solo la base** desde sus copias internas (`/state/copias`): `persistencia restaurar` (ver
[docker.md](docker.md)). Sirve tras una importación fallida, no tras perder el volumen.

## 8. Antes de la primera actualización en el servidor

1. **Sandbox de Chromium, sin red:**

   ```sh
   docker run --rm --init --network none --cap-drop ALL --security-opt no-new-privileges:true \
     --security-opt seccomp=../api-real-jaen/docker/acquisition/seccomp-linux-amd64.json --shm-size 512m \
     --env RJ_REQUIRE_SANDBOX=1 --entrypoint python rj-acq-real-test:5c5fa98c20bd -B /opt/checks/test_sdk_adapter.py \
     Adaptador.test_challenge_resuelto_con_trafico_reducido Adaptador.test_403_sin_challenge_detiene_sin_navegador
   ```

   Debe terminar en `OK`. Si falla por el sandbox:
   - en Ubuntu 23.10+, `kernel.apparmor_restrict_unprivileged_userns=1` impide los namespaces de usuario sin
     privilegios. Se decide con el administrador (perfil AppArmor o ajuste), **nunca** desactivando el sandbox, el
     seccomp ni `no-new-privileges`;
   - ver `api-real-jaen/docs/diagnostico-sandbox-linux.md`.
2. **Salida de red:** `acquisition` es el único servicio con salida (`acquisition-egress`).
   - Comprobar con el administrador que el servidor puede alcanzar `www.sofascore.com` y
     `challenges.cloudflare.com` por HTTPS.
   - Un proxy de salida obligatorio no está soportado todavía.
   - La IP del servidor recibirá su propio challenge: la primera actualización lo resolverá con el navegador o se
     detendrá sin publicar.
3. **Almacenamiento:** los volúmenes deben ser locales (ext4/xfs), no de red: SQLite, WAL y bloqueos solo están
   validados ahí. Revisar el espacio libre:
   - el volumen de estado crece unos 40 MB por actualización con candidata y bundle;
   - los respaldos ocupan unos 360 MB cada uno.
4. **Hora del sistema sincronizada (NTP):** la ventana de 72 h y la rotación dependen de ella.
5. Entonces, una única actualización vigilada desde `/operador`, revisando el resultado antes de la siguiente.

## 9. Validado y pendiente

| Aspecto | Validado en la máquina de origen (Docker Desktop, WSL2, amd64) | Pendiente en el servidor |
|---|---|---|
| Imágenes | Construidas sin código montado; el código de adquisición, byte a byte el de la ejecución real | Cargar y comprobar identificadores |
| Acceso | Contraseña, sesión de 90 días, persistencia al recrear, revocación, origen, límite; e2e y recorrido integrado | Detrás del proxy real: `Secure`, `Host`, `X-Real-IP` |
| Datos | Respaldo, restauración en volúmenes nuevos y arranque, con la misma generación, huella y trabajos (ensayo del 29-10) | Restaurar el respaldo real y comprobar J9 y la última publicación |
| Chromium | Sandbox acreditado por `/proc` (namespaces y seccomp) en Docker Desktop; perfil seccomp propio | **Kernel, AppArmor y user namespaces del servidor** (apartado 8.1) |
| Salida de red | Una ejecución real (29-10, J9: 48 intentos y 49 envíos, un challenge resuelto) | **Alcance de SofaScore y Cloudflare desde la red del grupo; challenge con otra IP** |
| Almacenamiento | Volumen local de Docker Desktop (ext4 en WSL2) | **Sistema de archivos y espacio del servidor**; copia externa programada |
| Actualización | Receta del Grupo 2 completa una vez desde la interfaz local (29-10, 12:40) | Primera actualización en el servidor, vigilada |
| HTTPS / dominio | Solo configuración de ejemplo | Certificado, dominio, cortafuegos y proxy del grupo |

Limitaciones conocidas:
- una contraseña compartida, sin identidades;
- recrear el perfil del navegador vuelve a pasar el challenge;
- no hay actualización programada: es manual desde `/operador`.
