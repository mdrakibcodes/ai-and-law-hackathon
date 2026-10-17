# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Hosted phone testing (free Render service)

This app includes a production Node server: `npm run build` followed by
`npm start`. It serves the built UI and securely proxies OpenAI and urlscan.
Use Node 24. Keys are never built into the frontend.

To deploy:

1. Use the pushed branch `codex/openai-render-demo` (or merge it into your deployment branch).
2. Sign in at https://dashboard.render.com/ and choose **New → Blueprint**.
3. Connect this repository, select `codex/openai-render-demo`, and use its `render.yaml` configuration.
4. Set `APP_OPENAI_API_KEY` and `URLSCAN_KEY`
   in Render's secure environment settings. Do not commit their values.
5. Deploy, then open the HTTPS address Render provides. The app opens directly
   without a username or password.
6. On your phone, paste `https://example.com/` and check that a verdict appears.
   Then allow camera access to scan a QR code; allow location only when testing
   the map/location feature.

The blueprint selects Render's free plan, with no paid disk. Free services sleep
when idle, so the first request may take time. Runtime scan cache and shared pins
are stored under `/tmp/qr-check-data` and are lost on restarts/redeploys; they start
empty, without publishing the repository's existing pins or photos. For durable
storage, configure a database or a persistent disk on a suitable paid plan.
OpenAI and urlscan usage still follows those providers' billing/quotas.

The production server requires both API keys when `NODE_ENV=production`.
`GET /healthz` is a public health check. The app and scan endpoints are public;
API keys stay server-side, and visitor requests use the configured API balance.
Any old `APP_PASSWORD` setting is ignored and can be removed from Render.
Run one server instance when using the JSON stores. A larger public launch needs
usage quotas and durable storage.
Vite's `npm run preview` does not run the backend.


## Scan and navigation flow

The browser sends only the URL to `POST /api/check`. The Node backend submits and
polls the urlscan scan, retries screenshots that are not ready yet, requests a
fixed OpenAI analysis, and stores its own verdict for up to one hour. The public
API does not accept client-written scan verdicts or arbitrary OpenAI requests.
Only a safe verdict with no malicious scanner finding opens the original HTTP(S)
URL automatically in the same tab. Suspicious/unsafe results, unavailable screenshots,
login walls and failed checks stay in QR Check without a proceed button.
The AI assessment is probabilistic, not a guarantee that a website is safe.

Use the Render URL https://qr-check-u0av.onrender.com for testing. The included
`vercel.json` redirects an old Vercel deployment to this backend-backed site;
Vercel must deploy the updated branch for that redirect to apply. A static-only
Vercel deployment cannot run this app's scan backend.

Run `npm test` for polling, safe navigation, malicious-result override, screenshot
failure, refusal and server-cache tests. Incoming URL payloads are limited to 8KB,
upstream responses to 12MB, concurrent scans to 3, and new scans to 10/minute per
server instance. Runtime verified results live in `verified-scans-v2.json` under
`DATA_DIR`; the legacy public cache is never trusted to authorize navigation.


### Websites, surveys and unavailable pages

Analysis supports unfamiliar/custom domains and shared form hosts. It inspects
sandbox screenshots plus rendered page text, field labels/types and form actions
when urlscan supplies the DOM. Readable page text can also be assessed if the
screenshot is unavailable. It never fills in or submits a survey. Ordinary
ratings, comments, names and optional contact details alone are not phishing;
banking passwords, OTPs or unrelated sensitive requests are concrete warning signs.

The analysis separates **safe**, **suspicious**, **dangerous**, and **unverified**.
Unverified means a scan was declined, login/CAPTCHA/access denial obscured the
requested content, or the page could not be inspected. It does not mean phishing
was found. Unverified pages do not get scam reporting or map-warning prompts and
are not automatically opened. Known form/social hosts are not blanket allowlisted.
The new calibration uses `verified-scans-v2.json`, ignoring cached verdicts from
the older policy. Each previously cached URL is checked again after deployment.
