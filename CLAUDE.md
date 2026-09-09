# CLAUDE.md — CalGen

CalGen is a stateless SvelteKit service that generates printable Swedish wall-calendar PDFs:
A4 landscape (297 × 210 mm), one month per page, large day boxes for handwriting. The user
picks year/month, an optional title, a background photo (zoomable and movable to pick the
crop), box coverage, a colour scheme and a font pairing, sees a live preview, and exports
either the chosen month or all twelve months.

`docs/SPEC.md` is normative. `docs/DEVIATIONS.md` lists every place the code differs from it.

## Commands

| Command                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`              | Dev server on <http://localhost:5173>                                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm build`            | Production build into `build/` (adapter-node)                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm preview`          | Serve the build on <http://localhost:4173>. The script supplies `ORIGIN` and `BODY_SIZE_LIMIT` itself — `vite preview` runs as `NODE_ENV=production`, so the startup fail-fast would otherwise refuse to start. **Change the port and you must override `ORIGIN` to match** (`ORIGIN=http://localhost:5050 pnpm preview --port 5050`), or `POST /api/pdf` fails SvelteKit's CSRF origin check with a bare 403 |
| `pnpm start`            | Run the built server (`node build/index.js`); needs `ORIGIN` and `BODY_SIZE_LIMIT` in the environment                                                                                                                                                                                                                                                                                                         |
| `pnpm test`             | Unit + SSR suite (alias for `test:unit`), no browser needed                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm test:unit`        | Same, explicitly                                                                                                                                                                                                                                                                                                                                                                                              |
| `pnpm test:watch`       | Unit suite in watch mode                                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm test:integration` | Real-Chromium PDF tests; auto-skips when no browser is found                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm check`            | `svelte-check`                                                                                                                                                                                                                                                                                                                                                                                                |
| `pnpm check:watch`      | `svelte-check` in watch mode                                                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm lint`             | `eslint` then `prettier --check`                                                                                                                                                                                                                                                                                                                                                                              |
| `pnpm format`           | `prettier --write`                                                                                                                                                                                                                                                                                                                                                                                            |
| `pnpm fetch-fonts`      | Re-download the self-hosted woff2 faces (`--force` to ignore the cache)                                                                                                                                                                                                                                                                                                                                       |
| `pnpm hooks:install`    | `git config core.hooksPath .githooks`                                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm prepare`          | `svelte-kit sync`; runs automatically after `pnpm install`                                                                                                                                                                                                                                                                                                                                                    |

Release:

| Command                             | What it does                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git tag v1.0.0 && git push --tags` | Publishes `ghcr.io/peterpanduro/calgen:1.0.0` + `:latest`. The tag MUST equal `package.json`'s `version` — `release.yml` fails the release otherwise, because `GET /healthz` reports that number |

Integration tests on macOS:

```sh
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
	pnpm test:integration
```

Container (`podman` works identically to `docker`):

```sh
podman build -t calgen .
podman run --rm --shm-size=256m -p 3000:3000 \
	-e ORIGIN=http://localhost:3000 calgen
```

## File map

```
LICENSE                         MIT
SECURITY.md                     supported versions, how to report a vulnerability
docs/SPEC.md                    normative specification
docs/DEVIATIONS.md              where the code differs from it, and why
.github/workflows/ci.yml        lint/check/test, then build + smoke-test the image
.github/workflows/release.yml   on a `v*` tag: verify, then publish to GHCR
scripts/fetch-fonts.mjs         Google Fonts → static/fonts (zero deps)
static/fonts/                   16 woff2 files, fonts.json, fonts.css, OFL.txt (committed)
src/lib/calendar/               LAYER 1 — pure logic, no framework, no I/O
	civil.ts                      timezone-free integer date arithmetic
	iso-week.ts easter.ts         ISO week numbers, Gregorian computus
	holidays.ts                   the sixteen Swedish holidays, memoised per year
	grid.ts                       Monday-first month grid, minimum five rows
	view.ts                       resolved render model (every colour decision)
	schemes.ts fonts.ts strings.ts css.ts options.ts types.ts
src/lib/components/             LAYER 2 — Svelte, props in / HTML out
	CalendarPage.svelte           THE calendar page; no style block, inline styles only
	PreviewStage.svelte           scaling wrapper (app only)
	TopBar.svelte Sidebar.svelte Toast.svelte
src/lib/client/                 browser-only
	app-state.svelte.ts           app state, image selection and measurement
	export.ts errors.ts           export request, Swedish error messages
	image-transform.ts            pure pan/zoom math for the preview
src/lib/server/                 LAYER 3 — Node only
	config.ts log.ts semaphore.ts fonts.ts image.ts version.ts
	pdf/types.ts                  BrowserLike / PageLike / PdfRenderer
	pdf/print-html.ts             standalone print document
	pdf/renderer.ts               lifecycle, concurrency, timeouts
	pdf/puppeteer-browser.ts      the ONLY file importing puppeteer-core
	pdf/instance.ts               process singleton
src/routes/                     LAYER 4 — pages and endpoints
	+page.svelte +layout.svelte +layout.server.ts
	healthz/+server.ts            liveness only; never touches Chromium
	api/pdf/+server.ts            POST multipart → application/pdf
src/hooks.server.ts             security headers, request log, graceful shutdown
tests/fixtures/tiny.jpg         1×1 JPEG for upload tests
tests/pdf-utils.ts              page counting and PDF sanity helpers
```

`src/lib/server/font-assets.test.ts` has no matching source module on purpose: it asserts the
committed `static/fonts/` output is complete and self-consistent, which is a property of the
generated assets rather than of any one module.

## Layering rules

A layer may only import from the layers above it, and `eslint` enforces it:

1. `src/lib/calendar/**` — pure logic. Imports nothing outside itself: no Svelte, no DOM, no
   Node APIs, no `Date` object arithmetic.
2. `src/lib/components/**` — Svelte components. Props in, HTML out.
3. `src/lib/server/**` — Node-only services.
4. `src/routes/**` — pages and endpoints.

Four rules that are easy to break and expensive to debug:

- **`CalendarPage.svelte` must never gain a `<style>` block.** Vite extracts component CSS into
  a separate asset that `render()` from `svelte/server` does not emit, so a style block
  silently produces an unstyled PDF. A test asserts the source file contains no style tag.
- **`CalendarPage.svelte` uses props and `$derived` only** — no `$state`, `$effect`, `onMount`
  or browser globals; none of them run under `render()`.
- **Only `src/lib/server/pdf/puppeteer-browser.ts` may import `puppeteer-core`.**
- **Do not create `svelte.config.js`.** All Kit configuration, the CSP included, lives flat
  inside `sveltekit({ … })` in `vite.config.ts`. A `svelte.config.js` would be silently dead
  and the app would ship with no CSP.

## Environment variables

| Variable               | Default                   | Meaning                                                                                                              |
| ---------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `PORT`                 | `3000`                    | adapter-node listen port                                                                                             |
| `HOST`                 | `0.0.0.0`                 | adapter-node bind address                                                                                            |
| `ORIGIN`               | _(unset)_                 | Public origin. **Required in production**: without it SvelteKit's CSRF check rejects `POST /api/pdf` with a bare 403 |
| `BODY_SIZE_LIMIT`      | _(adapter-node's `512K`)_ | Request cap. **Must be set** in production; the service refuses to start below `MAX_UPLOAD_BYTES + 1 MiB`            |
| `SHUTDOWN_TIMEOUT`     | `30`                      | adapter-node graceful-shutdown seconds                                                                               |
| `FONTS_DIR`            | `<cwd>/static/fonts`      | Where `fonts.json` and the woff2 files live                                                                          |
| `CHROMIUM_PATH`        | _(auto-detect)_           | Chromium/Chrome executable                                                                                           |
| `CHROMIUM_NO_SANDBOX`  | `false`                   | Adds `--no-sandbox --disable-setuid-sandbox`                                                                         |
| `PDF_CONCURRENCY`      | `2`                       | Simultaneous Chromium pages                                                                                          |
| `PDF_TIMEOUT_MS`       | `30000`                   | Per-render budget, month and year alike                                                                              |
| `PDF_QUEUE_TIMEOUT_MS` | `15000`                   | Max wait for a render slot before 503                                                                                |
| `MAX_UPLOAD_BYTES`     | `20971520`                | Background image cap (20 MiB)                                                                                        |
| `LOG_LEVEL`            | `info`                    | `debug\|info\|warn\|error`                                                                                           |

Invalid values fail fast at startup rather than falling back silently.

## Container notes

- Image is ~1.08 GB (`node:24-trixie-slim` plus the Debian `chromium` package); documented,
  not optimised.
- **Memory floor ≥ 1.5 GB per container.** A 20 MiB upload costs roughly 20 MB + 27 MB base64
  - 27 MB HTML + ~80 MB decoded inside Chromium, times `PDF_CONCURRENCY`.
    `NODE_OPTIONS=--max-old-space-size=768` makes Node throw a clean heap error instead of being
    OOM-killed by the cgroup.
- `--shm-size=256m` is recommended even though `--disable-dev-shm-usage` is passed.
- **The Chromium sandbox is not decorative:** the uploaded image is attacker-controlled input
  decoded by Chromium's image parsers. Keep `CHROMIUM_NO_SANDBOX=false`. If the platform blocks
  unprivileged user namespaces, prefer `--cap-add=SYS_ADMIN`; only if that is impossible set
  `CHROMIUM_NO_SANDBOX=true` and compensate with `--read-only`, `--cap-drop=ALL`,
  `--security-opt no-new-privileges` and a tmpfs `/tmp`.
- **Under Kubernetes the fallback is the only option, measured.** containerd's `RuntimeDefault`
  seccomp profile allows `unshare` and `clone(CLONE_NEWUSER)` only with `CAP_SYS_ADMIN` in the
  bounding set, and Debian's `chromium` package ships no setuid helper — so a pod with
  `seccompProfile: RuntimeDefault` and `capabilities.drop: [ALL]` gets `No usable sandbox!` and
  answers 503 to every export. The compensating controls, in Kubernetes `securityContext` form:
  `runAsNonRoot: true`, `readOnlyRootFilesystem: true` (with `HOME=/tmp` over a writable
  `emptyDir`, per the bullet below), `allowPrivilegeEscalation: false`,
  `capabilities: { drop: [ALL] }`, `seccompProfile: { type: RuntimeDefault }`, and
  `CHROMIUM_NO_SANDBOX=true` on the container.
- **`readOnlyRootFilesystem` needs `HOME` writable, not just `/tmp`.** Chromium resolves its
  crash-reporting database from `$HOME`; with it read-only `chrome_crashpad_handler` dies with
  `--database is required` and every render fails while `/healthz` stays green. Setting
  `HOME=/tmp` over one writable emptyDir covers both.
- `tini` is PID 1 so `SIGTERM` reaches Node and zombie Chromium processes get reaped.
  Signal handling belongs to `tini` and adapter-node only; puppeteer's own handlers are
  disabled at launch.

## Fonts

Eight OFL-licensed families, self-hosted so no render ever touches the network. `pnpm
fetch-fonts` regenerates `static/fonts/` (32 faces backed by 16 deduplicated woff2 files,
~338 KB); the output is committed so neither CI nor the Docker build needs Google Fonts.
Licence and sources: `static/fonts/OFL.txt`.
