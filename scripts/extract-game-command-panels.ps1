param(
  [Parameter(Mandatory = $true)]
  [string]$VillagerScreenshot,

  [Parameter(Mandatory = $true)]
  [string]$EconomicScreenshot,

  [Parameter(Mandatory = $true)]
  [string]$MilitaryScreenshot,

  [hashtable]$AdditionalPanels = @{},

  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\public\assets\microsoft-game-content")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Coordinates verified against 1920x1080 AoE2: DE Steam screenshots.
$expectedWidth = 1920
$expectedHeight = 1080
$panelX = 0
$panelY = 897
$panelWidth = 273
$panelHeight = 183

# Slot geometry inside the cropped panel. Retained for future per-slot
# extraction or alignment corrections.
$slotX = 22
$slotY = 22
$slotWidth = 40
$slotHeight = 40
$slotColumnPitch = 48
$slotRowPitch = 47

Add-Type -AssemblyName System.Drawing

$panels = @(
  @{ Source = $VillagerScreenshot; Output = "villager-command-panel.png" },
  @{ Source = $EconomicScreenshot; Output = "economic-buildings-panel.png" },
  @{ Source = $MilitaryScreenshot; Output = "military-buildings-panel.png" }
)

foreach ($output in ($AdditionalPanels.Keys | Sort-Object)) {
  if ($output -notmatch "^[a-z0-9-]+-panel\.png$") {
    throw "Additional panel output '$output' must be a lowercase *-panel.png filename."
  }
  $panels += @{ Source = [string]$AdditionalPanels[$output]; Output = [string]$output }
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

foreach ($panel in $panels) {
  $sourcePath = (Resolve-Path -LiteralPath $panel.Source).Path
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    if ($source.Width -ne $expectedWidth -or $source.Height -ne $expectedHeight) {
      throw "Expected a ${expectedWidth}x${expectedHeight} screenshot, but '$sourcePath' is $($source.Width)x$($source.Height). Update the documented crop coordinates before continuing."
    }

    $cropRectangle = [System.Drawing.Rectangle]::new(
      $panelX,
      $panelY,
      $panelWidth,
      $panelHeight
    )
    $crop = [System.Drawing.Bitmap]::new($panelWidth, $panelHeight)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($crop)
      try {
        $graphics.DrawImage(
          $source,
          0,
          0,
          $cropRectangle,
          [System.Drawing.GraphicsUnit]::Pixel
        )
      } finally {
        $graphics.Dispose()
      }

      $outputPath = Join-Path $OutputDirectory $panel.Output
      $temporaryPath = "$outputPath.tmp.png"
      $crop.Save($temporaryPath, [System.Drawing.Imaging.ImageFormat]::Png)
      Move-Item -LiteralPath $temporaryPath -Destination $outputPath -Force
      Write-Output "Wrote $outputPath"
    } finally {
      $crop.Dispose()
    }
  } finally {
    $source.Dispose()
  }
}

Write-Output "Panel crop: x=$panelX y=$panelY width=$panelWidth height=$panelHeight"
Write-Output "Slot grid: x=$slotX y=$slotY tile=${slotWidth}x${slotHeight} columnPitch=$slotColumnPitch rowPitch=$slotRowPitch"
