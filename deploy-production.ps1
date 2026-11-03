param(
  [switch]$Resume,
  [switch]$Plan,
  [switch]$ConfirmProduction,
  [string[]]$Functions = @(),
  [switch]$DeployRules,
  [switch]$DeployIndexes,
  [switch]$SkipSiteCheck
)

$Functions = @(
  $Functions |
    ForEach-Object { $_ -split ',' } |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ } |
    Sort-Object -Unique
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ReleaseVersion = (Get-Content -LiteralPath (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json).version
$StateFile = Join-Path $ProjectRoot ".deploy-state.txt"
$SuccessFile = Join-Path $ProjectRoot ".deploy-success"
$script:CurrentAction = "preflight"
Set-Location $ProjectRoot

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
  if ($Functions.Count -eq 0 -and -not $DeployRules -and -not $DeployIndexes) {
    throw "Select -Functions, -DeployRules, or -DeployIndexes explicitly. The frontend deploys through GitHub -> Vercel."
  }
  # The same offline policy runs in Linux CI and this Windows adapter.
  $PolicyArguments = @((Join-Path $ProjectRoot 'scripts/release-policy.js'))
  if ($Functions.Count -gt 0) { $PolicyArguments += @('--functions', ($Functions -join ',')) }
  if ($DeployRules) { $PolicyArguments += '--rules' }
  if ($DeployIndexes) { $PolicyArguments += '--indexes' }
  if ($Plan) { $PolicyArguments += '--plan' }
  if ($ConfirmProduction) { $PolicyArguments += '--confirm-production' }
  $PolicyOutput = & node @PolicyArguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($PolicyOutput -join "`n") }
  $ValidatedPlan = ($PolicyOutput -join "`n") | ConvertFrom-Json
  $SelectedResources = @($ValidatedPlan.resources)
  # Selection has already been checked against the real source by the policy.
  $AvailableFunctions = @($Functions)
  if ($Plan) { $ValidatedPlan | ConvertTo-Json -Depth 4; exit 0 }
  # Resume is valid only for the same source and exact selection.
  $ReleaseInputs = @('package.json','package-lock.json','functions\package.json','functions\package-lock.json','firestore.rules','storage.rules','firestore.indexes.json','firebase.json')
  $ReleaseInputs += @(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'functions') -File -Filter '*.js' | ForEach-Object { $_.FullName })
  if (Test-Path -LiteralPath (Join-Path $ProjectRoot 'functions\lib')) { $ReleaseInputs += @(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'functions\lib') -Recurse -File -Filter '*.js' | ForEach-Object { $_.FullName }) }
  $Fingerprint = ($SelectedResources -join ',') + '|' + (($ReleaseInputs | Sort-Object | ForEach-Object { $InputPath = if ([IO.Path]::IsPathRooted($_)) { $_ } else { Join-Path $ProjectRoot $_ }; [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([IO.File]::ReadAllBytes($InputPath))).Replace("-", "") }) -join '|')
  $FingerprintFile = Join-Path $ProjectRoot '.deploy-fingerprint.txt'
  if ($Resume -and (Test-Path -LiteralPath $StateFile)) {
    if (-not (Test-Path -LiteralPath $FingerprintFile) -or (Get-Content -LiteralPath $FingerprintFile -Raw).Trim() -ne $Fingerprint) { throw 'Resume refused: source or selected resources changed. Review and run without -Resume.' }
  }
  Set-Content -LiteralPath $FingerprintFile -Value $Fingerprint -Encoding ASCII
  Remove-Item -LiteralPath $SuccessFile -Force -ErrorAction SilentlyContinue
  if (-not $Resume) { Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue }
  $env:FUNCTIONS_DISCOVERY_TIMEOUT = "120"

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is not installed. Install Node.js 22 LTS first." }
  $nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
  if ($nodeMajor -ne 22) { throw "This release requires Node.js 22. Current version: $(node --version)" }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm is missing. Reinstall Node.js 22 LTS." }
  if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) { throw "Firebase CLI is missing. Run: npm install -g firebase-tools" }
  $NpmExecutable = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { (Get-Command npm.cmd).Source } else { (Get-Command npm).Source }
  $FirebaseExecutable = if (Get-Command firebase.cmd -ErrorAction SilentlyContinue) { (Get-Command firebase.cmd).Source } else { (Get-Command firebase).Source }

  Invoke-Step "project" "1/8 Selecting Firebase project..." {
    Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("use", "eng-amr-khaled-academy") -FailureLabel "Firebase project selection"
  }
  Invoke-Step "verify" "2/8 Running source verification and unit tests..." {
    Invoke-Checked -Executable $NpmExecutable -ArgumentList @("test") -FailureLabel "npm test"
  }
  Invoke-Step "build" "3/8 Building and verifying dist..." {
    Invoke-Checked -Executable $NpmExecutable -ArgumentList @("run", "build") -FailureLabel "npm run build"
    Invoke-Checked -Executable $NpmExecutable -ArgumentList @("run", "verify:dist") -FailureLabel "dist verification"
  }
  if ($Functions.Count -gt 0) {
    foreach ($FunctionName in $Functions) {
      if ($FunctionName -notin $AvailableFunctions) { throw "Unknown Function: $FunctionName" }
    }
  Invoke-Step "functions-prepare" "4/8 Preparing selected Firebase Functions for Node.js 22..." {
    $EnvironmentOutput = & node @PolicyArguments --prepare-env 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($EnvironmentOutput -join "`n") }
    $Environment = ($EnvironmentOutput -join "`n") | ConvertFrom-Json
    if ($Environment.environment -eq 'existing') { Write-Host 'Using existing functions/.env without modifying it.' -ForegroundColor DarkGray }
    elseif ($Environment.environment -eq 'template') { Write-Host 'Copied optional functions/.env.example. Verify provider configuration before deploying code runner Functions.' -ForegroundColor Yellow }
    else { Write-Host 'No optional environment template found. Existing platform configuration is preserved.' -ForegroundColor Yellow }
    Invoke-Checked -Executable $NpmExecutable -ArgumentList @("--prefix", "functions", "ci", "--no-audit", "--no-fund") -FailureLabel "Functions dependency installation"
    Invoke-Checked -Executable $NpmExecutable -ArgumentList @("--prefix", "functions", "run", "lint") -FailureLabel "Functions syntax check"
  }

  Write-Host "5/8 Deploying only explicitly selected Functions..." -ForegroundColor Cyan
    Write-Host "Function discovery timeout: $env:FUNCTIONS_DISCOVERY_TIMEOUT seconds" -ForegroundColor DarkGray
    foreach ($FunctionName in ($Functions | Sort-Object -Unique)) {
      if ($FunctionName -notin $AvailableFunctions) { throw "Unknown Function: $FunctionName" }
      $FunctionStep = "function:$FunctionName"
      if (Test-StepComplete $FunctionStep) {
        Write-Host "  SKIP function already deployed: $FunctionName" -ForegroundColor DarkGray
        continue
      }
      Write-Host "  Deploying function: $FunctionName" -ForegroundColor Cyan
      Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("deploy", "--project", "eng-amr-khaled-academy", "--non-interactive", "--only", "functions:$FunctionName") -FailureLabel "Firebase Function '$FunctionName'"
      Complete-Step $FunctionStep
    }
    Complete-Step "functions"
  } else { Write-Host "4/8 - 5/8 Functions skipped. Pass -Functions functionName1,functionName2 to select them explicitly." -ForegroundColor Yellow }

  if ($DeployRules) {
    Invoke-Step "rules-storage" "6/8 Deploying explicitly requested Firestore and Storage rules..." {
      Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("deploy", "--project", "eng-amr-khaled-academy", "--non-interactive", "--only", "firestore:rules,storage") -FailureLabel "Firestore/Storage rules deployment"
    }
  }
  if ($DeployIndexes) {
    Invoke-Step "indexes" "7/8 Deploying explicitly requested Firestore indexes..." {
      Write-Host "If Firebase lists old indexes, answer No to deletion. No automatic confirmation is used." -ForegroundColor Yellow
      Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("deploy", "--project", "eng-amr-khaled-academy", "--non-interactive", "--only", "firestore:indexes") -FailureLabel "Firestore indexes deployment"
    }
  }
  if ($SkipSiteCheck) {
    Write-Host "8/8 Post-deployment site check skipped by -SkipSiteCheck." -ForegroundColor Yellow
  } else {
    Invoke-Step "site-check" "8/8 Checking the deployed website and backend..." {
      & (Join-Path $ProjectRoot "check-deployment.ps1")
      if ($LASTEXITCODE -ne 0) { throw "Post-deployment check failed." }
    }
  }

  Set-Content -LiteralPath $SuccessFile -Value $ReleaseVersion -Encoding ASCII
  Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
  Write-Host "Selected Firebase backend deployment steps completed for V$ReleaseVersion. Frontend deploys separately through GitHub -> Vercel." -ForegroundColor Green
  exit 0
} catch {
  Write-Host "" 
  Write-Host "Deployment stopped at: $script:CurrentAction" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($Functions.Count -gt 0 -or $DeployRules -or $DeployIndexes) {
    $ResumeCommand = @('.\deploy-production.ps1', '-Resume', '-ConfirmProduction')
    if ($Functions.Count -gt 0) { $ResumeCommand += @('-Functions', ($Functions -join ',')) }
    if ($DeployRules) { $ResumeCommand += '-DeployRules' }
    if ($DeployIndexes) { $ResumeCommand += '-DeployIndexes' }
    if ($SkipSiteCheck) { $ResumeCommand += '-SkipSiteCheck' }
    Write-Host "After fixing the cause, resume with the same selected resources:" -ForegroundColor Yellow
    Write-Host ($ResumeCommand -join ' ') -ForegroundColor Yellow
  } else {
    Write-Host "Select -Functions, -DeployRules, or -DeployIndexes before retrying; -Resume alone cannot deploy anything." -ForegroundColor Yellow
  }
  exit 1
}
