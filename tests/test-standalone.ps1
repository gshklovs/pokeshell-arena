<#
The downloadable (standalone) arena end to end, on a temp state and its own port (never %LOCALAPPDATA%\pokeshell or
\pokeshell-arena*), with POKEARENA_NO_OPEN=1 so no browser opens:
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\test-standalone.ps1 [-Exe <pokeshell-arena.exe>] [-Port N]
The exe is the bundled build (cargo build --release --features bundle; release\pokeshell-arena.exe). It checks the
double-click launcher (start, reuse on a second launch, one host per state), the embedded game and card faces, the
starter packs (granted once, kept across restarts), opening packs (random and chosen), the collection with pull times,
match results (tokens toward the next pack, 10 = 1 pack, replays ignored), and that the host stops on request.
#>
param([string]$Exe, [int]$Port = 0)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
if (-not $Exe) {
  $Exe = @((Join-Path $root 'release\pokeshell-arena.exe'), (Join-Path $root 'host\target\bundle\release\arena-host.exe')) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Exe -or -not (Test-Path $Exe)) { throw 'no bundled build: npm run release:win (or cargo build --release --features bundle)' }
if (-not $Port) {
  # a port the OS says is free now (Windows reserves blocks of ports, so a fixed guess may not bind)
  $l = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0); $l.Start(); $Port = $l.LocalEndpoint.Port; $l.Stop()
}
Add-Type -AssemblyName System.Net.Http
$env:POKEARENA_NO_OPEN = '1'

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("arena-standalone-test-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$state = Join-Path $tmp 'state'
New-Item -ItemType Directory -Force $state | Out-Null
$script:fails = 0; $script:passes = 0
function Check([bool]$ok, [string]$what) {
  if ($ok) { $script:passes++; Write-Host "  ok   $what" -ForegroundColor Green } else { $script:fails++; Write-Host "  FAIL $what" -ForegroundColor Red }
}
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds(30)
$base = "http://127.0.0.1:$Port"
function Req([string]$Method, [string]$Path, $Body = $null) {
  $r = New-Object System.Net.Http.HttpRequestMessage (New-Object System.Net.Http.HttpMethod $Method), ($base + $Path)
  if ($null -ne $Body) { $r.Content = New-Object System.Net.Http.StringContent (($Body | ConvertTo-Json -Depth 8 -Compress)), ([Text.Encoding]::UTF8), 'application/json' }
  $resp = $client.SendAsync($r).GetAwaiter().GetResult()
  $bytes = $resp.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
  $raw = [Text.Encoding]::UTF8.GetString($bytes)
  $json = $null; try { $json = $raw | ConvertFrom-Json } catch { }
  [pscustomobject]@{ status = [int]$resp.StatusCode; json = $json; bytes = $bytes.Length; type = [string]$resp.Content.Headers.ContentType }
}
function Launch {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $p = Start-Process -FilePath $Exe -ArgumentList @('--state', "`"$state`"", '--port', $Port) -PassThru; $p.WaitForExit()
  [pscustomobject]@{ code = $p.ExitCode; ms = $sw.ElapsedMilliseconds }
}
function HostPid { (Get-Content (Join-Path $state 'host.json') -Raw | ConvertFrom-Json).pid }
function Stop-Arena {
  $id = HostPid
  $r = Req POST '/api/shutdown' @{}
  Check ($r.status -eq 200) 'POST /api/shutdown'
  $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
  Check ((-not $proc) -or $proc.WaitForExit(5000)) "the host ($id) exited"
}

try {
  Write-Host "standalone arena: $Exe ($([math]::Round((Get-Item $Exe).Length / 1MB, 1)) MB), state $state, port $Port"

  Write-Host 'launch (double-click)'
  $l = Launch
  Check ($l.code -eq 0) "the launcher exits 0 once the arena answers ($($l.ms) ms)"
  $h = Req GET '/api/health'
  Check ($h.status -eq 200 -and $h.json.mode -eq 'standalone' -and $h.json.bundled -eq $true) 'health: standalone, bundled'
  Check ($h.json.pokeshell.found -eq $false) 'no pokeshell involved'
  Check ($h.json.starter.granted -eq $true -and $h.json.starter.packs -eq 3) 'the starter packs are granted'
  $pid1 = HostPid

  Write-Host 'second launch reuses it'
  $l2 = Launch
  Check ($l2.code -eq 0) "the second launch exits 0 ($($l2.ms) ms)"
  Check ((HostPid) -eq $pid1) 'still the same host (one per state)'
  $hosts = @(Get-CimInstance Win32_Process -Filter "ExecutablePath = '$($Exe.Replace('\', '\\'))'" | Where-Object { $_.CommandLine -like "*$state*" })
  Check ($hosts.Count -eq 1) "one host process for this state ($($hosts.Count))"
  # a second server on the same state is refused (the state lock), even on another port
  $p2 = Start-Process -FilePath $Exe -ArgumentList @('--serve', '--state', "`"$state`"", '--port', '0') -PassThru; $p2.WaitForExit()
  Check ($p2.ExitCode -eq 3) "a second server on the state is refused (exit $($p2.ExitCode))"

  Write-Host 'the embedded game'
  $i = Req GET '/'
  Check ($i.status -eq 200 -and $i.type -like 'text/html*') "/ serves the game ($($i.bytes) bytes)"
  $fav = Req GET '/favicon.png'
  Check ($fav.status -eq 200 -and $fav.type -eq 'image/png') 'the favicon'
  $sp = Req GET '/sprites/index.json'
  Check ($sp.status -eq 200) 'battle sprites are bundled'
  $bg = Req GET '/arenas/growlithe-meadow/bg.png'
  Check ($bg.status -eq 200 -and $bg.bytes -gt 10000) "arena art is bundled ($($bg.bytes) bytes)"
  Check ((Req GET '/../host.json').status -ge 400) 'no path escapes'

  Write-Host 'wallet and the first packs'
  $w = Req GET '/api/wallet'
  Check ($w.json.tokens -eq 3) "3 packs to open ($($w.json.tokens))"
  Check ($w.json.progress.points -eq 0 -and $w.json.progress.perPack -eq 10) 'tokens toward the next pack: 0 / 10'
  $c0 = Req GET '/api/collection'
  Check ($c0.status -eq 200 -and @($c0.json.cards).Count -eq 0) 'the collection starts empty'
  $sets = Req GET '/api/sets'
  Check ($sets.status -eq 200 -and @($sets.json.sets).Count -ge 8 -and ($sets.json.sets | Where-Object openable).Count -ge 8) "pack sets: $(@($sets.json.sets).Count)"
  $odds = Req GET '/api/pack/odds'
  $sum = ($odds.json.sets | Measure-Object chance -Sum).Sum
  Check ([math]::Abs($sum - 1) -lt 0.001) "random-pack odds add up to 1 ($sum)"
  Check ((Req GET '/api/pack/odds?set=base1').json.outcomes.Count -ge 3) "a set's slot odds"

  $p = Req POST '/api/pack/open' @{ random = $true }
  Check ($p.status -eq 200 -and @($p.json.cards).Count -ge 5) "a random pack: $($p.json.setName), $(@($p.json.cards).Count) cards"
  Check ($p.json.random -eq $true -and $p.json.tokens -eq 2 -and $p.json.imageBase -eq '/pokeshell/') 'it spent one pack, imageBase /pokeshell/'
  $img = Req GET ('/pokeshell/' + $p.json.cards[0].image)
  Check ($img.status -eq 200 -and $img.type -eq 'image/png') "a card face is served ($($p.json.cards[0].image))"
  $q = Req POST '/api/pack/open' @{ set = 'swsh7' }
  Check ($q.status -eq 200 -and $q.json.set -eq 'swsh7' -and $q.json.random -eq $false) 'a chosen pack (Evolving Skies)'
  $r3 = Req POST '/api/pack/open' @{ random = $true }
  Check ($r3.status -eq 200 -and $r3.json.tokens -eq 0) 'the third starter pack'
  $none = Req POST '/api/pack/open' @{ random = $true }
  Check ($none.status -eq 402 -and $none.json.error -eq 'no_tokens') 'no packs left: 402'

  $c = Req GET '/api/collection'
  $cards = @($c.json.cards)
  $pulled = @($p.json.cards) + @($q.json.cards) + @($r3.json.cards)
  Check ($cards.Count -ge 10 -and $c.json.counts.pulls -eq $pulled.Count) "collection: $($cards.Count) cards, $($c.json.counts.pulls) pulls"
  $one = $cards[0]
  Check ($one.firstCaught -match '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$' -and $one.lastCaught -ge $one.firstCaught) 'pull times (firstCaught / lastCaught)'
  $withData = @($cards | Where-Object { $_.data -and $_.data.hp -and @($_.data.attacks).Count })
  Check ($withData.Count -ge 5) "cards carry gameplay data ($($withData.Count) battle-ready)"
  $face = (Req GET ('/pokeshell/img/' + $one.art.img))
  Check ($face.status -eq 200) "collection art paths resolve ($($one.art.img))"

  Write-Host 'match results: tokens toward the next pack'
  $m1 = Req POST '/api/match/result' @{ matchId = 'smoke-1'; mode = 'team'; difficulty = 'expert'; won = $true; prizes = 3; ticks = 900; seed = 1; arena = 'growlithe-meadow'; team = @($withData[0].card); opponent = @('base1-4') }
  Check ($m1.json.points -eq 4 -and $m1.json.granted -eq 0 -and $m1.json.progress.points -eq 4) 'a team expert win: +4 tokens, 4 / 10'
  $m2 = Req POST '/api/match/result' @{ matchId = 'smoke-2'; mode = 'team'; difficulty = 'expert'; won = $true }
  $m3 = Req POST '/api/match/result' @{ matchId = 'smoke-3'; mode = 'team'; difficulty = 'expert'; won = $true }
  Check ($m3.json.granted -eq 1 -and $m3.json.tokens -eq 1 -and $m3.json.progress.points -eq 2) 'crossing 10 grants one pack, 2 carry over'
  $dup = Req POST '/api/match/result' @{ matchId = 'smoke-3'; mode = 'team'; difficulty = 'expert'; won = $true }
  Check ($dup.json.duplicate -eq $true -and $dup.json.granted -eq 0 -and $dup.json.progress.points -eq 2) 'a replayed matchId adds nothing'
  $lost = Req POST '/api/match/result' @{ matchId = 'smoke-4'; mode = '1v1'; difficulty = 'easy'; won = $false }
  Check ($lost.json.points -eq 0) 'a loss earns nothing'
  $won = Req POST '/api/pack/open' @{ random = $true }
  Check ($won.status -eq 200 -and $won.json.tokens -eq 0) 'the earned pack opens'
  $before = (Req GET '/api/collection').json.counts

  Write-Host 'restart: the starter packs stay granted once'
  Stop-Arena
  Check (-not (Test-Path (Join-Path $state 'host.json'))) 'host.json removed on exit'
  $l3 = Launch
  Check ($l3.code -eq 0) 'relaunch after it stopped'
  $w2 = Req GET '/api/wallet'
  Check ($w2.json.tokens -eq 0 -and $w2.json.progress.points -eq 2) "no second starter grant; progress kept ($($w2.json.tokens) packs, $($w2.json.progress.points) / 10)"
  $starter = @(Get-Content (Join-Path $state 'tokens.log') | Where-Object { $_ -match 'kind=starter' })
  Check ($starter.Count -eq 1) 'tokens.log has one starter line'
  $after = (Req GET '/api/collection').json.counts
  Check ($after.caught -eq $before.caught -and $after.pulls -eq $before.pulls) "the collection survived the restart ($($after.caught) cards, $($after.pulls) pulls)"
  Stop-Arena

  Write-Host 'a plain double-click (no --port): its own port, or any free one'
  $p = Start-Process -FilePath $Exe -ArgumentList @('--state', "`"$state`"") -PassThru; $p.WaitForExit()
  Check ($p.ExitCode -eq 0) 'the launcher started it'
  $script:base = "http://127.0.0.1:$((Get-Content (Join-Path $state 'host.json') -Raw | ConvertFrom-Json).port)"
  Check ((Req GET '/api/health').json.mode -eq 'standalone') "it answers on $script:base"
  Stop-Arena
} finally {
  # anything still running on this temp state is ours: ask it to stop (never killed)
  try { if (Test-Path (Join-Path $state 'host.json')) { [void](Req POST '/api/shutdown' @{}) } } catch { }
  Start-Sleep -Milliseconds 400
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
Write-Host ''
Write-Host "standalone: $script:passes passed, $script:fails failed" -ForegroundColor $(if ($script:fails) { 'Red' } else { 'Green' })
if ($script:fails) { exit 1 }
