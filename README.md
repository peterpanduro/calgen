# CalGen

A stateless web service that generates printable Swedish wall-calendar PDFs: A4 or A3 landscape
(297 × 210 mm / 420 × 297 mm), one month per page, day boxes big enough to write in.

Pick a year and month, optionally a custom title, a background photo — which you can zoom and
move to choose the crop — the day-box coverage, a colour scheme and a font pairing. Choose A4 or
A3; A3 is the same layout scaled proportionally, and its file is named `…-a3.pdf`. Optionally
add a task list — blank ruled rows with checkboxes, left or right of the grid, under a heading
of your choice (`Att göra` by default). The preview updates as you type. Export the chosen month, or all twelve months of the year as a single
12-page PDF.

Swedish throughout: Monday-first weeks, ISO-8601 week numbers, Swedish public holidays and
Swedish UI copy.

## Quick start

```sh
pnpm install
pnpm hooks:install     # gitleaks + lint on commit
pnpm dev               # http://localhost:5173
```

Fonts are already committed under `static/fonts/`; no network access is needed to run or build.

## Exporting a PDF from the API

```sh
curl -F 'options={"year":2026,"month":8,"schemeId":"organic","fontId":"organic",
                  "opacity":88,"showHolidays":true,"title":"","scope":"month"}' \
     -F image=@photo.jpg \
     http://localhost:5173/api/pdf -o calgen-2026-09.pdf
```

`multipart/form-data` with a required `options` JSON part and an optional `image` part
(`image/jpeg`, `image/png` or `image/webp`, 20 MiB max, magic-byte checked). `scope` is
`"month"` or `"year"`. The optional `taskList` (`"off"`, `"left"`, `"right"`; default `"off"`)
and `taskListTitle` (≤ 20 characters; default `""`, printed as `Att göra`) add the task list.
Errors come back as JSON `{ "error": "code", "message": "…" }` with the
matching HTTP status. `GET /healthz` is a liveness probe and never starts a browser.

## Running in production

```sh
pnpm build
ORIGIN=https://calgen.example.se BODY_SIZE_LIMIT=24M node build/index.js
```

`ORIGIN` is required: without it SvelteKit's CSRF origin check rejects every export with a bare 403. `BODY_SIZE_LIMIT` must be set well above `MAX_UPLOAD_BYTES`; adapter-node's `512K` default
rejects every real upload. The service refuses to start on either mistake.

In a container:

```sh
podman build -t calgen .          # docker works identically
podman run --rm --shm-size=256m -p 3000:3000 -e ORIGIN=http://localhost:3000 calgen
```

Size the container above 1.5 GB of memory, and leave the Chromium sandbox on — the uploaded
photo is attacker-controlled input decoded by Chromium's image parsers. See `CLAUDE.md` for the
full environment-variable table and the sandbox trade-off.

## Releasing

`.github/workflows/ci.yml` runs on GitHub-hosted runners on pushes to `main` and on every pull
request: the lint/check/test suite and, in a second job, builds the image and smoke-tests it —
health, one month export, `%PDF`, exactly one page, a clean exit on `SIGTERM`.
`.github/workflows/release.yml` does the same on a `v*` tag and then publishes
`ghcr.io/peterpanduro/calgen:<version>` and `:latest`. The tag must equal `package.json`'s
`version`; `GET /healthz` reports that number, so a release where they disagree is refused.

```sh
git tag v1.0.0 && git push --tags
```

Deploying the published image is up to you; see `CLAUDE.md`'s environment-variable table and
container notes for what a deployment needs to set.

## How it works

The calendar is one Svelte component, `src/lib/components/CalendarPage.svelte`, used unchanged
in two places: the browser preview renders it live, and the PDF service renders it server-side
with `render()` from `svelte/server`, wraps the resulting bodies in a standalone print document
with the required `@font-face` faces embedded as `data:` URIs, and prints it with a headless
Chromium through `puppeteer-core`. A whole-year export is one HTML document with twelve page
sections, one `setContent` and one `page.pdf()` — not twelve PDFs merged.

Everything the page needs to decide — week numbers, holidays, the grid, every resolved colour —
is computed by pure functions in `src/lib/calendar/`, with no framework, no I/O and no `Date`
object anywhere, so the whole calendar domain is proven by fast unit tests.

The service stores nothing: no accounts, no database, no uploaded images. The background photo
lives in the browser as an object URL and travels with each export request.

## Testing

```sh
pnpm test                # unit + SSR, no browser needed
pnpm test:integration    # real Chromium; auto-skips when none is found
pnpm lint && pnpm check
```

```sh
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
	pnpm test:integration
```

## Documentation

- `docs/SPEC.md` — the normative specification.
- `docs/DEVIATIONS.md` — every place the implementation differs from it, and why.
- `CLAUDE.md` — file map, commands, environment variables, layering rules, container notes.

## Security

See `SECURITY.md` for how to report a vulnerability.

## Licence

MIT — see `LICENSE`. The eight self-hosted font families are SIL Open Font License 1.1; see
`static/fonts/OFL.txt` for the licence note and the sources. No other imagery is bundled —
background photos are supplied by the user and never stored.
