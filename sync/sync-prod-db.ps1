param()

Write-Host "=== Sync Database Changes to Production ===" -ForegroundColor Cyan
cd C:\Projects\LendingApp

# Check for production env file
$prodEnv = "C:\Projects\LendingApp\server\.env.production"
$stagingEnv = "C:\Projects\LendingApp\server\.env.staging"
$currentEnv = "C:\Projects\LendingApp\server\.env"

if (-not (Test-Path $prodEnv)) {
    Write-Host "Production env file not found — copying from example..." -ForegroundColor Yellow
    Copy-Item "C:\Projects\LendingApp\sync\.env.production.example" $prodEnv
    Write-Host "Opened server\.env.production for editing — fill in your production DB credentials, save, and close." -ForegroundColor Cyan
    Start-Sleep -Seconds 1
    notepad $prodEnv
    Write-Host "`nRun sync-prod-db.cmd again after saving." -ForegroundColor Green
    pause
    exit 1
}

# Stop the server
Write-Host "`nStopping server..." -ForegroundColor Yellow
pm2 stop lendpro-server 2>$null

# Backup current staging env
Write-Host "Backing up current .env -> .env.staging" -ForegroundColor Yellow
Copy-Item $currentEnv $stagingEnv -Force

# Swap to production
Write-Host "Swapping to production database..." -ForegroundColor Yellow
Copy-Item $prodEnv $currentEnv -Force

# Run migration
Write-Host "`nRunning migrations against production..." -ForegroundColor Cyan
Push-Location "C:\Projects\LendingApp\server"
npm run migrate
$migrateOk = $LASTEXITCODE -eq 0
Pop-Location

# Restore staging env
Write-Host "`nRestoring .env from .env.staging" -ForegroundColor Yellow
Copy-Item $stagingEnv $currentEnv -Force

# Restart server
Write-Host "Starting server..." -ForegroundColor Yellow
pm2 start lendpro-server 2>$null
pm2 save 2>$null

if ($migrateOk) {
    Write-Host "`n=== Production database sync complete! ===" -ForegroundColor Green
} else {
    Write-Host "`n⚠ Migration reported errors. Check output above." -ForegroundColor Red
}

Write-Host "`nPress any key to close..." -ForegroundColor Gray
$host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
