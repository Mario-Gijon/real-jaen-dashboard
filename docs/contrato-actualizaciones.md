# Ampliación del contrato /api/v1: actualización de datos

Redactado el 28-10-2026 antes de implementar; implementado y validado ese mismo día (resultados al final). Concreta las secciones 4 a 8 de
[propuesta-actualizar.md](propuesta-actualizar.md) sobre el servicio de adquisición definitivo
(`../../api-real-jaen/docs/contrato-adquisicion-interno.md`). Es la única excepción a la regla «`/api/v1` de solo
lectura»: las respuestas deportivas, el `DataSource` y sus rutas no cambian.

## Alcance real

La única receta aprobada (`sofascore-pilot-16599363-v1`) consulta el calendario de la **jornada 1** y **un
partido** (16599363) de Primera Federación, Grupo 2, 26/27. El resto del inventario se conserva tal cual, sin
consultarlo. La interfaz lo dice expresamente («Actualización piloto: calendario de la jornada 1 y un partido»);
no debe presentarse como una actualización de la jornada ni de la temporada. Cuando haya otras recetas, el alcance
lo sigue declarando el backend (`scope`), no la interfaz.

## Flujo y fronteras

UI → cliente tipado (`src/client/api.ts`) → `/api/v1/updates/*` de Next → cliente de control del servidor
(`src/server/updates/`) → API interna del backend (`/internal/v1/updates/*`) → control de actualizaciones →
cliente de adquisición → servicio `acquisition` y coordinador.

- **Next** comprueba la sesión del operador, el origen y el modo, y llama al backend con el **secreto interno de
  control** (`RJ_CONTROL_SECRET_FILE`), que solo lee el servidor de Next. Nunca llega al navegador ni aparece en
  respuestas o logs. Es distinto del secreto entre backend y adquisición, que Next no conoce.
- **Backend**: en modo control (`control.py`), el mismo proceso que sirve la API es el dueño del coordinador. Cada
  GET deportivo captura la generación vigente al entrar, y una publicación cambia la referencia sin cortar las
  peticiones en curso. Un único trabajo activo, con un registro durable de trabajos y claves de idempotencia en
  `<base>.actualizaciones/control/`. Sin modo control, `api.py` sigue igual que hasta ahora.
- **Demo** (`DATA_MODE=demo`) o falta de configuración: la interfaz no muestra el control y las operaciones
  responden `409 UPDATE_UNAVAILABLE` sin llamar al backend.

## Autorización del operador

Mecanismo local mínimo, hasta que el servidor del grupo aporte su proxy con identidad y rol:

- Clave de operador en un archivo del servidor (`RJ_OPERATOR_KEY_FILE`, de 32 a 256 caracteres ASCII), fuera del
  código, de las imágenes y de `.env.docker`. Sin ella, la actualización está deshabilitada.
- `POST /api/v1/updates/session` con `{"key": "…"}`: comparación en tiempo constante. Si es correcta, una cookie
  `rj_operator` firmada (HMAC con una clave aleatoria del proceso), `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/updates`,
  `Secure` bajo HTTPS y de 8 h de duración. Reiniciar Next invalida las sesiones. Tras 5 intentos fallidos en
  15 min desde la misma dirección, `429`.
- `DELETE /api/v1/updates/session` la cierra.
- Toda operación que cambia estado exige la sesión y una cabecera `Origin` igual al origen de la petición
  (protección CSRF además de `SameSite`). Sin sesión, `401 UNAUTHORIZED`; con un origen distinto, `403 FORBIDDEN`.
- La pantalla del operador es `/operador`, sin enlace en la navegación. La cabecera muestra el control solo con
  sesión de operador.

## Rutas públicas nuevas

Todas responden con `Cache-Control: no-store`.

| Método y ruta | Quién | Respuesta |
|---|---|---|
| GET /api/v1/updates/current | Cualquiera | `UpdateStatus`. Sin sesión de operador: solo `available`, `operator: false`, `scope` y `lastPublished`. Con sesión, además `activeJob` y `lastJob` |
| POST /api/v1/updates | Operador | Cuerpo vacío y cabecera `Idempotency-Key` (UUID). `202 {job, reused}`. La misma clave devuelve el mismo trabajo, aunque haya terminado. Con otro trabajo activo, devuelve ese con `reused: true` y no crea otro |
| GET /api/v1/updates/{id} | Operador | `200 UpdateJob`; `404` si no existe |
| POST /api/v1/updates/{id}/cancel | Operador | `202 UpdateJob`. Idempotente. `409 NOT_CANCELLABLE` si ya verifica, publica o terminó |
| POST /api/v1/updates/session | Cualquiera | `204` y cookie; `401` si la clave no es válida; `429` si hay demasiados intentos |
| DELETE /api/v1/updates/session | Cualquiera | `204` y cookie borrada |

```ts
type UpdateScope = {
  kind: "pilot";            // no es una actualización de jornada ni de temporada
  label: string;            // «Actualización piloto: calendario de la jornada 1 y un partido»
  round: number;            // 1
  matchIds: string[];       // ids públicos, p. ej. «sofascore-match-16599363»
};
type UpdateJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
  phase: "queued" | "acquiring" | "verifying" | "publishing" | "finished";
  cancellable: boolean;     // solo mientras se adquiere
  published: boolean;       // true solo si el coordinador confirmó la generación nueva
  requestedAt: string;      // UTC ISO-8601
  finishedAt: string | null;
  pollAfterSeconds: number;
  error: { code: UpdateErrorCode; message: string; retryable: boolean } | null;
  result: { publishedAt: string; reusedBundle: boolean } | null;
};
type UpdateStatus = {
  available: boolean;
  operator: boolean;
  scope: UpdateScope | null;
  lastPublished: { at: string } | null;    // última generación publicada por este flujo; null si nunca
  activeJob?: UpdateJob | null;
  lastJob?: UpdateJob | null;
};
```

Los códigos de error del trabajo son `ACQUISITION_FAILED` (el proveedor rechazó o falló; no se reintenta solo),
`ACQUISITION_INTERRUPTED`, `CANCELLED`, `BUNDLE_REJECTED`, `GENERATION_CHANGED`, `PUBLICATION_FAILED`,
`ACQUISITION_UNAVAILABLE` e `INTERRUPTED` (reinicio del backend durante el trabajo). En todos se sigue sirviendo la
última generación válida. Los mensajes son seguros: sin rutas, trazas, URLs internas ni secretos.

`ApiErrorCode` se amplía con `UNAUTHORIZED` (401), `FORBIDDEN` (403), `UPDATE_UNAVAILABLE` (409, modo o
configuración), `CONFLICT` (409, por ejemplo `NOT_CANCELLABLE` o una recuperación pendiente) y `TOO_MANY_REQUESTS`
(429). El código `UPSTREAM_UNAVAILABLE` (503) indica que el backend no responde.

## API interna del backend (no pública)

Solo en modo control, sin puerto al anfitrión y con `Authorization: Bearer <secreto de control>`, comparado en
tiempo constante. Las mismas operaciones con prefijo `/internal/v1/updates`. Sin el secreto configurado, el modo
control no arranca. Las rutas deportivas y `/health` no cambian.

## Comportamiento

- **Un único trabajo activo.** Una segunda pulsación, otra pestaña u otro operador reciben el mismo trabajo. La
  interfaz deshabilita el botón mientras espera respuesta y reutiliza la misma clave de idempotencia hasta obtener
  el trabajo.
- **Progreso por fase**, sin porcentajes inventados. En `acquiring` se puede cancelar: el backend pide la
  cancelación cooperativa al servicio de adquisición. En `verifying` y `publishing` no se interrumpe.
- **Resultado.** `completed` solo cuando el coordinador confirmó la generación. Cualquier fallo deja publicada la
  generación anterior.
- **Reintento sin volver a consultar.** Si el último trabajo falló al publicar, con el bundle ya verificado y la
  generación sin cambios, el siguiente trabajo reutiliza esa solicitud (`result.reusedBundle: true`).
- **Reinicio del backend.** Un trabajo activo se concilia con el coordinador: si su publicación quedó confirmada, se
  marca `completed`; si no, `interrupted`. Nunca se reanuda solo.
- **Tras publicar**, la interfaz ofrece recargar los datos; Next olvida su caché de nombres de equipo al observar
  una publicación.

## Validación

- Backend: `tests/test_control.py` (9) con el coordinador real sobre la base de fixtures: idempotencia, un único
  trabajo activo, cancelación al adquirir y antes de verificar, rechazo del proveedor, bundle rechazado, fallo al
  publicar con reintento sobre la misma solicitud, conciliación tras reinicio y autorización HTTP.
- Frontend: rutas (`tests/api/updates-route.test.ts`), interfaz (`tests/ui/UpdateControl.test.tsx`), regla de
  arquitectura con esta excepción exacta y e2e simuladas (`e2e/updates.spec.ts`, 1440 y 390 px).
- Recorrido completo (`../../api-real-jaen/docker/acquisition/test_updates.py` y `scripts/validate-updates-stack.mjs`).
  Usa una pila temporal con el proveedor local `fixture-site`, una copia aislada de una copia inactiva, el backend en
  modo control y Next de producción. Comprueba:
  - cancelación mientras se consulta, sin cambios en los datos;
  - tres pulsaciones que producen un único inicio, seguido hasta la publicación;
  - SIGKILL del backend durante la consulta: interrumpido, con la misma generación y los mismos datos;
  - rechazo del proveedor: fallido, con los datos anteriores;
  - reinicio limpio con el estado conservado;
  - ningún secreto en las respuestas que recibe el navegador ni en los logs, y cookie `HttpOnly` y `SameSite=Strict`.

  Sin consultar SofaScore ni tocar la base activa.

Limitaciones de la autorización local para un servidor: [docker.md](docker.md), «Actualización desde la interfaz».
