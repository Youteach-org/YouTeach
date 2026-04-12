$ErrorActionPreference = "Stop"
Set-Location (Get-Location).Path

# FILE 1
@'
PUT_FULL_FILE_CONTENT_HERE
'@ | Set-Content -Path ".\teacher.html" -Encoding UTF8

# FILE 2
@'
PUT_FULL_FILE_CONTENT_HERE
'@ | Set-Content -Path ".\teacher.js" -Encoding UTF8

# FILE 3
@'
PUT_FULL_FILE_CONTENT_HERE
'@ | Set-Content -Path ".\styles.css" -Encoding UTF8

git add .
git commit -m "Describe the change here"
git push origin main

Write-Host "Change applied and pushed." -ForegroundColor Green