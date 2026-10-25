param(
    [Parameter(Mandatory = $true)][string]$Snapshot,
    [string]$BackendContext = (Join-Path $PSScriptRoot '../../api-real-jaen')
)
$ErrorActionPreference = 'Stop'
# Check the engine before creating files, volumes or containers. Never start Docker Desktop ourselves.
$dockerOS = & docker version --format '{{.Server.Os}}'
if ($LASTEXITCODE -ne 0) { throw 'Motor Docker no disponible; no se ha creado ni arrancado la pila.' }
if ("$dockerOS".Trim() -ne 'linux') { throw 'Se necesita el motor de contenedores Linux.' }
& docker compose version
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose no disponible.' }

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backend = (Resolve-Path $BackendContext).Path
$source = (Resolve-Path -LiteralPath $Snapshot).Path
$python = Join-Path $backend '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Se necesita el entorno SQL Windows del backend para preparar una copia consistente.' }
$id = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$project = "rj-check-$id"
$volume = "$project-state"
$work = Join-Path ([IO.Path]::GetTempPath()) $project
$inputs = Join-Path $work 'inputs'
$null = New-Item -ItemType Directory -Path $inputs
$seed = Join-Path $inputs 'snapshot.sqlite'
$workingCopy = Join-Path $work 'working.sqlite'
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
if ($port -in 3000, 3100, 8001) { throw 'Puerto reservado: vuelva a ejecutar.' }
$environmentFile = Join-Path $work '.env.validation'
$settings = @(
    "COMPOSE_PROJECT_NAME=$project"
    "RJ_STATE_VOLUME=$volume"
    "RJ_FRONTEND_PORT=$port"
    "RJ_BACKEND_CONTEXT='$($backend.Replace('\', '/'))'"
    "RJ_IMPORT_DIR='$($inputs.Replace('\', '/'))'"
)
[IO.File]::WriteAllLines($environmentFile, $settings, [Text.UTF8Encoding]::new($false))
$dc = @('compose', '--project-name', $project, '--env-file', $environmentFile, '--file', (Join-Path $root 'compose.yaml'))
function Dc {
    # Windows PowerShell 5 treats native stderr progress as errors when redirected.
    # The native exit code, rather than progress output, determines success.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & docker @dc @args
        $commandCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($commandCode -ne 0) { throw "Docker Compose ha fallado ($commandCode): $args" }
}

# Read a completed backup through the existing SQLite backup mechanism. An in-use source is rejected.
Push-Location $backend
try {
    & $python -B -c 'import sys; from persistencia import sqlite; sqlite.copia_consistente(sys.argv[1], sys.argv[2]); sqlite.comprobar_copia(sys.argv[2], sqlite.describir(sys.argv[1]))' $source $workingCopy
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar una copia consistente; no se usará la base activa como alternativa.' }
    # Explicit migration of this disposable copy only, not at API startup or on the source.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $python -B (Join-Path $backend 'persistencia/__main__.py') migrar --base $workingCopy
    $migrationCode = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    if ($migrationCode -ne 0) { throw 'La copia temporal no se pudo migrar.' }
    & $python -B (Join-Path $backend 'persistencia/__main__.py') verificar --base $workingCopy
    if ($LASTEXITCODE -ne 0) { throw 'La copia migrada no supera la verificacion.' }
    # A migrated database uses WAL again. Finalize a new DELETE-mode backup for the read-only input mount.
    & $python -B -c 'import sys; from persistencia import sqlite; sqlite.copia_consistente(sys.argv[1], sys.argv[2]); sqlite.comprobar_copia(sys.argv[2], sqlite.describir(sys.argv[1]))' $workingCopy $seed
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo finalizar el snapshot sin WAL/SHM.' }
} finally {
    Pop-Location
}

$created = $false
try {
    Dc config --quiet
    Dc build
    $existingVolumes = @(& docker volume ls --format '{{.Name}}')
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron consultar los volumenes.' }
    if ($volume -in $existingVolumes) { throw "El volumen ya existe; no se reutiliza: $volume" }
    & docker volume create --label "rj.validation=$project" $volume
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el volumen temporal.' }
    $identity = (& docker volume inspect $volume | ConvertFrom-Json)[0]
    if ($LASTEXITCODE -ne 0 -or $identity.Name -ne $volume -or $identity.Labels.'rj.validation' -ne $project) {
        throw 'Identidad inesperada del volumen; no se montara ni modificara.'
    }
    $identity | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $work 'volume.json')
    $created = $true
    Dc run --rm --no-deps --user 0:0 --cap-add CHOWN --entrypoint chown backend 10001:10001 /state
    Dc run --rm --no-deps backend -m scripts.initialize_snapshot /imports/snapshot.sqlite /state/real-jaen.sqlite
    Dc run --rm --no-deps backend -m scripts.check_container --base /state/real-jaen.sqlite
    Dc up -d --wait --wait-timeout 120
    Dc ps --format json | Set-Content -LiteralPath (Join-Path $work 'services.json')
    $containerIds = @(& docker @dc ps -q)
    & docker inspect @containerIds | Set-Content -LiteralPath (Join-Path $work 'containers.json')
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo registrar la configuracion efectiva.' }
    $url = "http://127.0.0.1:$port"
    if ((Invoke-RestMethod "$url/api/v1/source").synthetic -ne $false) { throw 'La pila no está en modo real.' }
    $before = (& docker @dc exec -T backend python -c "from persistencia import sqlite; print(sqlite.describir('/state/real-jaen.sqlite')['huella'])")
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer la huella de prueba.' }
    # Maintenance must reject the actual running service too, not only the child-API check.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $rejected = (& docker @dc run --rm --no-deps backend -m persistencia migrar --base /state/real-jaen.sqlite 2>&1 | Out-String)
    $rejectionCode = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    if ($rejectionCode -ne 1 -or $rejected -notmatch 'Base en uso') { throw "Mantenimiento no rechazado: $rejected" }
    # No .env.local in the image, and only our frontend is published.
    Dc exec -T frontend node -e "if(require('node:fs').existsSync('/app/.env.local'))process.exit(1)"
    & node (Join-Path $root 'scripts/verify-production.mjs') $url (Join-Path $work 'screenshots')
    if ($LASTEXITCODE -ne 0) { throw 'Falló la comprobación HTTP/visual real.' }
    Dc stop backend
    Dc run --rm --no-deps backend -m persistencia verificar --base /state/real-jaen.sqlite
    Dc up -d --force-recreate --wait --wait-timeout 120
    $after = (& docker @dc exec -T backend python -c "from persistencia import sqlite; print(sqlite.describir('/state/real-jaen.sqlite')['huella'])")
    if ($LASTEXITCODE -ne 0 -or "$before" -ne "$after") { throw 'La recreación no conservó el contenido lógico.' }
    Dc logs --no-color | Set-Content -LiteralPath (Join-Path $work 'compose.log')
    Write-Output "OK: $url; evidencias=$work; volumen=$volume"
} finally {
    if ($created) {
        # Only this random project. Preserve its external volume and evidence for inspection.
        $ErrorActionPreference = 'Continue'
        & docker @dc logs --no-color 2>&1 | Out-File -LiteralPath (Join-Path $work 'compose-final.log') -Encoding utf8
        & docker @dc down
        Write-Output "Volumen de prueba conservado: $volume; evidencias: $work"
    }
}
