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

1. Push these changes to your GitHub repository.
2. Sign in at https://dashboard.render.com/ and choose **New → Blueprint**.
3. Connect this repository and use its `render.yaml` configuration.
4. Set `APP_OPENAI_API_KEY`, `URLSCAN_KEY`, and a private `APP_PASSWORD`
   in Render's secure environment settings. Do not commit their values.
5. Deploy, then open the HTTPS address Render provides. Sign in with any
   username and your `APP_PASSWORD`. Share the address/password privately.
6. On your phone, paste `https://example.com/` and check that a verdict appears.
   Then allow camera access to scan a QR code; allow location only when testing
   the map/location feature.

The blueprint selects Render's free plan, with no paid disk. Free services sleep
when idle, so the first request may take time. Runtime scan cache and shared pins
are stored under `/tmp/qr-check-data` and are lost on restarts/redeploys; they start
empty, without publishing the repository's existing pins or photos. For durable
storage, configure a database or a persistent disk on a suitable paid plan.
OpenAI and urlscan usage still follows those providers' billing/quotas.

The production server requires all three settings when `NODE_ENV=production`.
`GET /healthz` is a public health check; other routes require the demo password.
Run one server instance when using the JSON stores. This is a private demo setup;
a public multi-user launch needs user authentication, quotas and durable storage.
Vite's `npm run preview` does not run the backend.
