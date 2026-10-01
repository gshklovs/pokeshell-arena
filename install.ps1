<#
Build pokeshell arena from this checkout: the art (public\sprites, public\arenas\*\bg.png), the game (dist\) and the
host (host\target\release\arena-host.exe).
  powershell -ExecutionPolicy Bypass -File .\install.ps1 [-Vendor <pokemon-colorscripts>] [-Pokeshell <checkout>]
                                                         [-SkipArt] [-SkipGame] [-SkipHost]
Needs Node 20+ (npm) and Rust (cargo; the MSVC toolchain on Windows, like pokeshell's binder).

The art is gitignored (docs/SPEC.md section 14). For a dev checkout it comes from a pokeshell checkout next to this one
(-Pokeshell, else $env:POKESHELL_REPO, else ..\pokeshell), only when it's missing here:
  - battle sprites: built by tools\build_sprites.py from <pokeshell>\vendor\pokemon-colorscripts (or -Vendor), with
    <pokeshell>\.venv's Python (Pillow) when there is one;
  - arena paintings: public\arenas\<id>\bg.png and props.png copied from <pokeshell>\style-lab\arenas\<id>\
    (tools\arenas\README.md).
TODO: fetch both from the arena art release instead, once it exists.
Without the art the game still runs (grid and type-coloured discs).

It changes nothing outside this folder: it prints the PATH line for `pokearena` instead of editing PATH or $PROFILE.
#>
param([string]$Vendor, [string]$Pokeshell, [switch]$SkipArt, [switch]$SkipGame, [switch]$SkipHost)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Push-Location $root
try {
  if (-not $SkipArt) {
    if (-not $Pokeshell) { $Pokeshell = if ($env:POKESHELL_REPO) { $env:POKESHELL_REPO } else { Join-Path (Split-Path $root) 'pokeshell' } }
    $hasRepo = Test-Path (Join-Path $Pokeshell 'scripts\pokeshell.ps1')

    # battle sprites
    $sprites = Join-Path $root 'public\sprites\index.json'
    if (-not $Vendor -and -not (Test-Path $sprites) -and $hasRepo) {
      $v = Join-Path $Pokeshell 'vendor\pokemon-colorscripts'
      if (Test-Path (Join-Path $v 'colorscripts')) { $Vendor = $v }
    }
    if ($Vendor) {
      $py = @((Join-Path $Pokeshell '.venv\Scripts\python.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\Python\Launcher\py.exe'), 'python') |
        Where-Object { $_ -and (Get-Command $_ -ErrorAction SilentlyContinue) } | Select-Object -First 1
      if (-not $py) { throw 'building sprites needs Python 3 with Pillow' }
      Write-Host "sprites: building from $Vendor"
      & $py tools\build_sprites.py --vendor $Vendor
      if ($LASTEXITCODE) { throw 'sprite build failed' }
    } elseif (-not (Test-Path $sprites)) {
      Write-Host "sprites: missing (no pokeshell checkout at $Pokeshell; pass -Vendor <pokemon-colorscripts>): the game draws discs" -ForegroundColor Yellow
    }

    # arena paintings
    $copied = 0; $missing = @()
    foreach ($dir in Get-ChildItem (Join-Path $root 'public\arenas') -Directory) {
      if (-not (Test-Path (Join-Path $dir.FullName 'arena.json'))) { continue }
      $want = @('bg.png'); if (Test-Path (Join-Path $dir.FullName 'props.json')) { $want += 'props.png' }
      foreach ($f in $want) {
        $dst = Join-Path $dir.FullName $f
        if (Test-Path $dst) { continue }
        $src = Join-Path $Pokeshell "style-lab\arenas\$($dir.Name)\$f"
        if (Test-Path $src) { Copy-Item $src $dst; $copied++ } else { $missing += "$($dir.Name)\$f" }
      }
    }
    if ($copied) { Write-Host "arenas: copied $copied images from $Pokeshell\style-lab\arenas" }
    if ($missing) { Write-Host "arenas: missing $($missing -join ', ') (the game draws the grid there)" -ForegroundColor Yellow }
  }
  if (-not $SkipGame) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is missing: install Node.js 20+ (https://nodejs.org)' }
    & npm ci --no-fund --no-audit
    if ($LASTEXITCODE) { throw 'npm ci failed' }
    & npm run build
    if ($LASTEXITCODE) { throw 'the game build failed' }
  }
  if (-not $SkipHost) {
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'cargo is missing: install Rust (https://rustup.rs)' }
    # On Windows build with MSVC even when the default toolchain is gnu (the gnu one needs dlltool/MinGW, which a
    # plain rustup install doesn't have).
    $tc = @()
    if ($env:OS -eq 'Windows_NT' -and (Get-Command rustup -ErrorAction SilentlyContinue)) {
      $msvc = 'stable-x86_64-pc-windows-msvc'
      $list = (& rustup toolchain list) -join "`n"
      $gnuDefault = $list -match '(?m)^\S*windows-gnu\S* \(.*default'
      if ($list -match [regex]::Escape($msvc)) { $tc = @("+$msvc") }
      elseif ($gnuDefault -and -not (Get-Command dlltool -ErrorAction SilentlyContinue)) {
        Write-Host "the default Rust toolchain is gnu without dlltool: installing $msvc (rustup, user-local)"
        & rustup toolchain install $msvc --profile minimal
        if ($LASTEXITCODE) { throw "couldn't install $msvc (it also needs the Visual Studio C++ build tools)" }
        $tc = @("+$msvc")
      }
    }
    & cargo @tc build --release --manifest-path host\Cargo.toml
    if ($LASTEXITCODE) { throw 'the host build failed' }
  }
} finally { Pop-Location }
$scripts = Join-Path $root 'scripts'
Write-Host ''
Write-Host 'pokeshell arena is built. Run it with:' -ForegroundColor Green
Write-Host "  $scripts\pokearena.cmd"
Write-Host 'or put scripts\ on your PATH for `pokearena` anywhere (this installer does not change PATH):'
Write-Host "  [Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$scripts', 'User')"
