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

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

# Firebase CLI gives function discovery only 10 seconds by default. This
# project exports many secure callables, and loading the Firebase SDKs can take
# longer on Windows (especially while antivirus scans node_modules). Firebase
# officially supports increasing this value for deployment discovery.
if (-not $env:FUNCTIONS_DISCOVERY_TIMEOUT) {
  $env:FUNCTIONS_DISCOVERY_TIMEOUT = "120"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is not installed. Install Node.js 22 LTS first." }
$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -ne 22) { throw "This release requires Node.js 22. Current version: $(node --version)" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm is missing. Reinstall Node.js 22 LTS." }
if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) { throw "Firebase CLI is missing. Run: npm install -g firebase-tools" }
$NpmExecutable = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { (Get-Command npm.cmd).Source } else { (Get-Command npm).Source }
$FirebaseExecutable = if (Get-Command firebase.cmd -ErrorAction SilentlyContinue) { (Get-Command firebase.cmd).Source } else { (Get-Command firebase).Source }

Write-Host "1/10 Selecting Firebase project..." -ForegroundColor Cyan
Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("use", "eng-amr-khaled-academy")

Write-Host "2/10 Verifying project..." -ForegroundColor Cyan
Invoke-Checked -Executable $NpmExecutable -ArgumentList @("test")

Write-Host "3/10 Building static site..." -ForegroundColor Cyan
Invoke-Checked -Executable $NpmExecutable -ArgumentList @("run", "build")

Write-Host "4/10 Preparing Firebase Functions environment..." -ForegroundColor Cyan
$FunctionsEnv = Join-Path $ProjectRoot "functions\.env"
$FunctionsEnvExample = Join-Path $ProjectRoot "functions\.env.example"
if (-not (Test-Path $FunctionsEnv)) {
  Copy-Item $FunctionsEnvExample $FunctionsEnv
  Write-Host "Created functions/.env from the safe project template." -ForegroundColor Yellow
}
Invoke-Checked -Executable $NpmExecutable -ArgumentList @("config", "set", "registry", "https://registry.npmjs.org/")
Invoke-Checked -Executable $NpmExecutable -ArgumentList @("--prefix", "functions", "ci", "--no-audit", "--no-fund")
Invoke-Checked -Executable $NpmExecutable -ArgumentList @("--prefix", "functions", "ls", "firebase-functions", "firebase-admin")
Invoke-Checked -Executable $NpmExecutable -ArgumentList @("--prefix", "functions", "run", "lint")

Write-Host "5/10 Deploying Firebase Functions..." -ForegroundColor Cyan
Write-Host "Function discovery timeout: $env:FUNCTIONS_DISCOVERY_TIMEOUT seconds" -ForegroundColor DarkGray
Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("deploy", "--only", "functions")

Write-Host "6/10 Deploying Firebase rules and indexes..." -ForegroundColor Cyan
Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("deploy", "--only", "firestore:rules,firestore:indexes,storage")

Write-Host "7/10 Deploying Firebase Hosting and same-origin API routes..." -ForegroundColor Cyan
Invoke-Checked -Executable $FirebaseExecutable -ArgumentList @("deploy", "--only", "hosting")

Write-Host "8/10 Testing deployed Firebase, booking, portal, and code services..." -ForegroundColor Cyan
$HealthUrl = "https://eng-amr-khaled-academy.web.app/api/health"
$HealthResponse = Invoke-RestMethod -Method Post -Uri $HealthUrl -ContentType "application/json" -Body '{"data":{}}' -TimeoutSec 45
if ($HealthResponse.result.status -ne "ok" -or -not $HealthResponse.result.firestore) {
  throw "Firebase health check failed. Functions or Firestore is not connected."
}
if (-not $HealthResponse.result.services.booking -or -not $HealthResponse.result.services.studentPortal -or -not $HealthResponse.result.services.administration) {
  throw "Booking, student portal, or administration capability check failed."
}
$CodeRunnerUrl = "https://eng-amr-khaled-academy.web.app/api/code/getCodeLanguages"
$CodeRunnerResponse = Invoke-RestMethod -Method Post -Uri $CodeRunnerUrl -ContentType "application/json" -Body '{"data":{}}' -TimeoutSec 45
if (-not $CodeRunnerResponse.result.languages) { throw "getCodeLanguages deployed but returned an invalid response." }
$CodeExecutionUrl = "https://eng-amr-khaled-academy.web.app/api/code/submitCodeExecution"
$CodeExecutionBody = @{
  data = @{
    language = "javascript"
    sourceCode = 'console.log("TECHNO_MINDS_OK");'
    stdin = ""
    visitorId = "production-deploy-smoke-test"
  }
} | ConvertTo-Json -Compress
$CodeExecutionResponse = Invoke-RestMethod -Method Post -Uri $CodeExecutionUrl -ContentType "application/json" -Body $CodeExecutionBody -TimeoutSec 60
if ($CodeExecutionResponse.result.stdout -notmatch "TECHNO_MINDS_OK") {
  throw "The code runner function is deployed, but Judge0 did not execute the smoke-test program. Check functions/.env."
}
Write-Host "Firebase, booking, portal, administration, and real code execution are online." -ForegroundColor Green

Write-Host "9/10 Checking Git repository..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $ProjectRoot ".git"))) {
  Write-Host "Firebase deployment completed, but this extracted folder is not connected to GitHub." -ForegroundColor Yellow
  Write-Host "Run .\prepare-github-folder.ps1, then run npm run deploy:production from the new folder." -ForegroundColor Yellow
  exit 0
}

Write-Host "10/10 Pushing production source to GitHub..." -ForegroundColor Cyan
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git is missing. Install Git for Windows first." }
$GitExecutable = (Get-Command git).Source
Invoke-Checked -Executable $GitExecutable -ArgumentList @("add", "-A")
$changes = git status --porcelain
if ($changes) {
  Invoke-Checked -Executable $GitExecutable -ArgumentList @("commit", "-m", "Techno Minds platform V60.3.1")
  Invoke-Checked -Executable $GitExecutable -ArgumentList @("push", "origin", "main")
} else {
  Write-Host "No Git changes to push." -ForegroundColor Yellow
}

Write-Host "Done. Wait for the Vercel Production deployment to become Ready." -ForegroundColor Green
