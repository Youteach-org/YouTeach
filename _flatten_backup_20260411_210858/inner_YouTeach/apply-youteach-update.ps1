param(
    [string]$CommitMessage = "Update YouTeach"
)

$ErrorActionPreference = "Stop"
Set-Location (Get-Location).Path

git add .
git commit -m $CommitMessage
git push origin main

Write-Host "Update pushed to GitHub." -ForegroundColor Green