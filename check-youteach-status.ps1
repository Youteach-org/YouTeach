$ErrorActionPreference = "Stop"
Set-Location (Get-Location).Path

Write-Host ""
Write-Host "GIT STATUS" -ForegroundColor Cyan
git status

Write-Host ""
Write-Host "REMOTE" -ForegroundColor Cyan
git remote -v

Write-Host ""
Write-Host "BRANCH" -ForegroundColor Cyan
git branch