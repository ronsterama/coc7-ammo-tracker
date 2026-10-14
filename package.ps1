# Builds both zips for the manifest-URL install:
#   coc7-ammo-tracker/coc7-ammo-tracker.zip  inner zip, module files only (the manifest's "download")
#   coc7-ammo-tracker.zip                    outer zip, the folder including the inner zip, to extract and upload
$ErrorActionPreference = 'Stop'
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'
$root = $PSScriptRoot
$module = Join-Path $root 'coc7-ammo-tracker'
$stage = Join-Path ([IO.Path]::GetTempPath()) 'coc7-ammo-tracker-stage'

# Stage outside OneDrive: zipping there directly records directories as read-only (dr-xr-xr-x)
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $stage | Out-Null
Copy-Item $module $stage -Recurse
$staged = Join-Path $stage 'coc7-ammo-tracker'
Remove-Item (Join-Path $staged 'coc7-ammo-tracker.zip') -Force -ErrorAction SilentlyContinue
attrib -R "$stage\*" /S /D | Out-Null

Push-Location $stage
try {
  & $tar -a -cf inner.zip coc7-ammo-tracker
  Copy-Item inner.zip (Join-Path $staged 'coc7-ammo-tracker.zip')
  Copy-Item inner.zip (Join-Path $module 'coc7-ammo-tracker.zip') -Force
  & $tar -a -cf outer.zip coc7-ammo-tracker
  Copy-Item outer.zip (Join-Path $root 'coc7-ammo-tracker.zip') -Force
} finally {
  Pop-Location
}
Write-Host 'Built coc7-ammo-tracker.zip and coc7-ammo-tracker/coc7-ammo-tracker.zip'
