[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$tailscalePath = 'C:\Program Files\Tailscale\tailscale.exe'

if (-not (Test-Path -LiteralPath $tailscalePath)) {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw 'No se encontró winget. Instala Tailscale desde https://tailscale.com/download/windows y vuelve a ejecutar este script.'
  }
  & $winget.Source install --id Tailscale.Tailscale --exact --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $tailscalePath)) {
    throw 'No se pudo instalar Tailscale automáticamente.'
  }
}

Write-Host 'Tailscale está instalado. Se abrirá su inicio de sesión para unir esta computadora a tu red privada.'
Start-Process -FilePath $tailscalePath -ArgumentList 'up'
