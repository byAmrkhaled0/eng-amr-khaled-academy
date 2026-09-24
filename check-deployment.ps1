param(
  [string]$BaseUrl = "https://eng-amr-khaled-academy.vercel.app",
  [switch]$FullCodeRunner,
  [int]$SlowRouteWarningMs = 1000
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExpectedVersion = (Get-Content -LiteralPath (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json).version

function Invoke-Callable([string]$Path, [hashtable]$Data, [int]$TimeoutSec = 45) {
  $body = @{ data = $Data } | ConvertTo-Json -Depth 8 -Compress
  $response = Invoke-RestMethod -Method Post -Uri ($BaseUrl.TrimEnd('/') + $Path) -ContentType "application/json" -Body $body -TimeoutSec $TimeoutSec
  if ($null -ne $response.result) { return $response.result }
  if ($null -ne $response.data) { return $response.data }
  throw "Invalid callable response from $Path"
}

try {
  # Use GET deliberately: Vercel's optional toolbar may issue its own HEAD
  # request and receive 403 even while the actual student page returns 200.
  $pages = @(
    "/", "/index.html", "/student.html", "/parent.html", "/exams.html",
    "/materials.html", "/theory-lectures.html", "/questions.html",
    "/practical.html", "/learning-path.html", "/about.html", "/reviews.html",
    "/privacy.html", "/terms.html", "/teacher-login.html", "/offline.html", "/404.html",
    "/service-worker.js", "/site-manifest.json", "/teacher-manifest.json"
  )
  $slowPages = @()
  $routeResponses = @{}
  foreach ($page in $pages) {
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-WebRequest -UseBasicParsing -Method Get -Uri ($BaseUrl.TrimEnd('/') + $page) -TimeoutSec 30
    $timer.Stop()
    $routeResponses[$page] = $response
    if ($response.StatusCode -ne 200) { throw "$page returned HTTP $($response.StatusCode)" }
    $elapsedMs = [int]$timer.Elapsed.TotalMilliseconds
    if ($elapsedMs -gt $SlowRouteWarningMs) {
      $slowPages += "$page ($elapsedMs ms)"
      Write-Host "OK $page - $elapsedMs ms (slow)" -ForegroundColor Yellow
    } else {
      Write-Host "OK $page - $elapsedMs ms" -ForegroundColor Green
    }
  }

  if ($routeResponses["/teacher-login.html"].Content -notmatch 'href="teacher-manifest.json"' -or
      $routeResponses["/index.html"].Content -notmatch 'href="site-manifest.json"') {
    throw "Deployed HTML refers to an unexpected manifest path."
  }
  foreach ($manifestPath in @("/site-manifest.json", "/teacher-manifest.json")) {
    $manifest = $routeResponses[$manifestPath].Content | ConvertFrom-Json
    if (-not $manifest.name -or -not $manifest.icons) { throw "Manifest $manifestPath is invalid." }
  }
  if ($routeResponses["/teacher-login.html"].Headers["X-Content-Type-Options"] -ne "nosniff") {
    Write-Warning "Expected X-Content-Type-Options: nosniff on the teacher page."
  }
  $escapedVersion = [regex]::Escape($ExpectedVersion)
  $syncBundle = Invoke-WebRequest -UseBasicParsing -Method Get -Uri ($BaseUrl.TrimEnd('/') + "/assets/firebase-sync.js?v=$ExpectedVersion") -TimeoutSec 30
  if ($syncBundle.Content -notmatch "FRONTEND_VERSION='$escapedVersion'") {
    throw "The deployed firebase-sync.js is stale. Expected frontend version $ExpectedVersion. Wait for Vercel deployment and check again."
  }
  $workerBundle = Invoke-WebRequest -UseBasicParsing -Method Get -Uri ($BaseUrl.TrimEnd('/') + "/service-worker.js") -TimeoutSec 30
  if ($workerBundle.Content -notmatch "technominds-v$($ExpectedVersion.Replace('.', '-'))-") {
    throw "The deployed service worker cache is stale. Expected release $ExpectedVersion."
  }
  Write-Host "OK deployed frontend and service-worker version $ExpectedVersion" -ForegroundColor Green

  $health = Invoke-RestMethod -Method Get -Uri ($BaseUrl.TrimEnd('/') + "/api/health") -TimeoutSec 30
  if ($health.status -ne "ok" -or -not $health.firestore) { throw "Health endpoint did not confirm Firestore." }
  if ($health.version -ne $ExpectedVersion) {
    Write-Warning "Backend release $($health.version) differs from frontend $ExpectedVersion. Check selective Functions rollout and API schema; release number alone does not prove incompatibility."
  }
  if ($health.apiSchemaVersion -and $health.apiSchemaVersion -ne "portal-v64.0.0") {
    throw "Backend API schema $($health.apiSchemaVersion) is incompatible with the expected portal-v64.0.0 contract."
  }
  Write-Host "OK backend health and Firestore connectivity. Health does not verify payments, reports, attendance or portal journeys." -ForegroundColor Green

  $languages = Invoke-Callable "/api/code/getCodeLanguages" @{}
  if (-not $languages.languages) { throw "Code language endpoint returned no languages." }
  Write-Host "OK code language service" -ForegroundColor Green

  if ($FullCodeRunner) {
    $cases = @(
      @{ language="javascript"; sourceCode='console.log("TM_JS_OK");'; marker="TM_JS_OK" },
      @{ language="python"; sourceCode='print("TM_PY_OK")'; marker="TM_PY_OK" },
      @{ language="cpp"; sourceCode="#include <iostream>`nint main(){std::cout << `"TM_CPP_OK`";return 0;}"; marker="TM_CPP_OK" },
      @{ language="java"; sourceCode='class Main { public static void main(String[] args){ System.out.print("TM_JAVA_OK"); } }'; marker="TM_JAVA_OK" },
      @{ language="csharp"; sourceCode='using System; class Program { static void Main(){ Console.Write("TM_CS_OK"); } }'; marker="TM_CS_OK" }
    )
    foreach ($case in $cases) {
      $run = Invoke-Callable "/api/code/submitCodeExecution" @{ language=$case.language; sourceCode=$case.sourceCode; stdin=""; visitorId="v606-deployment-check" } 75
      $attempt = 0
      while ($run.runId -and -not $run.stdout -and $attempt -lt 20) {
        Start-Sleep -Seconds 2
        $run = Invoke-Callable "/api/code/getCodeExecutionResult" @{ runId=$run.runId } 45
        $attempt += 1
      }
      if ([string]$run.stdout -notmatch $case.marker) { throw "Judge0 did not execute $($case.language). Output/status: $($run.stdout) $($run.status)" }
      Write-Host "OK real Judge0 execution: $($case.language)" -ForegroundColor Green
    }
  }

  if ($slowPages.Count -gt 0) {
    Write-Host "Route speed warning (network/server time, not button visual feedback): $($slowPages -join ', ')" -ForegroundColor Yellow
  }

  Write-Host "Deployment check completed successfully." -ForegroundColor Green
} catch {
  Write-Host "Deployment check failed: $($_.Exception.Message)" -ForegroundColor Red
  throw
}
