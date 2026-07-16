param(
  [string]$BaseUrl = "https://eng-amr-khaled-academy.web.app",
  [switch]$FullCodeRunner
)

$ErrorActionPreference = "Stop"

function Invoke-Callable([string]$Path, [hashtable]$Data, [int]$TimeoutSec = 45) {
  $body = @{ data = $Data } | ConvertTo-Json -Depth 8 -Compress
  $response = Invoke-RestMethod -Method Post -Uri ($BaseUrl.TrimEnd('/') + $Path) -ContentType "application/json" -Body $body -TimeoutSec $TimeoutSec
  if ($null -ne $response.result) { return $response.result }
  if ($null -ne $response.data) { return $response.data }
  throw "Invalid callable response from $Path"
}

try {
  $pages = @("/", "/teacher-login.html", "/student.html", "/parent.html", "/practical.html", "/service-worker.js")
  foreach ($page in $pages) {
    $response = Invoke-WebRequest -UseBasicParsing -Uri ($BaseUrl.TrimEnd('/') + $page) -TimeoutSec 30
    if ($response.StatusCode -ne 200) { throw "$page returned HTTP $($response.StatusCode)" }
    Write-Host "OK $page" -ForegroundColor Green
  }

  $health = Invoke-Callable "/api/health" @{}
  if ($health.status -ne "ok" -or -not $health.firestore) { throw "Health endpoint did not confirm Firestore." }
  if (-not $health.services.booking -or -not $health.services.studentPortal -or -not $health.services.administration -or -not $health.services.studentResources) {
    throw "One or more backend capability flags are false."
  }
  Write-Host "OK Firebase health, booking, portal, administration, and resources" -ForegroundColor Green

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

  Write-Host "Deployment check completed successfully." -ForegroundColor Green
} catch {
  Write-Host "Deployment check failed: $($_.Exception.Message)" -ForegroundColor Red
  throw
}
