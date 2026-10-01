<#
pokearena: start the arena host (if it isn't running) and open the game in the browser (docs/SPEC.md section 1).
  pokearena              start (or reuse) the host, open http://127.0.0.1:<port>/
  pokearena -NoOpen      start it, print the URL, don't open a browser
  pokearena status       is it running, where, and is pokeshell found
  pokearena stop         ask the host to exit (POST /api/shutdown)
The host exits by itself a minute after the last game tab closes. State: $env:POKEARENA_HOME, else
%LOCALAPPDATA%\pokeshell-arena. It reads pokeshell (never writes its state) through pokeshell's JSON commands.
#>
param([string]$Command = 'start', [switch]$NoOpen, [int]$Port = 0, [string]$State)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
if (-not $State) { $State = if ($env:POKEARENA_HOME) { $env:POKEARENA_HOME } else { Join-Path $env:LOCALAPPDATA 'pokeshell-arena' } }
$exe = @((Join-Path $root 'bin\arena-host.exe'), (Join-Path $root 'host\target\release\arena-host.exe')) | Where-Object { Test-Path $_ } | Select-Object -First 1
$dist = Join-Path $root 'dist'
$hostJson = Join-Path $State 'host.json'

function Get-RunningHost {
  if (-not (Test-Path $hostJson)) { return $null }
  try {
    $h = Get-Content $hostJson -Raw | ConvertFrom-Json
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$($h.port)/api/health" -TimeoutSec 2
    if ($health.ok) { return [pscustomobject]@{ port = $h.port; health = $health } }
  } catch { }
  $null
}

switch ($Command.ToLower()) {
  'status' {
    $h = Get-RunningHost
    if (-not $h) { Write-Host 'pokearena: not running'; exit 0 }
    $ps = if ($h.health.pokeshell.found) { "pokeshell $($h.health.pokeshell.version) ($($h.health.pokeshell.script))" } else { 'pokeshell not found (practice mode)' }
    Write-Host "pokearena: http://127.0.0.1:$($h.port)/  host $($h.health.version)  state $($h.health.state)"
    Write-Host "           $ps"
    exit 0
  }
  'stop' {
    $h = Get-RunningHost
    if (-not $h) { Write-Host 'pokearena: not running'; exit 0 }
    Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$($h.port)/api/shutdown" -ContentType 'application/json' -Body '{}' | Out-Null
    Write-Host 'pokearena: stopped'
    exit 0
  }
  'start' { }
  default { Write-Host "pokearena: unknown command '$Command' (start, status, stop)" -ForegroundColor Red; exit 2 }
}

$h = Get-RunningHost
if (-not $h) {
  if (-not $exe) { throw "arena-host.exe isn't built: run install.ps1 (or cargo build --release --manifest-path host\Cargo.toml)" }
  if (-not (Test-Path (Join-Path $dist 'index.html'))) { throw "the game isn't built: run install.ps1 (or npm run build)" }
  New-Item -ItemType Directory -Force $State | Out-Null
  Remove-Item $hostJson -ErrorAction SilentlyContinue
  $a = @('--state', "`"$State`"", '--dist', "`"$dist`"")
  if ($Port) { $a += '--port', $Port }
  Start-Process -FilePath $exe -ArgumentList $a -WindowStyle Hidden | Out-Null
  for ($i = 0; $i -lt 50 -and -not $h; $i++) { Start-Sleep -Milliseconds 100; $h = Get-RunningHost }
  if (-not $h) { throw "arena-host didn't start (state $State)" }
}
$url = "http://127.0.0.1:$($h.port)/"
if ($NoOpen -or $env:POKEARENA_NO_OPEN -eq '1') { Write-Host "pokearena: $url" }
else { Start-Process $url; Write-Host "pokearena: opened $url" }
