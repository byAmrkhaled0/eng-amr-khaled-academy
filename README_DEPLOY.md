# Techno Minds — production release

Frontend Production uses **GitHub → Vercel** (`eng-amr-khaled-academy.vercel.app`). Firebase Hosting is not a deployment target. Never use the legacy hosting-only launcher; it exits without deploying.

From a clean tested checkout:

```powershell
npm test
npm run build
npm run verify:dist
```

When backend code changes, deploy **only the named Functions reviewed for that release**:

```powershell
.\deploy-production.ps1 -Functions getPlatformHealthHttp,getPortalStudent -SkipSiteCheck
```

Use `-DeployRules` / `-DeployIndexes` only when these resources actually changed. `-Functions` is optional, so a frontend-only release cannot accidentally deploy all Functions. The script never selects Firebase Hosting, never uses `--force`, and does not delete remote Functions. Consult the tested change list before choosing names. Verify the Firebase project shown by the CLI.

Publish the frontend by pushing an approved commit to the GitHub branch connected to Vercel. After both parts are published, run `CHECK-SITE.cmd` (or `check-deployment.ps1`). That script performs real GETs for public pages, manifests, Service Worker, and health. Health verifies connectivity, **not** booking, payment, attendance, report or portal journeys. Run separate authorized runtime tests when these flows change.
