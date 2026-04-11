param(
    [string]$CommitMessage = "Update YouTeach"
)

$ErrorActionPreference = "Stop"

$projectPath = "C:\Users\BATMAN\Documents\Mecatrónica\8th semester\Saturday's class\youteachapp"

if (-not (Test-Path $projectPath)) {
    Write-Host "Project folder not found: $projectPath" -ForegroundColor Red
    exit 1
}

Set-Location $projectPath

Write-Host "Project path:" $projectPath -ForegroundColor Cyan

if (-not (Test-Path ".git")) {
    Write-Host "This folder is not a Git repository." -ForegroundColor Red
    exit 1
}

Write-Host "Checking Git status..." -ForegroundColor Yellow
git status

Write-Host "Adding files..." -ForegroundColor Yellow
git add .

Write-Host "Committing..." -ForegroundColor Yellow
git commit -m $CommitMessage

Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
git push origin main

Write-Host "Done." -ForegroundColor Green