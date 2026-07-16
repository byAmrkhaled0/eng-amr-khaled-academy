param(
  [string]$RepositoryUrl = "https://github.com/byAmrkhaled0/eng-amr-khaled-academy.git",
  [string]$TargetFolder = "Techno-Minds-v60.6.2-GitHub"
)

$ErrorActionPreference = "Stop"
$SourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Parent = Split-Path -Parent $SourceRoot
$TargetRoot = Join-Path $Parent $TargetFolder

function Invoke-Checked {
  param([string]$Executable,[string[]]$ArgumentList,[string]$Label)
  & $Executable @ArgumentList
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE." }
}

function Copy-ProjectItem([string]$Source, [string]$Destination) {
  $item = Get-Item -LiteralPath $Source -Force
  if ($item.Name -in @(".git", "node_modules", "dist", ".deploy-state.txt", ".deploy-success")) { return }
  if ($item.Name -like ".env*" -and $item.Name -ne ".env.example") { return }
  if ($item.PSIsContainer) {
    if (-not (Test-Path -LiteralPath $Destination)) { New-Item -ItemType Directory -Path $Destination | Out-Null }
    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object { Copy-ProjectItem $_.FullName (Join-Path $Destination $_.Name) }
  } else {
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
  }
}

try {
  # This line also removes the downloaded-file mark from the other helper
  # scripts after this script was started through PREPARE-GITHUB.cmd/Bypass.
  Get-ChildItem -LiteralPath $SourceRoot -Filter "*.ps1" | Unblock-File -ErrorAction SilentlyContinue
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git is missing. Install Git for Windows first." }
  $GitExecutable = (Get-Command git).Source

  if (-not (Test-Path -LiteralPath $TargetRoot)) {
    Write-Host "Cloning the existing GitHub repository..." -ForegroundColor Cyan
    Invoke-Checked $GitExecutable @("clone", $RepositoryUrl, $TargetRoot) "Git clone"
  } elseif (-not (Test-Path -LiteralPath (Join-Path $TargetRoot ".git"))) {
    throw "Target folder exists but is not a Git repository: $TargetRoot"
  } else {
    Write-Host "Using the existing local Git clone without deleting its files." -ForegroundColor Yellow
  }

  Write-Host "Copying V60.6.2 source into the local clone..." -ForegroundColor Cyan
  Get-ChildItem -LiteralPath $SourceRoot -Force | ForEach-Object { Copy-ProjectItem $_.FullName (Join-Path $TargetRoot $_.Name) }

  Write-Host "Prepared local Git folder (nothing was pushed):" -ForegroundColor Green
  Write-Host $TargetRoot -ForegroundColor Green
  Write-Host "Review with: git status --short" -ForegroundColor Yellow
  Write-Host "Only after reviewing, commit and push manually using the README commands." -ForegroundColor Yellow
  exit 0
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
