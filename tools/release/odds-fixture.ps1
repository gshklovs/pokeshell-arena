<#
The pack-odds parity fixture (host/src/parity.rs): pokeshell's own odds tables next to the data they come from, so
`cargo test` checks the arena's Rust booster port (host/src/booster.rs) against pokeshell's model.
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\release\odds-fixture.ps1 [-Pokeshell <checkout>]
Writes host\tests\fixtures\pokeshell\: pack.json and boosters.json (copied from the checkout), built.json (the served
cards: built art in <pokeshell>\dist\pokemon, the bundle's rule) and odds.json (`pokeshell pack odds random --json`,
`pack odds <set> --json` for every set, `pack sets --json`). pokeshell runs against a throwaway state in %TEMP%
(POKESHELL_HOME), never %LOCALAPPDATA%\pokeshell. Rerun it when pokeshell's pack.json or boosters.json changes.
#>
param([string]$Pokeshell)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot)
if (-not $Pokeshell) { $Pokeshell = if ($env:POKESHELL_REPO) { $env:POKESHELL_REPO } else { Join-Path (Split-Path $root) 'pokeshell' } }
$ps1 = Join-Path $Pokeshell 'scripts\pokeshell.ps1'
if (-not (Test-Path $ps1)) { throw "no pokeshell checkout at $Pokeshell (pass -Pokeshell)" }
$out = Join-Path $root 'host\tests\fixtures\pokeshell'
New-Item -ItemType Directory -Force $out | Out-Null
$state = Join-Path ([IO.Path]::GetTempPath()) ("arena-odds-fixture-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $state | Out-Null
$old = $env:POKESHELL_HOME
try {
  $env:POKESHELL_HOME = $state
  function Invoke-Pokeshell([string[]]$a) {
    $t = & powershell -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $ps1 @a
    if ($LASTEXITCODE) { throw "pokeshell $($a -join ' ') failed: $t" }
    ($t -join "`n") | ConvertFrom-Json
  }
  foreach ($f in 'pack.json', 'boosters.json') { Copy-Item (Join-Path $Pokeshell "packs\pokemon\$f") (Join-Path $out $f) -Force }
  $pack = [IO.File]::ReadAllText((Join-Path $out 'pack.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
  $files = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($f in [IO.Directory]::GetFiles((Join-Path $Pokeshell 'dist\pokemon'), '*.ans')) { [void]$files.Add([IO.Path]::GetFileName($f)) }
  $built = @(); $shiny = @()
  foreach ($p in $pack.cards.PSObject.Properties) {
    if ($files.Contains("$($p.Value.character)-$($p.Name).ans")) { $built += $p.Name; if ($files.Contains("$($p.Value.character)-$($p.Name)-shiny.ans")) { $shiny += $p.Name } }
  }
  [IO.File]::WriteAllText((Join-Path $out 'built.json'), (ConvertTo-Json -Compress -InputObject ([ordered]@{ pack = 'pokemon'; built = $built; shinyArt = $shiny })), [Text.UTF8Encoding]::new($false))
  $random = Invoke-Pokeshell @('pack', 'odds', 'random', '--json')
  $sets = Invoke-Pokeshell @('pack', 'sets', '--json')
  $odds = [ordered]@{}
  foreach ($s in $random.sets) { $odds[$s.set] = Invoke-Pokeshell @('pack', 'odds', $s.set, '--json') }
  $rev = (& git -C $Pokeshell rev-parse --short HEAD) 2>$null
  $doc = [ordered]@{ pokeshell = $rev; generated = (Get-Date).ToString('s'); random = $random; sets = $sets; odds = $odds }
  [IO.File]::WriteAllText((Join-Path $out 'odds.json'), (ConvertTo-Json -Depth 12 -InputObject $doc), [Text.UTF8Encoding]::new($false))
  Write-Host "odds fixture: $out ($($built.Count) served cards, $($odds.Count) sets, pokeshell $rev)"
} finally {
  $env:POKESHELL_HOME = $old
  Remove-Item -Recurse -Force $state -ErrorAction SilentlyContinue
}
