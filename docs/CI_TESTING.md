# CI build and browser tests

Every pull request to main and push to main/feat/**/fix/** runs lint and TypeScript, builds the frontend, then runs Playwright against the downloaded dist artifact. Missing scripts, build errors, no tests or test failures fail the job; no success fallback is used.

The build explicitly enables VITE_USE_MOCK=true. The four scenarios run at 1280x800 and 1440x1000: unauthenticated redirect, manager account list and session persistence, trainer access denial, and locked-account denial. Each test uses an isolated browser context. This is a frontend regression suite, not proof of integration with a real backend or database.

Local PowerShell commands:

```powershell
npm ci
$env:VITE_USE_MOCK='true'
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

If Microsoft Edge is already installed, PLAYWRIGHT_CHANNEL=msedge can be set locally instead of installing Chromium. CI uses Chromium. Playwright starts a preview server at 127.0.0.1:4173 and shuts it down when testing completes; it will not reuse a pre-existing server.

HTML reports, screenshots and traces of failures are retained as artifacts. Sonar remains conditional on existing secrets and is separate from build/test gates. Enforce the build/browser jobs in GitHub branch protection if merge must be blocked; this configuration does not change repository settings or automatically merge/deploy.
