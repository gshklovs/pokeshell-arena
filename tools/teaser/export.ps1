# The teaser's two published files from the composed cuts (tools/teaser/README.md):
#   docs\media\teaser.gif  800x450, 20 fps, one 112-colour palette over the whole cut, ordered dither (crisp pixel art,
#                          small frame deltas), from shots\teaser\gif-base.mp4 (compose.py --scale 0.41667 --stable 14)
#   docs\media\teaser.mp4  1920x1080, 50 fps, H.264, from shots\teaser\master.mp4 (compose.py)
param([int]$Fps = 20, [int]$Colors = 112, [string]$Dither = 'bayer:bayer_scale=5', [int]$Crf = 25)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$shots = Join-Path $root 'shots\teaser'
$media = Join-Path $root 'docs\media'
New-Item -ItemType Directory -Force $media | Out-Null
$pal = Join-Path $shots 'palette.png'
$base = Join-Path $shots 'gif-base.mp4'
$gif = Join-Path $media 'teaser.gif'
ffmpeg -y -loglevel error -i $base -vf "fps=$Fps,palettegen=max_colors=$($Colors):stats_mode=diff:reserve_transparent=0" $pal
if ($LASTEXITCODE) { throw 'palettegen failed' }
ffmpeg -y -loglevel error -i $base -i $pal -lavfi "fps=$Fps[v];[v][1:v]paletteuse=dither=$($Dither):diff_mode=rectangle" -loop 0 $gif
if ($LASTEXITCODE) { throw 'paletteuse failed' }
$mp4 = Join-Path $media 'teaser.mp4'
ffmpeg -y -loglevel error -i (Join-Path $shots 'master.mp4') -c:v libx264 -preset slow -crf $Crf -pix_fmt yuv420p -profile:v high -movflags +faststart -an $mp4
if ($LASTEXITCODE) { throw 'mp4 failed' }
foreach ($f in $gif, $mp4) { '{0}  {1:N2} MB' -f $f, ((Get-Item $f).Length / 1MB) }
