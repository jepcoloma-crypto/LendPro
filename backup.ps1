# LendPro Database Backup Script
# Reads connection from server/.env and runs pg_dump

$envFile = Join-Path $PSScriptRoot "server\.env"
if (-not (Test-Path $envFile)) { Write-Host "server/.env not found" -ForegroundColor Red; exit 1 }

$content = Get-Content $envFile
$hostName = ($content | Select-String '(?<=DB_HOST=).*' | ForEach-Object { $_.Matches.Value })
$port = ($content | Select-String '(?<=DB_PORT=).*' | ForEach-Object { $_.Matches.Value })
if (-not $port) { $port = '5432' }
$db = ($content | Select-String '(?<=DB_NAME=).*' | ForEach-Object { $_.Matches.Value })
if (-not $db) { $db = 'lending_db' }
$user = ($content | Select-String '(?<=DB_USER=).*' | ForEach-Object { $_.Matches.Value })
if (-not $user) { $user = 'postgres' }
$pass = ($content | Select-String '(?<=DB_PASSWORD=).*' | ForEach-Object { $_.Matches.Value })

if (-not $hostName -or -not $pass) {
    Write-Host "Missing DB_HOST, DB_USER, or DB_PASSWORD in .env" -ForegroundColor Red; exit 1
}

$date = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$outFile = Join-Path $PSScriptRoot "lendpro-backup-$date.sql"

Write-Host "Backing up $db on $hostName ..." -ForegroundColor Cyan
$env:PGPASSWORD = $pass
pg_dump --host $hostName --port $port --username $user --dbname $db --no-owner --no-acl > $outFile 2>$null

if ($LASTEXITCODE -eq 0) {
    $size = (Get-Item $outFile).Length
    Write-Host "Done: $outFile ($([math]::Round($size/1KB)) KB)" -ForegroundColor Green
} else {
    Write-Host "pg_dump failed (exit code $LASTEXITCODE). Is pg_dump installed and in PATH?" -ForegroundColor Red
    if (Test-Path $outFile) { Remove-Item $outFile }
}
$env:PGPASSWORD = $null
