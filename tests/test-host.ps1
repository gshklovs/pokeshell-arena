<#
arena-host end to end, in temp dirs only (never %LOCALAPPDATA%\pokeshell or \pokeshell-arena):
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\test-host.ps1 [-Exe <arena-host.exe>] [-Dist <dist>]
Runs three hosts: with a fake pokeshell (every JSON command), an old pokeshell (none of them: 501), and none (503).
Each host is stopped through POST /api/shutdown (or its idle exit), never killed.
#>
param([string]$Exe, [string]$Dist)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
if (-not $Exe) { $Exe = Join-Path $root 'host\target\release\arena-host.exe' }
if (-not (Test-Path $Exe)) { throw "arena-host isn't built: cargo build --release --manifest-path host\Cargo.toml" }
if (-not $Dist) { $Dist = Join-Path $root 'dist' }
$env:POKESHELL_REAL_WT = 'off'
Add-Type -AssemblyName System.Net.Http

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("arena-host-test-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $tmp | Out-Null
$script:fails = 0; $script:passes = 0
function Check([bool]$ok, [string]$what) {
  if ($ok) { $script:passes++; Write-Host "  ok   $what" -ForegroundColor Green } else { $script:fails++; Write-Host "  FAIL $what" -ForegroundColor Red }
}

$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds(90)
function Req([string]$Method, [string]$Path, $Body = $null, [hashtable]$Headers = @{}, [string]$ContentType = 'application/json') {
  $m = New-Object System.Net.Http.HttpMethod $Method
  $r = New-Object System.Net.Http.HttpRequestMessage $m, ($script:base + $Path)
  foreach ($k in $Headers.Keys) { if ($k -eq 'Host') { $r.Headers.Host = $Headers[$k] } else { [void]$r.Headers.TryAddWithoutValidation($k, $Headers[$k]) } }
  if ($null -ne $Body) {
    $text = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 8 -Compress }
    $r.Content = New-Object System.Net.Http.StringContent $text, ([Text.Encoding]::UTF8), $ContentType
  }
  $resp = $client.SendAsync($r).GetAwaiter().GetResult()
  $raw = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $json = $null
  try { $json = $raw | ConvertFrom-Json } catch { }
  [pscustomobject]@{ status = [int]$resp.StatusCode; json = $json; raw = $raw; type = [string]$resp.Content.Headers.ContentType }
}

function Start-Host([string]$Name, [string[]]$Extra) {
  $state = Join-Path $tmp "$Name-state"
  New-Item -ItemType Directory -Force $state | Out-Null
  $a = @('--port', '0', '--state', "`"$state`"", '--dist', "`"$Dist`"") + $Extra
  $p = Start-Process -FilePath $Exe -ArgumentList $a -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $tmp "$Name.out") -RedirectStandardError (Join-Path $tmp "$Name.err")
  $hj = Join-Path $state 'host.json'
  for ($i = 0; $i -lt 100 -and -not (Test-Path $hj); $i++) { Start-Sleep -Milliseconds 100 }
  if (-not (Test-Path $hj)) { throw "host $Name didn't start: $(Get-Content (Join-Path $tmp "$Name.err") -Raw)" }
  $info = Get-Content $hj -Raw | ConvertFrom-Json
  $script:base = "http://127.0.0.1:$($info.port)"
  [pscustomobject]@{ proc = $p; state = $state; port = $info.port }
}

function Stop-Host($h) {
  $r = Req POST '/api/shutdown' @{}
  Check ($r.status -eq 200) 'POST /api/shutdown'
  Check ($h.proc.WaitForExit(5000)) 'the host exited by itself'
  Check (-not (Test-Path (Join-Path $h.state 'host.json'))) 'host.json removed on exit'
}

try {
  # ---------------------------------------------------------------- 1. with a fake pokeshell
  Write-Host 'host with a fake pokeshell (every JSON command)'
  $shellHome = Join-Path $tmp 'pokeshell-home'
  New-Item -ItemType Directory -Force (Join-Path $shellHome 'web\img\pokemon\pikachu') | Out-Null
  [IO.File]::WriteAllBytes((Join-Path $shellHome 'web\img\pokemon\pikachu\base1-58.png'), [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='))
  $fake = Join-Path $root 'tests\fixtures\fake-pokeshell\scripts\pokeshell.ps1'
  $h = Start-Host 'fake' @('--pokeshell', "`"$fake`"", '--pokeshell-home', "`"$shellHome`"", '--no-idle-exit')

  $r = Req GET '/api/health'
  Check ($r.status -eq 200 -and $r.json.ok -and $r.json.api -eq 1) 'health'
  Check ($r.json.pokeshell.found -eq $true) 'health: pokeshell found'
  $ledger = Join-Path $shellHome 'fake-tokens.log'
  $grants = { @(if (Test-Path $ledger) { Get-Content $ledger | Where-Object { $_ -match '^\d+\t' } }) }
  $r = Req GET '/api/wallet'
  Check ($r.status -eq 200 -and $r.json.tokens -eq 0 -and $null -ne $r.json.recent) "wallet: pokeshell's balance, starts at 0"
  $r = Req POST '/api/pack/open' @{ set = 'base1' }
  Check ($r.status -eq 402 -and $r.json.error -eq 'no_tokens' -and $r.json.tokens -eq 0) "pack open without tokens: pokeshell's no-tokens -> 402"

  $win = @{ matchId = 'm-1'; mode = '1v1'; difficulty = 'normal'; won = $true; prizes = 1; ticks = 1200; seed = 5; arena = 'lapras-lagoon'; team = @('base1-58'); opponent = @('base1-63') }
  # a win earns tokens toward the next pack (1v1 1, team 2, +1 hard, +2 expert); 10 make a pack: pokeshell pack grant 1
  $r = Req POST '/api/match/result' $win
  Check ($r.status -eq 200 -and $r.json.points -eq 1 -and $r.json.granted -eq 0 -and $r.json.tokens -eq 0 -and $r.json.progress.points -eq 1 -and $r.json.progress.perPack -eq 10) 'a 1v1 win: 1 token toward the next pack, no pack yet'
  Check (@(& $grants).Count -eq 0) 'no pack grant below 10 tokens'
  $r = Req POST '/api/match/result' $win
  Check ($r.status -eq 200 -and $r.json.granted -eq 0 -and $r.json.duplicate -eq $true -and $r.json.points -eq 0 -and $r.json.progress.points -eq 1) 'the same matchId adds nothing'
  $lose = $win.Clone(); $lose.matchId = 'm-2'; $lose.won = $false
  $r = Req POST '/api/match/result' $lose
  Check ($r.json.points -eq 0 -and $r.json.granted -eq 0 -and $r.json.progress.points -eq 1) 'a loss earns nothing'
  $bad = $win.Clone(); $bad.matchId = '../x'
  Check ((Req POST '/api/match/result' $bad).status -eq 400) 'a bad matchId: 400'
  $badDiff = $win.Clone(); $badDiff.matchId = 'm-x'; $badDiff.difficulty = 'insane'
  Check ((Req POST '/api/match/result' $badDiff).status -eq 400) 'a bad difficulty: 400'
  $hard = $win.Clone(); $hard.matchId = 'm-3'; $hard.difficulty = 'hard'; $hard.mode = 'team'
  $r = Req POST '/api/match/result' $hard
  Check ($r.json.points -eq 3 -and $r.json.progress.points -eq 4) 'a team win on hard: 3 tokens (4 / 10)'
  $exp = $win.Clone(); $exp.matchId = 'm-4'; $exp.difficulty = 'expert'
  $r = Req POST '/api/match/result' $exp
  Check ($r.json.points -eq 3 -and $r.json.progress.points -eq 7) 'a 1v1 win on expert: 3 tokens (7 / 10)'
  $texp = $win.Clone(); $texp.matchId = 'm-5'; $texp.difficulty = 'expert'; $texp.mode = 'team'
  $r = Req POST '/api/match/result' $texp
  Check ($r.json.points -eq 4 -and $r.json.granted -eq 1 -and $r.json.tokens -eq 1 -and $r.json.progress.points -eq 1) 'a team win on expert crosses 10: one pack, 1 token carried over'
  $g = @(& $grants)
  Check ($g.Count -eq 1 -and $g[0] -eq "1`tarena win m-5") 'the pack went to pokeshell: pack grant 1 --reason "arena win m-5"'
  Check (@(& $grants).Count -eq 1 -and (Req POST '/api/match/result' $texp).json.duplicate -eq $true -and @(& $grants).Count -eq 1) 'a replayed crossing never grants again'
  $w = Req GET '/api/wallet'
  Check ($w.json.tokens -eq 1 -and $w.json.progress.points -eq 1) 'wallet: 1 pack to open, 1 / 10 toward the next'

  $r = Req POST '/api/pack/open' @{ set = 'base1' }
  Check ($r.status -eq 200 -and @($r.json.cards).Count -eq 2 -and $r.json.tokens -eq 0 -and $r.json.imageBase -eq '/pokeshell/') 'pack open: cards from pokeshell, its token spent, imageBase'
  Check (Test-Path (Join-Path $shellHome 'opened.log')) 'pokeshell ran with POKESHELL_HOME = the given home'
  Check (-not (Test-Path (Join-Path $h.state 'tokens.log'))) 'the host keeps no wallet of its own'
  # more packs for the open tests, straight into the fake pokeshell's wallet
  $env:POKESHELL_HOME = $shellHome
  [void](& powershell -NoProfile -ExecutionPolicy Bypass -File $fake pack grant 3 --reason test --json)
  Remove-Item Env:POKESHELL_HOME
  Check ((Req GET '/api/wallet').json.tokens -eq 3) 'the wallet is pokeshell''s'
  $r = Req POST '/api/pack/open' @{ set = 'nope' }
  Check ($r.status -eq 502 -and "$($r.json.message)" -match 'no set nope') "pokeshell's own error comes back (502)"
  Check ((Req GET '/api/wallet').json.tokens -eq 3) 'a failed open spends nothing'
  Check ((Req POST '/api/pack/open' @{ set = '..\x' }).status -eq 400) 'a bad set id: 400'
  # random packs: what spending a token does in the game (pokeshell rolls the set by pack price, then the pack)
  $r = Req POST '/api/pack/open' @{ random = $true }
  Check ($r.status -eq 200 -and $r.json.random -eq $true -and $r.json.set -eq 'base1' -and $r.json.setName -eq 'Base' -and $r.json.setOneIn -eq 60.7 -and $r.json.tokens -eq 2 -and $r.json.imageBase -eq '/pokeshell/') 'pack open random: the rolled set, its odds, one token spent'
  Check ((Get-Content (Join-Path $shellHome 'fake-calls.log')) -contains 'pack open random --json --export') 'the host ran pokeshell pack open random --json --export'
  $r = Req POST '/api/pack/open' @{ set = 'random' }
  Check ($r.status -eq 200 -and $r.json.random -eq $true -and $r.json.tokens -eq 1) 'set = "random" is the same random open'
  $r = Req GET '/api/pack/odds'
  Check ($r.status -eq 200 -and $r.json.set -eq 'random' -and @($r.json.sets).Count -eq 4 -and ($r.json.sets | Where-Object set -eq 'base1').oneIn -eq 60.7) 'pack odds: the set table of random packs'
  $r = Req GET '/api/sets'
  Check ($r.status -eq 200 -and ($r.json.sets | Where-Object id -eq 'neo1').chance -gt 0) 'sets carry price, chance and oneIn'
  Check ((Req GET '/api/wallet').json.tokens -eq 1) 'the wallet after two random opens'
  # quitting a match: a forfeit is a loss, earns nothing (even if it claims a win), and says so in matches.jsonl
  $before = (Req GET '/api/wallet').json
  $quit = $win.Clone(); $quit.matchId = 'm-6'; $quit.won = $false; $quit.forfeit = $true; $quit.mode = 'team'; $quit.difficulty = 'expert'
  $r = Req POST '/api/match/result' $quit
  Check ($r.status -eq 200 -and $r.json.points -eq 0 -and $r.json.granted -eq 0 -and $r.json.tokens -eq $before.tokens) 'a forfeit earns no tokens'
  $cheat = $quit.Clone(); $cheat.matchId = 'm-7'; $cheat.won = $true
  $r = Req POST '/api/match/result' $cheat
  Check ($r.status -eq 200 -and $r.json.points -eq 0 -and $r.json.granted -eq 0) 'a forfeit reported as a win still earns nothing'
  $after = (Req GET '/api/wallet').json
  Check ($after.tokens -eq $before.tokens -and $after.progress.points -eq $before.progress.points) 'the wallet and the progress are unchanged by forfeits'
  $lines = @(Get-Content (Join-Path $h.state 'matches.jsonl') | ForEach-Object { $_ | ConvertFrom-Json })
  Check ($lines.Count -eq 7) 'matches.jsonl: one line per match'
  Check ((($lines | ForEach-Object points) -join ',') -eq '1,0,3,3,4,0,0' -and (($lines | ForEach-Object granted) -join ',') -eq '0,0,0,0,1,0,0') 'matches.jsonl records the tokens earned and the packs granted\'
  $f = @($lines | Where-Object { $_.forfeit -eq $true })
  Check ($f.Count -eq 2 -and ($f | Where-Object { $_.won -ne $false }).Count -eq 0) 'matches.jsonl records forfeits as forfeit, and as losses'
  Check (@($lines | Where-Object { $null -ne $_.forfeit -and $_.matchId -notin 'm-6', 'm-7' }).Count -eq 0) 'finished matches carry no forfeit flag'

  $r = Req GET '/api/collection'
  Check ($r.status -eq 200 -and @($r.json.cards).Count -eq 4 -and $r.json.counts.caught -eq 3) 'collection passes through'
  $r = Req GET '/api/sets'
  Check ($r.status -eq 200 -and @($r.json.sets).Count -eq 4 -and @($r.json.sets | ForEach-Object id) -contains 'base1') 'sets pass through'

  $r = Req GET '/api/teams'
  Check ($r.status -eq 200 -and $r.json.version -eq 1 -and @($r.json.teams).Count -eq 0) 'teams: empty default'
  $team = @{ version = 1; selected = 't1'; teams = @(@{ id = 't1'; name = 'Sparks'; mode = '1v1'; members = @(@{ card = 'base1-58' }); energy = @('Lightning', 'Lightning', 'Water') }) }
  Check ((Req PUT '/api/teams' $team).status -eq 200) 'teams: PUT a valid loadout'
  Check ((Req GET '/api/teams').json.teams[0].name -eq 'Sparks') 'teams: saved'
  $noEnergy = @{ version = 1; selected = $null; teams = @(@{ id = 't2'; name = 'Trio'; mode = 'team'; members = @(@{ card = 'base1-58' }, @{ card = 'base1-63' }, @{ card = 'base1-46' }) }) }
  Check ((Req PUT '/api/teams' $noEnergy).status -eq 200) 'teams: energy is optional (one energy meter)'
  $badTeam = @{ version = 1; teams = @(@{ id = 't1'; mode = '1v1'; members = @(); energy = @('Nope') }) }
  $r = Req PUT '/api/teams' $badTeam
  Check ($r.status -eq 400 -and @($r.json.problems).Count -ge 2) 'teams: a bad loadout is refused with its problems'

  $r = Req GET '/'
  Check ($r.status -eq 200 -and $r.type -like 'text/html*') 'GET / serves the game'
  Check ((Req GET '/arenas/index.json').status -eq 200) 'arena files are served'
  $r = Req GET '/pokeshell/img/pokemon/pikachu/base1-58.png'
  Check ($r.status -eq 200 -and $r.type -eq 'image/png') "pokeshell's web export images are served"
  Check ((Req GET '/pokeshell/img/..%2f..%2ffake-calls.log').status -ne 200) 'no path traversal out of the image folder'
  Check ((Req GET '/%2e%2e/%2e%2e/Cargo.toml').status -ne 200) 'no path traversal out of dist'
  Check ((Req GET '/api/health' $null @{ Host = 'evil.example:80' }).status -eq 403) 'a foreign Host header: 403'
  Check ((Req POST '/api/heartbeat' '{}' @{ Origin = 'http://evil.example' }).status -eq 403) 'a foreign Origin: 403'
  Check ((Req POST '/api/heartbeat' 'x=1' @{} 'application/x-www-form-urlencoded').status -eq 415) 'a form POST: 415'
  Check ((Req GET '/api/nope').status -eq 404) 'unknown API route: 404'
  Stop-Host $h

  # ---------------------------------------------------------------- 2. with an old pokeshell
  Write-Host 'host with an old pokeshell (no JSON commands)'
  $old = Join-Path $root 'tests\fixtures\old-pokeshell\scripts\pokeshell.ps1'
  $h = Start-Host 'old' @('--pokeshell', "`"$old`"", '--pokeshell-home', "`"$(Join-Path $tmp 'old-home')`"", '--no-idle-exit')
  $r = Req GET '/api/collection'
  Check ($r.status -eq 501 -and $r.json.error -eq 'pokeshell_unsupported' -and $r.json.need -eq 'pokeshell collection --json') 'collection: 501 with what it needs'
  Check ((Req GET '/api/sets').status -eq 501) 'sets: 501'
  foreach ($i in 1, 2) { [void](Req POST '/api/match/result' @{ matchId = "o-$i"; mode = 'team'; difficulty = 'expert'; won = $true }) }
  $r = Req POST '/api/match/result' @{ matchId = 'o-3'; mode = 'team'; difficulty = 'expert'; won = $true }
  Check ($r.status -eq 200 -and $r.json.granted -eq 0 -and $r.json.error -eq 'pokeshell_unsupported' -and $r.json.progress.points -eq 12) 'a pack without pack grant: recorded, 0 granted, says why, its tokens kept'
  $rec = @(Get-Content (Join-Path $h.state 'matches.jsonl') | ConvertFrom-Json)[-1]
  Check ($rec.matchId -eq 'o-3' -and $rec.granted -eq 0 -and $rec.points -eq 4 -and $rec.grantError -eq 'pokeshell_unsupported') 'matches.jsonl keeps the match and the grant error'
  $r = Req POST '/api/pack/open' @{ set = 'base1' }
  Check ($r.status -eq 501 -and $r.json.need -eq 'pokeshell pack open <set> --json') 'pack open: 501'
  $r = Req POST '/api/pack/open' @{ random = $true }
  Check ($r.status -eq 501 -and $r.json.need -eq 'pokeshell pack open random --json') 'pack open random: 501'
  $r = Req GET '/api/wallet'
  Check ($r.status -eq 501 -and $r.json.need -eq 'pokeshell pack tokens --json') 'wallet: 501'
  Stop-Host $h

  # ---------------------------------------------------------------- 3. without pokeshell, idle exit
  Write-Host 'host without pokeshell (practice mode), idle exit'
  $h = Start-Host 'none' @('--pokeshell', "`"$(Join-Path $tmp 'nowhere\pokeshell.ps1')`"", '--pokeshell-home', "`"$(Join-Path $tmp 'none-home')`"", '--idle-secs', '5')
  $r = Req GET '/api/health'
  Check ($r.json.pokeshell.found -eq $false) 'health: pokeshell not found'
  $r = Req GET '/api/collection'
  Check ($r.status -eq 503 -and $r.json.error -eq 'pokeshell_missing') 'collection: 503'
  $r = Req GET '/api/wallet'
  Check ($r.status -eq 503 -and $r.json.error -eq 'pokeshell_missing') 'wallet: 503 (pokeshell holds it)'
  $r = Req POST '/api/match/result' @{ matchId = 'n-1'; mode = 'team'; difficulty = 'hard'; won = $true }
  Check ($r.status -eq 200 -and $r.json.granted -eq 0 -and $r.json.points -eq 3 -and $r.json.progress.points -eq 3) 'a win without pokeshell: recorded, its tokens counted, no pack'
  Check ((Req POST '/api/heartbeat' @{}).status -eq 200) 'heartbeat'
  Check ($h.proc.WaitForExit(12000)) 'idle exit after the heartbeats stop'

  # ---------------------------------------------------------------- 4. the pokearena launcher
  Write-Host 'the pokearena launcher (-NoOpen: no browser)'
  $lstate = Join-Path $tmp 'launcher-state'
  $env:POKEARENA_POKESHELL = $fake
  $env:POKESHELL_HOME = $shellHome
  $launcher = Join-Path $root 'scripts\pokearena.ps1'
  $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $launcher start -NoOpen -State $lstate
  Check ("$out" -match 'pokearena: http://127\.0\.0\.1:\d+/') "start: $out"
  $info = Get-Content (Join-Path $lstate 'host.json') -Raw | ConvertFrom-Json
  $script:base = "http://127.0.0.1:$($info.port)"
  $r = Req GET '/api/health'
  Check ($r.json.pokeshell.found -eq $true -and $r.json.state -eq $lstate) 'the launched host found pokeshell (POKEARENA_POKESHELL) and uses the given state'
  $out2 = & powershell -NoProfile -ExecutionPolicy Bypass -File $launcher start -NoOpen -State $lstate
  Check ("$out2" -eq "$out") 'a second start reuses the running host'
  $st = & powershell -NoProfile -ExecutionPolicy Bypass -File $launcher status -State $lstate
  Check ("$st" -match 'pokeshell 0\.2\.0-fake') "status: $($st -join ' / ')"
  $p = Get-Process -Id $info.pid
  & powershell -NoProfile -ExecutionPolicy Bypass -File $launcher stop -State $lstate | Out-Null
  Check ($p.WaitForExit(5000)) 'stop: the host exited'
  Remove-Item Env:POKEARENA_POKESHELL, Env:POKESHELL_HOME
} finally {
  $client.Dispose()
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
Write-Host ""
Write-Host "host tests: $script:passes passed, $script:fails failed" -ForegroundColor ($(if ($script:fails) { 'Red' } else { 'Green' }))
exit ([int]($script:fails -gt 0))
