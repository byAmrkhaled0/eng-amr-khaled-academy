# Local checks only. No deployment or production access.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& npm test
if ($LASTEXITCODE -ne 0) { throw 'Regression failed.' }
& npm run test:review:gate
if ($LASTEXITCODE -ne 0) { throw 'Review gate failed.' }
Write-Host 'Source checks, build and dist verification passed. Run emulator suites and browser review separately; see README.md.'
