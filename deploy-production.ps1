param(
  [switch]$Resume,
  [switch]$SkipFunctions,
  [switch]$SkipSiteCheck
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$StateFile = Join-Path $ProjectRoot ".deploy-state.txt"
$SuccessFile = Join-Path $ProjectRoot ".deploy-success"
$script:CurrentAction = "preflight"
Set-Location $ProjectRoot
Remove-Item -LiteralPath $SuccessFile -Force -ErrorAction SilentlyContinue

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [string[]]$ArgumentList = @(),
    [Parameter(Mandatory = $true)][string]$FailureLabel
  )
  $script:CurrentAction = $FailureLabel
  & $Executable @ArgumentList
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$FailureLabel failed with exit code $exitCode. Review the command output directly above for the real Firebase/npm reason."
  }
}

function Test-StepComplete([string]$Name) {
  if (-not $Resume -or -not (Test-Path -LiteralPath $StateFile)) { return $false }
  return [bool](Get-Content -LiteralPath $StateFile -ErrorAction SilentlyContinue | Where-Object { $_ -eq $Name })
}

function Complete-Step([string]$Name) {
  if (-not (Test-StepComplete $Name)) { Add-Content -LiteralPath $StateFile -Value $Name -Encoding UTF8 }
}

function Invoke-Step {
  param([string]$Name, [string]$Title, [scriptblock]$Action)
  if (Test-StepComplete $Name) {
    Write-Host "SKIP (already completed): $Title" -ForegroundColor DarkGray
    return
  }
  Write-Host $Title -ForegroundColor Cyan
  $script:CurrentAction = $Title
  & $Action
  Complete-Step $Name
}

try {
  if (-not $Resume) { Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue }
  $env:FUNCTIONS_DISCOVERY_TIMEOUT = "120"

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is not installed. Install Node.js 22 LTS first." }
  $nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
  if ($nodeMajor -ne 22) { throw "This release requires Node.js 22. Current version: $(node --version)" }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm is missing. Reinstall Node.js 22 LTS." }
  if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) { throw "Firebase CLI is missing. Run: npm install -g firebase-tools" }
  $NpmExecutable = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { (Get-Command npm.cmd).Source } else { (Get-Command npm).Source }
  $FirebaseExecutable = if (Get-Command firebase.cmd -ErrorAction SilentlyContinue) { (Get-Command firebase.cmd).Source } else { (Get-Command firebase).Source }

  Invoke-Step "project" "1/9 Selecting Firebase project..." {
    Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("use", "eng-amr-khaled-academy") -FailureLabel "Firebase project selection"
  }
  Invoke-Step "verify" "2/9 Running source verification and unit tests..." {
    Invoke-Checked -Executable $NpmExecutable -ArgumentList @("test") -FailureLabel "npm test"
  }
  Invoke-Step "build" "3/9 Building and verifying dist..." {
    Invoke-Checked -Executable $NpmExecutable -ArgumentList @("run", "build") -FailureLabel "npm run build"
    Invoke-Checked -Executable $NpmExecutable -ArgumentList @("run", "verify:dist") -FailureLabel "dist verification"
  }
  Invoke-Step "functions-prepare" "4/9 Preparing Firebase Functions for Node.js 22..." {
    $FunctionsEnv = Join-Path $ProjectRoot "functions\.env"
    $FunctionsEnvExample = Join-Path $ProjectRoot "functions\.env.example"
    if (-not (Test-Path -LiteralPath $FunctionsEnv)) {
      Copy-Item -LiteralPath $FunctionsEnvExample -Destination $FunctionsEnv
      Write-Host "Created functions/.env from the safe template. Configure Judge0 before production code execution." -ForegroundColor Yellow
    }
    Invoke-Checked -Executable $NpmExecutable -ArgumentList @("--prefix", "functions", "ci", "--no-audit", "--no-fund") -FailureLabel "Functions dependency installation"
    Invoke-Checked -Executable $NpmExecutable -ArgumentList @("--prefix", "functions", "run", "lint") -FailureLabel "Functions syntax check"
  }

  if ($SkipFunctions) {
    Write-Host "5/9 Functions deployment skipped by -SkipFunctions." -ForegroundColor Yellow
  } else {
    Write-Host "5/9 Deploying Functions one by one (existing remote Functions are never auto-deleted)..." -ForegroundColor Cyan
    Write-Host "Function discovery timeout: $env:FUNCTIONS_DISCOVERY_TIMEOUT seconds" -ForegroundColor DarkGray
    $FunctionsSource = Get-Content -LiteralPath (Join-Path $ProjectRoot "functions\index.js") -Raw
    $FunctionNames = [regex]::Matches($FunctionsSource, 'exports\.([A-Za-z0-9_]+)\s*=') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
    if (-not $FunctionNames) { throw "No exported Firebase Functions were discovered in functions/index.js." }
    foreach ($FunctionName in $FunctionNames) {
      $FunctionStep = "function:$FunctionName"
      if (Test-StepComplete $FunctionStep) {
        Write-Host "  SKIP function already deployed: $FunctionName" -ForegroundColor DarkGray
        continue
      }
      Write-Host "  Deploying function: $FunctionName" -ForegroundColor Cyan
      Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("deploy", "--only", "functions:$FunctionName") -FailureLabel "Firebase Function '$FunctionName'"
      Complete-Step $FunctionStep
    }
    Complete-Step "functions"
  }

  Invoke-Step "rules-storage" "6/9 Deploying Firestore and Storage rules..." {
    Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("deploy", "--only", "firestore:rules,storage") -FailureLabel "Firestore/Storage rules deployment"
  }
  Invoke-Step "indexes" "7/9 Deploying required Firestore indexes..." {
    Write-Host "If Firebase lists old indexes, answer No to deletion. This script never passes --force." -ForegroundColor Yellow
    Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("deploy", "--only", "firestore:indexes") -FailureLabel "Firestore indexes deployment"
  }
  Invoke-Step "hosting" "8/9 Deploying Firebase Hosting..." {
    Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("deploy", "--only", "hosting") -FailureLabel "Firebase Hosting deployment"
  }
  if ($SkipSiteCheck) {
    Write-Host "9/9 Post-deployment site check skipped by -SkipSiteCheck." -ForegroundColor Yellow
  } else {
    Invoke-Step "site-check" "9/9 Checking the deployed website and backend..." {
      & (Join-Path $ProjectRoot "check-deployment.ps1")
      if ($LASTEXITCODE -ne 0) { throw "Post-deployment check failed." }
    }
  }

  Set-Content -LiteralPath $SuccessFile -Value "V60.6.2" -Encoding ASCII
  Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
  Write-Host "Deployment V60.6.2 completed successfully. No GitHub push was performed." -ForegroundColor Green
  exit 0
} catch {
  Write-Host "" 
  Write-Host "Deployment stopped at: $script:CurrentAction" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "After fixing the cause, resume from the failed step with:" -ForegroundColor Yellow
  Write-Host ".\deploy-production.ps1 -Resume" -ForegroundColor Yellow
  Remove-Item -LiteralPath $SuccessFile -Force -ErrorAction SilentlyContinue
  exit 1
}
