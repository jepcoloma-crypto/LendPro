Write-Host "=== Starting LendPro ===" -ForegroundColor Cyan
cd C:\Projects\LendingApp

# Start processes
pm2 restart ecosystem.config.js 2>$null
if ($LASTEXITCODE -ne 0) { pm2 start ecosystem.config.js 2>$null }
pm2 save

# Wait for tunnel URL
Write-Host "`nWaiting for tunnel URL..." -ForegroundColor Yellow
$tunnelUrl = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  $log = pm2 logs lendpro-tunnel --lines 30 --nostream 2>$null
  $match = $log | Select-String "https://.*\.trycloudflare\.com"
  if ($match) {
    $tunnelUrl = $match.Matches.Value
    break
  }
  Write-Host "." -NoNewline
}

if (-not $tunnelUrl) {
  Write-Host "`nFailed to get tunnel URL. Run: pm2 logs lendpro-tunnel" -ForegroundColor Red
  exit 1
}

Write-Host "`nTunnel URL: $tunnelUrl" -ForegroundColor Green

# Update Vercel
Write-Host "`nUpdating Vercel with new URL..." -ForegroundColor Yellow
cd C:\Projects\LendingApp\client
$tunnelUrl | vercel env add VITE_API_BASE_URL production --force 2>$null
vercel deploy --prod --yes 2>$null | Out-Null

Write-Host "`n=== Done! ===" -ForegroundColor Green
Write-Host "Frontend: https://lendpro-seven.vercel.app"
Write-Host "Backend:  $tunnelUrl"
Write-Host "`nPress any key to close..." -ForegroundColor Gray
$host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
