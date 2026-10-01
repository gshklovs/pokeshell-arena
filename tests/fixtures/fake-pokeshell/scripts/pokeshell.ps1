<#
A stand-in for pokeshell's CLI in the host tests: the JSON commands docs/SPEC.md section 2 asks for, answering from
fixtures, with the same shapes as pokeshell's (docs/BOOSTERS.md in pokeshell). It only ever writes inside
$env:POKESHELL_HOME (a temp dir the test makes). Card ids are real cards.
  pack tokens / grant / open keep a pack-token ledger in $env:POKESHELL_HOME\fake-tokens.log (delta TAB reason).
  $env:FAKE_POKESHELL_COLLECTION: a collection.json to answer `collection --json` with (screenshots use a bigger one).
  `pack open random` always rolls base1 (the stand-in only has base1's cards), unless $env:FAKE_POKESHELL_RANDOM_SET
  names another of the sets below (its name and odds, base1's cards); $env:FAKE_POKESHELL_NO_SETS=1 makes it fail with
  pokeshell's no-sets error.
#>
$ErrorActionPreference = 'Stop'
$home_ = $env:POKESHELL_HOME
if (-not $home_) { Write-Output '{"error":"no_home","message":"POKESHELL_HOME is not set"}'; exit 1 }
# the page calls several commands at once: a call-log write that collides with another's is retried, never fatal
for ($i = 0; $i -lt 20; $i++) { try { Add-Content -Path (Join-Path $home_ 'fake-calls.log') -Value ($args -join ' ') -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 25 } }
$fixtures = Split-Path (Split-Path $PSScriptRoot)
$a = @($args)
function Out-Json($s) { [Console]::Out.Write($s) }
function Out-Obj($o) { Out-Json ($o | ConvertTo-Json -Depth 6 -Compress) }

$ledger = Join-Path $home_ 'fake-tokens.log'
function Get-Lines {
  if (-not (Test-Path $ledger)) { return @() }
  @(foreach ($l in [IO.File]::ReadAllLines($ledger)) {
    $x = $l.Split("`t"); if ($x.Count -lt 2) { continue }
    [ordered]@{ time = '2026-09-29T10:00:00'; delta = [int]$x[0]; reason = $x[1]; id = "01FAKETOKEN$($x.Count)"; set = $(if ($x.Count -gt 2) { $x[2] } else { $null }); pack = $null }
  })
}
function Get-Balance { $b = 0; foreach ($t in Get-Lines) { $b += $t.delta }; $b }
function Add-Line([int]$Delta, [string]$Reason, [string]$Set = '') {
  $line = "$Delta`t$($Reason -replace '[\t\r\n]+', ' ')" + $(if ($Set) { "`t$Set" })
  [IO.File]::AppendAllText($ledger, $line + "`r`n")
}

if ($a.Count -ge 2 -and $a[0] -eq 'version' -and $a[1] -eq '--json') {
  Out-Json '{"version":"0.2.0-fake","api":1,"commands":["version","collection","pack sets","pack open","pack odds","pack grant","pack tokens"]}'; exit 0
}
if ($a.Count -ge 2 -and $a[0] -eq 'collection' -and $a[1] -eq '--json') {
  $f = if ($env:FAKE_POKESHELL_COLLECTION) { $env:FAKE_POKESHELL_COLLECTION } else { Join-Path $fixtures 'collection.json' }
  Out-Json ([IO.File]::ReadAllText($f)); exit 0
}
# the sets and their price-weighted chances in `pack open random` (pokeshell docs/BOOSTERS.md "Random packs")
$sets = @(
  [ordered]@{ id = 'swsh9'; name = 'Brilliant Stars'; series = 'Sword & Shield'; price = 16.24; chance = 0.5838; oneIn = 1.7 }
  [ordered]@{ id = 'swsh7'; name = 'Evolving Skies'; series = 'Sword & Shield'; price = 43.97; chance = 0.3850; oneIn = 2.6 }
  [ordered]@{ id = 'neo1'; name = 'Neo Genesis'; series = 'Neo'; price = 741.61; chance = 0.0147; oneIn = 67.9 }
  [ordered]@{ id = 'base1'; name = 'Base'; series = 'Base'; price = 632.50; chance = 0.0165; oneIn = 60.7 }
)
if ($a.Count -ge 3 -and $a[0] -eq 'pack' -and $a[1] -eq 'sets' -and $a[2] -eq '--json') {
  $list = @(foreach ($x in $sets) { [ordered]@{ id = $x.id; name = $x.name; series = $x.series; cards = 69; openable = $true; price = $x.price; chance = $x.chance; oneIn = $x.oneIn; odds = @([ordered]@{ tier = 'common'; weight = 50000 }); art = $null } })
  Out-Obj ([ordered]@{ pack = 'pokemon'; tokens = (Get-Balance); priceExponent = 0.7; sets = $list }); exit 0
}
if ($a.Count -ge 4 -and $a[0] -eq 'pack' -and $a[1] -eq 'odds' -and $a[2] -eq 'random' -and $a[3] -eq '--json') {
  $list = @(foreach ($x in $sets) { [ordered]@{ set = $x.id; name = $x.name; price = $x.price; priceSource = $null; openable = $true; chance = $x.chance; oneIn = $x.oneIn } })
  Out-Obj ([ordered]@{ set = 'random'; priceExponent = 0.7; sets = $list }); exit 0
}
if ($a.Count -ge 3 -and $a[0] -eq 'pack' -and $a[1] -eq 'tokens' -and $a[2] -eq '--json') {
  Out-Obj ([ordered]@{ balance = (Get-Balance); recent = @(Get-Lines | Select-Object -Last 20) }); exit 0
}
if ($a.Count -ge 3 -and $a[0] -eq 'pack' -and $a[1] -eq 'grant' -and $a -contains '--json') {
  $n = 0
  if (-not [int]::TryParse($a[2], [ref]$n) -or $n -lt 1 -or $n -gt 1000) { Out-Json '{"error":"usage: pokeshell pack grant <n (1-1000)> --reason <text> [--json]","message":"bad n","code":"error"}'; exit 1 }
  $i = [array]::IndexOf($a, '--reason')
  $reason = if ($i -ge 0 -and $i + 1 -lt $a.Count) { $a[$i + 1] } else { 'granted' }
  Add-Line $n $reason
  Out-Obj ([ordered]@{ granted = $n; reason = $reason; id = '01FAKEGRANT0000000000000000'; balance = (Get-Balance) }); exit 0
}
if ($a.Count -ge 4 -and $a[0] -eq 'pack' -and $a[1] -eq 'open' -and $a[3] -eq '--json') {
  $bal = Get-Balance
  $random = $a[2] -eq 'random'
  if ($random -and $env:FAKE_POKESHELL_NO_SETS) { Out-Obj ([ordered]@{ error = 'no sets to open'; message = 'no set is openable with a price'; code = 'no-sets'; tokens = $bal }); exit 1 }
  $rolled = if ($random) { if ($env:FAKE_POKESHELL_RANDOM_SET) { $env:FAKE_POKESHELL_RANDOM_SET } else { 'base1' } } else { $a[2] }
  $info = $sets | Where-Object { $_.id -eq $rolled } | Select-Object -First 1
  if ($random -and -not $info) { $info = $sets[-1]; $rolled = 'base1' }
  if (-not $random -and $a[2] -ne 'base1') { Out-Obj ([ordered]@{ error = "no set $($a[2])"; message = "no set $($a[2])"; code = 'error'; tokens = $bal }); exit 1 }
  if ($bal -lt 1) { Out-Obj ([ordered]@{ error = "no pack tokens (balance $bal)"; message = "no pack tokens (balance $bal): win a battle"; code = 'no-tokens'; tokens = $bal }); exit 1 }
  Add-Line -1 "opened $rolled$(if ($random) { ' (random)' })" $rolled
  Add-Content -Path (Join-Path $home_ 'opened.log') -Value ($(if ($random) { "random:$rolled" } else { $rolled }))
  $o = [ordered]@{
    set = $rolled; setName = $info.name; setChance = $info.chance; setOneIn = $info.oneIn; setPrice = $info.price; random = $random
    packId = '01FAKEPACK0000000000000000'; secure = $true
    cards = @(
      [ordered]@{ id = 'base1-58'; card = 'base1-58'; name = 'Pikachu'; number = '58/102'; rarity = 'Common'; tier = 'common'; hit = 0; shiny = $false; isNew = $false; character = 'pikachu'; image = 'img/pokemon/pikachu/base1-58.png'; png = $null; pullId = '01TESTPULL0000000000000000'; pull = '01TESTPULL0000000000000000' },
      [ordered]@{ id = 'base1-4'; card = 'base1-4'; name = 'Charizard'; number = '4/102'; rarity = 'Rare Holo'; tier = 'rare-holo'; hit = 2; shiny = $false; isNew = $true; character = 'charizard'; image = 'img/pokemon/charizard/base1-4.png'; png = $null; pullId = '01TESTPULL0000000000000001'; pull = '01TESTPULL0000000000000001' }
    )
    spent = 1; tokens = (Get-Balance); imageRoot = (Join-Path $home_ 'web')
  }
  Out-Obj $o; exit 0
}
Write-Host "pokeshell: unknown command '$($a -join ' ')'" -ForegroundColor Red
exit 1
