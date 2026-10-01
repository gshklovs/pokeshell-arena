<#
A stand-in for a pokeshell from before the JSON commands (host tests): text output, `pack <x>` errors like
Invoke-Pack does ("no pack 'open'"), so every JSON endpoint must answer 501.
#>
$a = @($args)
if ($a.Count -ge 1 -and $a[0] -eq 'collection') { Write-Output 'pokemon  caught 3 / 990'; exit 0 }
if ($a.Count -ge 1 -and $a[0] -eq 'version') { Write-Output 'pokeshell source'; exit 0 }
if ($a.Count -ge 2 -and $a[0] -eq 'pack') { Write-Host "pokeshell: no pack '$($a[1])' (available: pokemon, all)" -ForegroundColor Red; exit 1 }
Write-Host 'pokeshell - every new Windows Terminal tab is a pack pull'
exit 0
