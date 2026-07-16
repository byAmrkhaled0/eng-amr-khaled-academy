param(
  [string]$RepositoryUrl = "https://github.com/byAmrkhaled0/eng-amr-khaled-academy.git",
  [string]$TargetFolder = "Techno-Minds-v60.2.1-GitHub"
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [string[]]$ArgumentList = @()
  )

  & $Executable @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Executable $($ArgumentList -join ' ')"
  }
}

$SourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Parent = Split-Path -Parent $SourceRoot
$TargetRoot = Join-Path $Parent $TargetFolder

if (Test-Path $TargetRoot) {
  throw "Target folder already exists: $TargetRoot"
}

Write-Host "Cloning the existing GitHub repository..." -ForegroundColor Cyan
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git is missing. Install Git for Windows first." }
$GitExecutable = (Get-Command git).Source
Invoke-Checked -Executable $GitExecutable -ArgumentList @("clone", $RepositoryUrl, $TargetRoot)

Write-Host "Replacing repository files with Techno Minds V60.2.1 while preserving .git..." -ForegroundColor Cyan
Get-ChildItem -LiteralPath $TargetRoot -Force |
  Where-Object { $_.Name -ne ".git" } |
  Remove-Item -Recurse -Force

Get-ChildItem -LiteralPath $SourceRoot -Force |
  Where-Object { $_.Name -notin @(".git", "node_modules", "dist") } |
  Copy-Item -Destination $TargetRoot -Recurse -Force

Write-Host "Prepared Git folder:" -ForegroundColor Green
Write-Host $TargetRoot -ForegroundColor Green
Write-Host "Open that folder and run: npm run deploy:production" -ForegroundColor Yellow
