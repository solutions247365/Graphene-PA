<#
.SYNOPSIS
    Immediately shuts down the current Cloudflare quick tunnel and starts a fresh one.

.DESCRIPTION
    Cloudflare quick tunnels (TryCloudflare) generate a new random
    *.trycloudflare.com URL every time they start, and have no fixed name.
    This script force-stops any running cloudflared process, launches a new
    quick tunnel pointed at the given local port, then reads the log to print
    the new public URL.

.PARAMETER Port
    The local port to expose (the port your app is listening on). Default: 8080.

.PARAMETER LogFile
    Where cloudflared writes its log. The new URL is parsed from here.
    Default: <script folder>\tunnel.log

.PARAMETER WaitSeconds
    How long to wait for the tunnel to connect before reading the URL. Default: 5.

.EXAMPLE
    .\restart-tunnel.ps1
    Restarts the tunnel on localhost:8080.

.EXAMPLE
    .\restart-tunnel.ps1 -Port 3000
    Restarts the tunnel on localhost:3000.
#>
[CmdletBinding()]
param(
    [int]$Port = 8080,
    [string]$LogFile = (Join-Path $PSScriptRoot 'tunnel.log'),
    [int]$WaitSeconds = 5
)

$ErrorActionPreference = 'Stop'

# 1. Kill the current tunnel immediately (if any).
$existing = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Stopping $($existing.Count) running cloudflared process(es)..." -ForegroundColor Yellow
    $existing | Stop-Process -Force
    Start-Sleep -Seconds 1
} else {
    Write-Host "No cloudflared process was running." -ForegroundColor DarkGray
}

# 2. Start a fresh quick tunnel, logging to file so we can read the new URL.
if (Test-Path $LogFile) { Remove-Item $LogFile -Force }
Write-Host "Starting new quick tunnel on http://localhost:$Port ..." -ForegroundColor Cyan
Start-Process cloudflared `
    -ArgumentList "tunnel --url http://localhost:$Port --logfile `"$LogFile`"" `
    -WindowStyle Hidden

# 3. Wait for it to connect, then pull the new random URL out of the log.
Start-Sleep -Seconds $WaitSeconds

$url = $null
if (Test-Path $LogFile) {
    $match = Select-String -Path $LogFile -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' |
             Select-Object -Last 1
    if ($match) { $url = $match.Matches[0].Value }
}

if ($url) {
    Write-Host "`nTunnel is up:" -ForegroundColor Green
    Write-Host "  $url" -ForegroundColor Green
} else {
    Write-Warning "Tunnel started but no URL found yet. Check the log: $LogFile"
    Write-Warning "It may just need a few more seconds - try increasing -WaitSeconds."
}
