$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 22 is required." }
  if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) { throw "Firebase CLI is required." }
  $nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
  if ($nodeMajor -ne 22) { throw "Node.js 22 is required. Current: $(node --version)" }
  $NpmExecutable = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { (Get-Command npm.cmd).Source } else { (Get-Command npm).Source }
  $FirebaseExecutable = if (Get-Command firebase.cmd -ErrorAction SilentlyContinue) { (Get-Command firebase.cmd).Source } else { (Get-Command firebase).Source }
  & $NpmExecutable test
  if ($LASTEXITCODE -ne 0) { throw "npm test failed." }
  & $NpmExecutable run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }
  & $NpmExecutable run verify:dist
  if ($LASTEXITCODE -ne 0) { throw "dist verification failed." }
  & $FirebaseExecutable use eng-amr-khaled-academy
  if ($LASTEXITCODE -ne 0) { throw "Firebase project selection failed." }
  & $FirebaseExecutable deploy --only hosting
  if ($LASTEXITCODE -ne 0) { throw "Hosting deployment failed." }
  Write-Host "Hosting-only deployment completed. Functions, rules, indexes, and GitHub were not changed." -ForegroundColor Green
  exit 0
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
