# CalGen — Technical Specification

Version 1.0 · Status: approved for implementation · Target branch: `feat/calgen-service`

This document is normative. The implementer follows it literally; the reviewer checks the
implementation against it. Where it says MUST, deviating requires product-owner sign-off.

---

## 1. Purpose & scope

### 1.1 Purpose

CalGen is a stateless web service that generates printable landscape wall-calendar pages, A4
or A3 (one month per page, large day boxes for handwriting). The user picks year and month, an
optional custom title, a background photo, day-box opacity, a colour scheme and a font
pairing; sees a live preview; and exports a print-ready PDF — either the single chosen month
or all twelve months of the chosen year.

Locale is Swedish throughout: Monday-first weeks, ISO-8601 week numbers, Swedish public
holidays, Swedish UI strings.

### 1.2 In scope

- Live in-browser preview of the calendar page, updating immediately on every control change.
- Server-side PDF export at exactly 297 × 210 mm (A4) or 420 × 297 mm (A3) per page,
  backgrounds printed, fonts embedded.
- Single-month export and whole-year (12-page) export.
- Six colour schemes, four font pairings, opacity 30–100 %, optional Swedish holidays.
- Paper size A4 (default) or A3. A3 is the A4 layout scaled proportionally at print time —
  same composition, same relative type size, no re-layout.
- User-supplied background photo, held in the browser and uploaded per export request.
- Zoom (100–400 %) and pan of that photo, dragged directly in the preview, with the exported
  PDF reproducing the preview exactly (§4.9, §5.2, §6.9).
- `GET /healthz`, structured stdout logging, security headers, graceful shutdown.
- Self-hosted fonts (no runtime dependency on Google Fonts or any external network).

### 1.3 Out of scope (explicitly)

- Cropping the background image — a crop rectangle, a rotation, or any change to the printed
  aspect ratio. The image is always `background-size:cover`; at the default zoom of `1` it is
  centred, which is the exact behaviour the service had before pan/zoom existed. Pan and zoom
  themselves are **in scope** (§1.2).
- Any persistence: no accounts, no image storage, no database, no session state.
- Any locale other than Swedish; any paper size other than A4 or A3 landscape; any portrait
  orientation; any A3-specific layout — A3 is the A4 page scaled, and a differing composition
  is out of scope.
- Multi-month-per-page layouts, week/day views, event data, iCal import.
- Server-side image downscaling — see §5.5 for the reasoning and the tradeoff.
- Rate limiting beyond the render concurrency semaphore (deploy behind a reverse proxy).

### 1.4 Source material

The specification was derived from the initial design handoff, which is no longer in the
working tree. It is preserved in git history at commit `a5e29a4` ("Add design handoff and
prototype"):

| File (at `a5e29a4`)                | Role                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| `README.md`                        | Design handoff. Authoritative for tokens, geometry, copy.   |
| `CalGen.dc.html`                   | Prototype. Authoritative for logic and exact inline styles. |
| `Almanacka September 2026.dc.html` | Original single-page print reference.                       |
| `_ds/organic-*/styles.css`         | Organic design-system token sheet.                          |

Wherever this document says "the prototype", it means `CalGen.dc.html` at that commit
(`git show a5e29a4:CalGen.dc.html`). This specification supersedes it; the files are
provenance, not a contract.

---

## 2. Architecture

### 2.1 Layering

Four layers, strictly one-directional (a layer may only import from layers above it):

```
1. Pure logic        src/lib/calendar/**      no Svelte, no DOM, no Node APIs, no I/O
2. Presentation      src/lib/components/**    Svelte 5 components, props in / HTML out
3. Server services   src/lib/server/**        Node-only: PDF renderer, fonts, config, log
4. Delivery          src/routes/**            SvelteKit pages and endpoints
```

`CalendarPage.svelte` (layer 2) is the **single source of truth for calendar layout**. It is
imported by the app page for the preview and by the PDF service for print. There is no second
renderer and no duplicated geometry anywhere.

### 2.2 Directory layout (exact paths)

```
.
├── CLAUDE.md                                  file map + common commands
├── Dockerfile
├── .dockerignore
├── .gitignore
├── prettier.config.js  .prettierignore  .npmrc
├── eslint.config.js
├── vite.config.ts                             sveltekit() options + vitest `test.projects`
├── tsconfig.json                              (no svelte.config.js — see §2.5.6)
├── package.json
├── pnpm-lock.yaml
├── .githooks/
│   └── pre-commit                             gitleaks + lint-staged-equivalent
├── docs/
│   └── SPEC.md                                this file
├── scripts/
│   └── fetch-fonts.mjs                        Node, zero deps (§7.3)
├── static/
│   ├── favicon.svg
│   └── fonts/
│       ├── fonts.json                         manifest, generated (§7.3)
│       ├── fonts.css                          @font-face for the browser, generated
│       ├── OFL.txt                            licence note + source
│       └── *.woff2                            16 files / 32 faces, generated, committed
├── src/
│   ├── app.html
│   ├── app.css                                Organic tokens + font import
│   ├── app.d.ts
│   ├── hooks.server.ts                        security headers, request log, shutdown hook
│   ├── lib/
│   │   ├── calendar/                          ── LAYER 1: pure logic
│   │   │   ├── types.ts
│   │   │   ├── civil.ts                       integer y/m/d date arithmetic
│   │   │   ├── iso-week.ts
│   │   │   ├── easter.ts
│   │   │   ├── holidays.ts
│   │   │   ├── grid.ts
│   │   │   ├── schemes.ts
│   │   │   ├── fonts.ts
│   │   │   ├── strings.ts                     MONTHS, DAY_NAMES, defaultTitle()
│   │   │   ├── view.ts                        buildCalendarView()
│   │   │   ├── css.ts                         rgba()/alpha()/imageCss() helpers
│   │   │   ├── options.ts                     defaults + parseCalendarOptions()
│   │   │   ├── paper.ts                       paper sizes and the A3 scale factor
│   │   │   └── *.test.ts                      co-located unit tests
│   │   ├── components/                        ── LAYER 2
│   │   │   ├── CalendarPage.svelte            THE calendar page
│   │   │   ├── CalendarPage.ssr.test.ts
│   │   │   ├── PreviewStage.svelte            scaling wrapper (app only)
│   │   │   ├── Sidebar.svelte
│   │   │   ├── TopBar.svelte
│   │   │   └── Toast.svelte
│   │   ├── client/
│   │   │   ├── app-state.svelte.ts            the single $state object
│   │   │   ├── app-state.test.ts              NOT *.svelte.test.ts — see §12.1
│   │   │   ├── export.ts                      builds FormData, POSTs, triggers download
│   │   │   ├── errors.ts                      API error code → Swedish message
│   │   │   ├── image-transform.ts             pure pan/zoom math for the preview (§6.9)
│   │   │   └── *.test.ts
│   │   └── server/                            ── LAYER 3 (Node only)
│   │       ├── config.ts                      env parsing, typed, defaults
│   │       ├── log.ts                         structured JSON stdout logger
│   │       ├── semaphore.ts
│   │       ├── fonts.ts                       load + base64-cache woff2 for print
│   │       └── pdf/
│   │           ├── types.ts                   BrowserLike / PageLike / PdfRenderer
│   │           ├── print-html.ts              standalone document template (pure-ish)
│   │           ├── renderer.ts                PdfRenderer implementation
│   │           ├── puppeteer-browser.ts       real BrowserFactory (only file importing puppeteer-core)
│   │           ├── instance.ts                lazily-created process singleton
│   │           ├── renderer.test.ts           fake browser
│   │           ├── print-html.test.ts
│   │           └── renderer.integration.test.ts   real Chromium, auto-skipped
│   └── routes/
│       ├── +layout.svelte
│       ├── +layout.server.ts                  passes maxUploadBytes to the client (§6.3)
│       ├── +page.svelte                       the app
│       ├── healthz/+server.ts
│       └── api/pdf/+server.ts
└── tests/
    └── fixtures/tiny.jpg                      1×1 JPEG used by upload tests
```

### 2.3 Data flow — live preview

```
user input → app-state.svelte.ts ($state)
           → CalendarOptions
           → <PreviewStage>            owns the ResizeObserver and computes `scale` itself
               → <CalendarPage {options} imageCss={objectUrlCss} />
                   → buildCalendarView(options)  [pure]
```

`scale` is internal to `PreviewStage` (§6.4); it is not app state and not a prop.

Pan and zoom travel the same path, in the opposite direction and back again: the pointer
overlay inside `PreviewStage` converts a drag or a wheel tick into new `imageX`/`imageY`/
`imageZoom` values (§6.9), calls back into `+page.svelte`, which writes them onto the `$state`
object — from where they re-enter `CalendarOptions` and `buildCalendarView` like any other
control. No component holds a second copy of the transform.

No network. The image is an object URL created with `URL.createObjectURL(file)` and revoked
when replaced or cleared.

### 2.4 Data flow — PDF export

```
click "Exportera PDF" / "Exportera hela året"
  → export.ts builds multipart/form-data:
        options = JSON.stringify({...CalendarOptions, scope})
        image   = File (optional)
  → POST /api/pdf
  → +server.ts
        1. assert Content-Type is multipart/form-data          (415 otherwise)
        2. request.formData()
        3. parseCalendarOptions(JSON.parse(options))           (400 on failure)
        4. validate image: type in {jpeg,png,webp}, size ≤ MAX_UPLOAD_BYTES
        5. pages = scope === 'year' ? yearPages(o) : [stripScope(o)]
        6. getPdfRenderer().render({ pages, image })          (image: { bytes, type } | null)
             a. semaphore.acquire()            (queue wait ≤ PDF_QUEUE_TIMEOUT_MS → 503)
             b. browser = await lazyLaunch()
             c. page = await browser.newPage()
             d. imageCss = image ? 'var(--calgen-bg)' : 'none'   (renderer-internal)
                html = buildPrintHtml({ pages: bodies, fontCss, hasImage: image !== null, pageBg })
                   where bodies[i] = render(CalendarPage, { props: { options, imageCss } }).body
             e. page.setRequestInterception(true); page.on('request', …)   (§7.1, §7.4)
             f. page.setContent(html, { waitUntil: 'load' })
             g. page.pdf({ width, height, scale, printBackground:true, ... })    (§4.11)
             h. finally page.close(); semaphore.release()
        7. 200 application/pdf
             Content-Disposition: attachment; filename="calgen-2026-09.pdf"    (`calgen-2026-09-a3.pdf` for A3)
  → export.ts: response.blob() → object URL → <a download> click → revoke
```

`pages` is an array of length 1 (`scope: 'month'`) or 12 (`scope: 'year'`). One Chromium page,
one `setContent`, one `page.pdf()` call for both cases — the year export is a single HTML
document with twelve page sections, not twelve PDFs merged.

### 2.5 Key architectural rules (MUST)

1. **`CalendarPage.svelte` contains no `<style>` block.** All styling is inline `style`
   attributes, exactly as the prototype. Rationale: Vite extracts component `<style>` blocks
   into a separate CSS asset that `render()` from `svelte/server` does _not_ emit into `head`
   — a `<style>` block would silently produce an unstyled PDF.
   The **primary** guard is a source-file assertion: `readFileSync` of
   `src/lib/components/CalendarPage.svelte` MUST NOT match `/<style[\s>]/`. The
   `class="svelte-` check on the rendered body is a secondary guard only — it does not fire
   for a `<style>:global(.x){…}</style>` block, which emits no scoping class while still
   losing the CSS.
2. **`CalendarPage.svelte` uses no `$state`, no `$effect`, no `onMount`, no browser globals.**
   Props and `$derived` only. `$effect` and `onMount` do not run under `render()`; `$state`
   inside the page would be dead weight and an SSR hazard.
3. **`CalendarPage.svelte` owns no positioning chrome.** Its root element is a plain block of
   `width:297mm;height:210mm` with no `transform`, no `position:absolute`, no `box-shadow`, no
   `border-radius`. The app's `PreviewStage.svelte` adds the centring transform, the 8 px
   radius and the drop shadow; the print template adds the page break. This is what makes the
   same component correct in both contexts.
   297 × 210 mm is the layout page, not the paper. A3 is produced by `page.pdf({ scale })`
   (§7.5); `CalendarPage.svelte` renders identically for both paper sizes and never reads
   `options.paperSize`.
4. **Only `src/lib/server/pdf/puppeteer-browser.ts` imports `puppeteer-core`.** Everything else
   talks to the `BrowserLike`/`PageLike` interfaces in `src/lib/server/pdf/types.ts`.
5. **Layer 1 imports nothing** outside `src/lib/calendar/`. No `Date` object arithmetic (§4.2).
6. **Do not create `svelte.config.js`.** SvelteKit ≥ 2.62 ignores it entirely once any config
   is passed to the `sveltekit()` Vite plugin, and `sv` 0.17 no longer scaffolds one. The
   plugin signature is `sveltekit(config?: KitConfig & …)` — `KitConfig` keys such as
   `adapter` and `csp` go **flat** inside `sveltekit({ … })`, with no `kit:` nesting. A
   `svelte.config.js` added later would be silently dead, taking the CSP with it.

---

## 3. Domain model

### 3.1 `CalendarOptions`

`src/lib/calendar/types.ts`

```ts
export type SchemeId = 'organic' | 'skog' | 'neutral' | 'terrakotta' | 'hav' | 'natt';
export type FontId = 'organic' | 'klassisk' | 'lekfull' | 'modern';

/** Everything needed to render one calendar page, except the background image. */
export interface CalendarOptions {
	/** Gregorian year, integer, 2000–2100 inclusive. */
	year: number;
	/** Month index, integer, 0 = Januari … 11 = December. */
	month: number;
	schemeId: SchemeId;
	fontId: FontId;
	/** Day-box coverage in percent, integer, 30–100 inclusive, even numbers preferred. */
	opacity: number;
	showHolidays: boolean;
	/** Custom title. Empty string means "use the default `<Månad> <År>`". */
	title: string;
	/** Background-photo zoom. Finite, 1–4. 1 = plain `cover`. */
	imageZoom: number;
	/** Horizontal focal point of the photo, in `background-position` percent. Finite, 0–100. */
	imageX: number;
	/** Vertical focal point of the photo, in `background-position` percent. Finite, 0–100. */
	imageY: number;
	/** Paper size. `'A4'` (default) or `'A3'`; A3 is the same layout scaled (§4.11). */
	paperSize: PaperSizeId;
	/** Where the handwriting task list sits beside the day grid; `'off'` (default) omits it. */
	taskList: TaskListPosition;
	/** Task-list heading. Empty string means "use the default `Att göra`" (§4.5). */
	taskListTitle: string;
}

export const TASK_LIST_POSITIONS = ['off', 'left', 'right'] as const;
export type TaskListPosition = (typeof TASK_LIST_POSITIONS)[number];

export const DEFAULT_OPTIONS: CalendarOptions = {
	year: 2026,
	month: 8,
	schemeId: 'organic',
	fontId: 'organic',
	opacity: 88,
	showHolidays: true,
	title: '',
	imageZoom: 1,
	imageX: 50,
	imageY: 50,
	paperSize: 'A4',
	taskList: 'off',
	taskListTitle: ''
};
```

The client **always sends** `imageZoom`, `imageX` and `imageY`, whether or not a photo is
chosen; there is no `null` state and no optionality to branch on in the UI. They describe the
background layer's geometry, which the page emits unconditionally (§5.2) — with
`background-image:none` the values are simply invisible.

On the wire, though, six fields are **optional**: `parseCalendarOptions` (§3.3) defaults each
one from `DEFAULT_OPTIONS` (`imageZoom: 1`, `imageX: 50`, `imageY: 50` — plain `cover`/
`center`; `paperSize: 'A4'`; `taskList: 'off'`, `taskListTitle: ''`) when its key is absent
from the payload. This is a
backward-compatibility carve-out for the public API: a pre-feature caller's request has no
reason to know about these fields, and omitting them must keep producing the pre-feature
rendering rather than a `400`. A field that is present, `null` included, is still validated
exactly as below — only a genuinely missing key defaults.

`imageX` / `imageY` carry exactly CSS `background-position` percentage semantics, generalised
to zoom (§4.9): `0` aligns the image's left/top edge with the page's, `50` centres it, `100`
aligns the right/bottom edges. On an axis where the image does not overflow the page there is
nothing to move and the value has no effect — the same as in CSS.

The whole-year export uses one transform for all twelve pages: `yearPages` carries the three
fields across unchanged, exactly as it does with scheme, font and opacity (§14.3).

The task list (§5.2) is an optional column of blank ruled rows, each with an empty checkbox,
printed beside the day grid for handwriting. `taskList` picks its side (`'left'` or `'right'`)
or omits it (`'off'`). Unlike `title`, `taskListTitle` is not month-specific, so `yearPages`
carries both task-list fields across all twelve pages unchanged.

### 3.2 Export request

```ts
export type ExportScope = 'month' | 'year';
export interface ExportRequest extends CalendarOptions {
	scope: ExportScope;
}
```

The background image is **not** part of `CalendarOptions`. It travels as a separate
`multipart/form-data` part so it never has to be base64-encoded on the wire, and so that the
pure-logic layer never sees binary data.

### 3.3 Validation rules

`parseCalendarOptions(input: unknown): ParseResult<ExportRequest>` in
`src/lib/calendar/options.ts` — pure, no throwing, returns a discriminated union.

| Field                | Rule                                                                                      | Error code on failure     |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------- |
| _(the input itself)_ | must be a non-null, non-array `object`                                                    | `invalid_options`         |
| `year`               | `Number.isInteger`, `2000 ≤ year ≤ 2100`                                                  | `invalid_year`            |
| `month`              | `Number.isInteger`, `0 ≤ month ≤ 11`                                                      | `invalid_month`           |
| `schemeId`           | one of the six ids                                                                        | `invalid_scheme`          |
| `fontId`             | one of the four ids                                                                       | `invalid_font`            |
| `opacity`            | `Number.isInteger`, `30 ≤ opacity ≤ 100`                                                  | `invalid_opacity`         |
| `showHolidays`       | `typeof === 'boolean'`                                                                    | `invalid_show_holidays`   |
| `title`              | `typeof === 'string'`, length ≤ 120, no control characters (see below)                    | `invalid_title`           |
| `imageZoom`          | absent → defaults to `1`; else `Number.isFinite`, `1 ≤ imageZoom ≤ 4`                     | `invalid_image_zoom`      |
| `imageX`             | absent → defaults to `50`; else `Number.isFinite`, `0 ≤ imageX ≤ 100`                     | `invalid_image_x`         |
| `imageY`             | absent → defaults to `50`; else `Number.isFinite`, `0 ≤ imageY ≤ 100`                     | `invalid_image_y`         |
| `paperSize`          | absent → defaults to `'A4'`; else `'A4'` or `'A3'`                                        | `invalid_paper_size`      |
| `taskList`           | absent → defaults to `'off'`; else `'off'`, `'left'` or `'right'`                         | `invalid_task_list`       |
| `taskListTitle`      | absent → defaults to `''`; else `typeof === 'string'`, length ≤ 20, no control characters | `invalid_task_list_title` |
| `scope`              | `'month'` or `'year'`                                                                     | `invalid_scope`           |

`imageZoom`/`imageX`/`imageY`/`paperSize`/`taskList`/`taskListTitle` are the only **optional**
fields: a missing key defaults from `DEFAULT_OPTIONS` (§3.1) instead of failing. Optionality is keyed on the key
being absent (`o.imageZoom === undefined`), not on the value being falsy or nullish —
`imageZoom: null` is **present** and fails `invalid_image_zoom` exactly like `imageZoom: '2'`
would; likewise `paperSize: null` fails `invalid_paper_size`, `taskList: null` fails
`invalid_task_list` and `taskListTitle: null` fails `invalid_task_list_title`. This keeps the public API
backward compatible: a request built before this feature existed, which never had a reason to
send these fields, still renders — with the pre-feature `cover`/`center` geometry and A4 paper
— instead of getting a `400`. Every other field remains required with no default.

The three image fields are the only **non-integer** numbers in the payload — a drag produces
fractions — so they are checked with `Number.isFinite`, not `Number.isInteger`. `NaN`,
`Infinity` and `-Infinity` are rejected by `Number.isFinite`; a numeric string such as
`'1.5'` is rejected by the `typeof === 'number'` half, like every other numeric field.
`JSON.parse` rejects the bare tokens `NaN` and `Infinity` as a syntax error, but that is not the
defence it looks like: a numeral that overflows the double range, `1e400` for instance, parses
to `Infinity` without complaint. The `Number.isFinite` check is therefore the only thing
standing between a non-finite zoom or focal point and the render — the parse is a filter on
syntax, not on value. Nothing downstream divides by these values, but an unchecked `NaN` would
serialise into the style string as `left:NaN%`, which a browser drops silently and a PDF would
render un-panned with no error anywhere.

The control-character rule is the regex `/[\u0000-\u001F\u007F]/`, written with escapes
deliberately: literal control bytes must never be pasted into this document, into
`options.ts`, or into a test fixture. Vectors: `'Vår trädgård'` is valid; a string
containing a literal tab (`'a\tb'`) is `invalid_title`; a 121-character string is
`invalid_title`; `''` is valid and means “use the default title”. `taskListTitle` uses the same
regex: `'Inköp'` is valid, `'a\tb'` and a 21-character string are `invalid_task_list_title`,
and `''` means “use the default heading `Att göra`”. Its 20-character cap is the sidebar
input's `maxlength` (§6.3); the column it prints in is 50 mm wide, and a heading longer than
fits is ellipsised rather than wrapped (§5.2). The heading only ever reaches the page as Svelte
text interpolation — never into a `style` or other attribute — so the control-character rule
is the whole of its validation.

`parseCalendarOptions` **clamps nothing** — the API rejects out-of-range values. The _UI_
clamps (year input clamps to 2000–2100 as the prototype does) so the API never sees them.

Image part (validated in the endpoint, `src/routes/api/pdf/+server.ts`):

| Rule                                                | Error code               | Status |
| --------------------------------------------------- | ------------------------ | ------ |
| `image` part, when present, must be a `File`        | `invalid_image`          | 400    |
| `file.type` ∈ `{image/jpeg, image/png, image/webp}` | `unsupported_image_type` | 415    |
| `file.size ≤ MAX_UPLOAD_BYTES`                      | `image_too_large`        | 413    |
| magic-byte sniff matches the declared type (§8.4)   | `unsupported_image_type` | 415    |

### 3.4 Error responses

All API errors are `application/json` with the shape:

```json
{ "error": "image_too_large", "message": "Image exceeds the 20971520 byte limit." }
```

`message` is **English** (it is a developer-facing API). The browser client maps `error` to a
Swedish toast via the table in `src/lib/client/errors.ts` (§6.6). Unknown codes fall back to
`"Något gick fel. Försök igen."`.

| Code                                                                                                                                                                                                                                                                                                             | Status |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `unsupported_media_type` (request not multipart)                                                                                                                                                                                                                                                                 | 415    |
| `missing_options`                                                                                                                                                                                                                                                                                                | 400    |
| `invalid_json`                                                                                                                                                                                                                                                                                                   | 400    |
| `invalid_options` (payload is not an object)                                                                                                                                                                                                                                                                     | 400    |
| `invalid_year` / `invalid_month` / `invalid_scheme` / `invalid_font` / `invalid_opacity` / `invalid_show_holidays` / `invalid_title` / `invalid_image_zoom` / `invalid_image_x` / `invalid_image_y` / `invalid_paper_size` / `invalid_task_list` / `invalid_task_list_title` / `invalid_scope` / `invalid_image` | 400    |
| `unsupported_image_type`                                                                                                                                                                                                                                                                                         | 415    |
| `image_too_large`                                                                                                                                                                                                                                                                                                | 413    |
| `render_timeout`                                                                                                                                                                                                                                                                                                 | 504    |
| `renderer_busy` (queue wait exceeded)                                                                                                                                                                                                                                                                            | 503    |
| `renderer_unavailable` (browser launch failed)                                                                                                                                                                                                                                                                   | 503    |
| `internal_error`                                                                                                                                                                                                                                                                                                 | 500    |

Never leak stack traces or `CHROMIUM_PATH` in the response body; log them instead.

---

## 4. Pure logic modules (layer 1)

All functions are pure and total. Every value in the test tables below was computed and
verified against the prototype implementation before being written down.

### 4.1 `civil.ts` — integer date arithmetic

The prototype uses `new Date(y, m, d)` and `setDate()`. That is _technically_ DST-safe on
V8, but it is fragile (a `TZ` where local midnight does not exist — e.g. `America/Santiago`
DST spring-forward at 00:00 — makes `new Date(y,m,d)` land on the previous day). The service
runs in Docker where `TZ` is not guaranteed. We therefore MUST use timezone-free integer
arithmetic. No `Date` object appears anywhere in `src/lib/calendar/`.

```ts
/** A timezone-free calendar date. `month` is 0-based. */
export interface CivilDate {
	year: number;
	month: number;
	day: number;
}

/** Days since 1970-01-01 (Howard Hinnant's days_from_civil). Pure integer math. */
export function toDayNumber(d: CivilDate): number;
export function fromDayNumber(n: number): CivilDate;
export function addDays(d: CivilDate, n: number): CivilDate;
/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function weekday(d: CivilDate): number;
export function daysInMonth(year: number, month: number): number;
export function isLeapYear(year: number): boolean;
/** 'YYYY-MM-DD' — used as map keys and in tests. */
export function toKey(d: CivilDate): string;
export function sameYmd(a: CivilDate, b: CivilDate): boolean;
```

Reference implementation of the core conversion (do not invent another one):

```ts
export function toDayNumber({ year, month, day }: CivilDate): number {
	const y = year + Math.floor(month / 12);
	const m = ((month % 12) + 12) % 12; // 0..11
	const yy = m <= 1 ? y - 1 : y; // shift so March = month 0
	const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
	const yoe = yy - era * 400; // 0..399
	const mp = (m + 10) % 12; // Mar=0 … Feb=11
	const doy = Math.floor((153 * mp + 2) / 5) + day - 1; // 0..365
	const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
	return era * 146097 + doe - 719468;
}
```

`addDays` MUST be `fromDayNumber(toDayNumber(d) + n)` — month/day overflow (`month = 12`,
`day = 32`) is handled by `toDayNumber` normalising, which the Alla-helgons-dag rule relies on.

**Tests** (`civil.test.ts`):

| Input                                                                                                      | Expected                                                      |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `toDayNumber({1970,0,1})`                                                                                  | `0`                                                           |
| `toDayNumber({2026,8,1})`                                                                                  | `20697`                                                       |
| `fromDayNumber(0)`                                                                                         | `{1970,0,1}`                                                  |
| round-trip `fromDayNumber(toDayNumber(d)) === d` for every day of 2000-01-01…2100-12-31                    | holds                                                         |
| `weekday({2026,8,1})`                                                                                      | `2` (Tuesday)                                                 |
| `weekday({2026,7,1})`                                                                                      | `6` (Saturday)                                                |
| `addDays({2026,1,28}, 1)`                                                                                  | `{2026,2,1}`                                                  |
| `addDays({2024,1,28}, 1)`                                                                                  | `{2024,1,29}` (leap)                                          |
| `addDays({2026,0,1}, -1)`                                                                                  | `{2025,11,31}`                                                |
| `toDayNumber({2026,9,32})`                                                                                 | equals `toDayNumber({2026,10,1})` (overflow normalisation)    |
| `daysInMonth(2100,1)`                                                                                      | `28` (2100 is not a leap year)                                |
| `daysInMonth(2000,1)`                                                                                      | `29`                                                          |
| the whole module produces identical results under `TZ=UTC`, `TZ=Europe/Stockholm`, `TZ=Pacific/Kiritimati` | holds (run the suite thrice via `process.env.TZ` in the test) |

### 4.2 `iso-week.ts`

```ts
/** ISO-8601 week number, 1–53. */
export function isoWeek(d: CivilDate): number;
/** ISO week-numbering year (needed for nothing today; export for completeness). */
export function isoWeekYear(d: CivilDate): number;
```

Implementation: `const thursday = addDays(d, 4 - weekday(d));` then
`isoWeek = Math.floor((toDayNumber(thursday) - toDayNumber({thursday.year, 0, 1})) / 7) + 1`.

**Tests** (`iso-week.test.ts`) — all verified:

| Date       | ISO week |
| ---------- | -------- |
| 2026-09-01 | 36       |
| 2026-08-31 | 36       |
| 2026-01-01 | 1        |
| 2026-12-31 | 53       |
| 2027-01-01 | 53       |
| 2027-01-04 | 1        |
| 2021-01-01 | 53       |
| 2020-12-28 | 53       |
| 2025-12-29 | 1        |

Additional property test: the set of years in 2000–2100 whose 28 December falls in week 53
is exactly `{2004, 2009, 2015, 2020, 2026, 2032, 2037, 2043, 2048, 2054, 2060, 2065, 2071,
2076, 2082, 2088, 2093, 2099}`.

### 4.3 `easter.ts`

```ts
/** Gregorian Easter Sunday (anonymous Gregorian computus). */
export function easter(year: number): CivilDate;
```

Port the prototype algorithm verbatim, returning a `CivilDate` (`month` 0-based).

**Tests** (`easter.test.ts`) — verified:

| Year | Easter Sunday |
| ---- | ------------- |
| 2000 | 2000-04-23    |
| 2020 | 2020-04-12    |
| 2024 | 2024-03-31    |
| 2025 | 2025-04-20    |
| 2026 | 2026-04-05    |
| 2027 | 2027-03-28    |
| 2030 | 2030-04-21    |
| 2038 | 2038-04-25    |
| 2100 | 2100-03-28    |

Property test: for every year 2000–2100, Easter is a Sunday (`weekday === 7`) and falls
between 22 March and 25 April inclusive.

### 4.4 `holidays.ts`

```ts
export interface Holiday {
	date: CivilDate;
	name: string;
}

/** All Swedish red days + the four "afton" days, for one Gregorian year. */
export function holidaysForYear(year: number): Holiday[];

/**
 * 'YYYY-MM-DD' → name. Memoised per year (Map, unbounded is fine: ≤101 entries).
 * Built by inserting holidaysForYear(year) in order, so on a date collision the LAST
 * entry in the table below wins — matching the prototype (§4.4, "Collisions").
 */
export function holidayMap(year: number): ReadonlyMap<string, string>;
```

Sixteen entries, in this order (names are Swedish, exact strings from the prototype). **The
order is normative**, because it decides collisions:

| #   | Name                   | Rule                           |
| --- | ---------------------- | ------------------------------ |
| 1   | Nyårsdagen             | 1 Jan                          |
| 2   | Trettondedag jul       | 6 Jan                          |
| 3   | Långfredagen           | Easter − 2                     |
| 4   | Påskdagen              | Easter                         |
| 5   | Annandag påsk          | Easter + 1                     |
| 6   | Första maj             | 1 May                          |
| 7   | Kristi himmelsfärdsdag | Easter + 39                    |
| 8   | Pingstdagen            | Easter + 49                    |
| 9   | Nationaldagen          | 6 Jun                          |
| 10  | Midsommarafton         | Midsommardagen − 1             |
| 11  | Midsommardagen         | the Saturday in 20–26 June     |
| 12  | Alla helgons dag       | the Saturday in 31 Oct – 6 Nov |
| 13  | Julafton               | 24 Dec                         |
| 14  | Juldagen               | 25 Dec                         |
| 15  | Annandag jul           | 26 Dec                         |
| 16  | Nyårsafton             | 31 Dec                         |

Helper: `saturdayInRange(year, month, fromDay, toDay)` scanning `fromDay..toDay` and relying
on `toDayNumber` day-overflow so Alla helgons dag can be expressed as
`saturdayInRange(y, 9 /* Oct */, 31, 37)`. It MUST throw (`invariant`) if no Saturday is
found, rather than returning `undefined` as the prototype does.

**Collisions.** Two holidays can fall on the same date, so `holidaysForYear` returns 16
entries while `holidayMap` has only 15 keys in those years. Resolution is **last-write-wins in
the table order above** — the same behaviour the prototype gets from its
`list.forEach(([d,n]) => { map[d.toDateString()] = n })`. In 2000–2100 this happens in exactly
four years (verified):

| Year | Date       | Colliding entries                             | Name shown                 |
| ---- | ---------- | --------------------------------------------- | -------------------------- |
| 2008 | 2008-05-01 | Första maj (#6) + Kristi himmelsfärdsdag (#7) | **Kristi himmelsfärdsdag** |
| 2049 | 2049-06-06 | Pingstdagen (#8) + Nationaldagen (#9)         | **Nationaldagen**          |
| 2055 | 2055-06-06 | Pingstdagen (#8) + Nationaldagen (#9)         | **Nationaldagen**          |
| 2060 | 2060-06-06 | Pingstdagen (#8) + Nationaldagen (#9)         | **Nationaldagen**          |

**Tests** (`holidays.test.ts`) — verified:

| Year | Holiday                | Date       |
| ---- | ---------------------- | ---------- |
| 2026 | Långfredagen           | 2026-04-03 |
| 2026 | Påskdagen              | 2026-04-05 |
| 2026 | Annandag påsk          | 2026-04-06 |
| 2026 | Kristi himmelsfärdsdag | 2026-05-14 |
| 2026 | Pingstdagen            | 2026-05-24 |
| 2026 | Midsommarafton         | 2026-06-19 |
| 2026 | Midsommardagen         | 2026-06-20 |
| 2026 | Alla helgons dag       | 2026-10-31 |
| 2027 | Midsommardagen         | 2027-06-26 |
| 2027 | Alla helgons dag       | 2027-11-06 |
| 2025 | Midsommardagen         | 2025-06-21 |
| 2025 | Alla helgons dag       | 2025-11-01 |
| 2024 | Midsommardagen         | 2024-06-22 |
| 2024 | Alla helgons dag       | 2024-11-02 |
| 2030 | Midsommardagen         | 2030-06-22 |
| 2030 | Alla helgons dag       | 2030-11-02 |

2026 and 2027 are the boundary years: Midsommardagen hits the first (20 Jun) and last (26 Jun)
day of its range, Alla helgons dag hits 31 Oct and 6 Nov. Both boundaries MUST be tested.

Collision vectors (named tests, not just a property): `holidaysForYear(2008)` has 16 entries
but `holidayMap(2008).size === 15` and `holidayMap(2008).get('2008-05-01') === 'Kristi
himmelsfärdsdag'`; likewise `holidayMap(2049).get('2049-06-06') === 'Nationaldagen'`, and the
same for 2055 and 2060.

Property tests over 2000–2100: `holidaysForYear` always returns exactly 16 entries;
Midsommardagen and Alla helgons dag are always Saturdays; `holidayMap(y).size` is 16 for every
year **except** 2008, 2049, 2055 and 2060, where it is 15 — i.e. the set of colliding years is
exactly `{2008, 2049, 2055, 2060}`.

### 4.5 `strings.ts`

```ts
export const MONTHS = [
	'Januari',
	'Februari',
	'Mars',
	'April',
	'Maj',
	'Juni',
	'Juli',
	'Augusti',
	'September',
	'Oktober',
	'November',
	'December'
] as const;
export const DAY_NAMES = [
	'Måndag',
	'Tisdag',
	'Onsdag',
	'Torsdag',
	'Fredag',
	'Lördag',
	'Söndag'
] as const;
/** `${MONTHS[month]} ${year}` */
export function defaultTitle(year: number, month: number): string;
/** `title.trim() || defaultTitle(year, month)` — note: trim, unlike the prototype. */
export function resolveTitle(o: Pick<CalendarOptions, 'year' | 'month' | 'title'>): string;
export const DEFAULT_TASK_LIST_TITLE = 'Att göra';
/** `taskListTitle.trim() || DEFAULT_TASK_LIST_TITLE` — the same rule as `resolveTitle`. */
export function resolveTaskListTitle(o: Pick<CalendarOptions, 'taskListTitle'>): string;
```

**Tests**: `defaultTitle(2026, 8) === 'September 2026'`; `resolveTitle({year:2026,month:8,title:''}) === 'September 2026'`;
`resolveTitle({...,title:'   '}) === 'September 2026'`; `resolveTitle({...,title:'Vår trädgård'}) === 'Vår trädgård'`;
`resolveTaskListTitle({taskListTitle:''})` and `({taskListTitle:'   '})` are `'Att göra'`;
`resolveTaskListTitle({taskListTitle:' Inköp '}) === 'Inköp'`.

### 4.6 `schemes.ts` and `fonts.ts`

Transcribed **verbatim** from the prototype (§5.4 lists the tables in full).

```ts
export interface Scheme {
	id: SchemeId;
	name: string;
	bg: string;
	text: string;
	title: string;
	titleBg: string;
	day: string;
	dayFg: string;
	week: string;
	weekFg: string;
	/** "R,G,B" triples — alpha is applied at render time. */
	cell: string;
	weekend: string;
	other: string;
	weekendFg: string;
	otherFg: string;
	holiday: string;
}
export const SCHEMES: readonly Scheme[];
export function getScheme(id: SchemeId): Scheme; // throws on unknown id

export interface FontPairing {
	id: FontId;
	name: string;
	/** CSS font-family value, e.g. "'Caprasimo', serif" */
	heading: string;
	body: string;
	/** Weight the heading face is actually shipped at. */
	headingWeight: 400 | 500 | 600;
	/** Family names as they appear in @font-face, for print-time font selection. */
	headingFamily: string;
	bodyFamily: string;
}
export const FONTS: readonly FontPairing[];
export function getFont(id: FontId): FontPairing;
```

**Tests**: `SCHEMES.length === 6`, `FONTS.length === 4`, ids unique, every colour string
matches `/^(#[0-9a-f]{6}|rgba\(.+\)|\d{1,3},\d{1,3},\d{1,3})$/`, `getScheme('organic').bg === '#f5ead8'`,
`getFont('klassisk').headingWeight === 500`, unknown id throws.

### 4.7 `css.ts`

```ts
/** 3-decimal, trailing-zero-stripped alpha. round(0.88*0.8) → "0.704", not "0.7040000000000001". */
export function alpha(value: number): string;
/** `rgba(249,244,237,0.88)` */
export function rgba(triple: string, a: number): string;
/** 2-decimal CSS percentage. pct((1 - 1.37) * 33) → "-12.21%". */
export function pct(value: number): string;
/** Escapes and wraps a URL for `background-image`. Returns 'none' for null. */
export function imageCss(url: string | null): string;
```

`alpha` MUST be `String(Math.round(value * 1000) / 1000)`. Without it, `0.88 * 0.8` serialises
as `0.7040000000000001` and snapshot tests become platform-lore.

`pct` MUST be `` `${Math.round(value * 100) / 100}%` ``. Same reason, one level worse: the
background-layer offsets (§4.9) are products of two user-controlled floats, so `(1 - 1.37) * 33`
serialises as `-12.210000000000004` unrounded. Two decimals of a 297 mm page is 0.03 mm — an
order of magnitude below what any printer resolves — so the rounding is free. (A `-0` result
needs no special handling: template interpolation of `-0` already yields `"0"`.)

`imageCss` MUST reject (throw) URLs containing `"`, `)`, `\`, `<`, or any control character,
and MUST wrap in double quotes: `url("blob:http://localhost/…")`. This is the only place a
user-influenced string reaches a CSS value.

**Tests**: `alpha(0.88*0.8) === '0.704'`; `alpha(1) === '1'`; `alpha(0.3) === '0.3'`;
`rgba('249,244,237', 0.88) === 'rgba(249,244,237,0.88)'`; `imageCss(null) === 'none'`;
`imageCss('blob:x') === 'url("blob:x")'`; `imageCss('a")b')` throws;
`pct(0) === '0%'`; `pct(100) === '100%'`; `pct((1 - 1.37) * 33) === '-12.21%'`;
`pct(-0.001) === '0%'` (no `-0%`).

### 4.8 `grid.ts`

```ts
export interface GridCell {
	date: CivilDate;
	/** Day-of-month number shown in the box. */
	dayOfMonth: number;
	/** true when the cell belongs to the previous or next month. */
	otherMonth: boolean;
	/** ISO weekday 1–7. */
	weekday: number;
	/** Holiday name, or '' — always '' for otherMonth cells. */
	holiday: string;
}
export interface GridWeek {
	isoWeek: number;
	days: GridCell[]; /* length 7 */
}
export interface CalendarGrid {
	rows: number;
	weeks: GridWeek[];
}

export function buildGrid(
	o: Pick<CalendarOptions, 'year' | 'month' | 'showHolidays'>
): CalendarGrid;
```

Rules:

- `offset = weekday(firstOfMonth) - 1` (0 for Monday … 6 for Sunday).
- `start = addDays(firstOfMonth, -offset)`.
- `rows = Math.max(5, Math.ceil((offset + daysInMonth) / 7))`.
  The `max(5, …)` clamp is a **product-owner decision** and the one intentional change to the
  prototype's arithmetic: every page has at least five week rows, so day boxes are the same
  height on every page of a year export. Without it, a non-leap February starting on a Monday
  produces a 4-row page with visibly taller boxes (§14.1). The clamp only ever _adds_ a row,
  and that row is entirely next-month cells.
- `weeks[r].isoWeek = isoWeek(addDays(start, r * 7))` — the Monday of that row.
- `holiday` is looked up in `holidayMap(cell.date.year)` (note: **the cell's own year**, not
  the option year — this fixes a latent prototype defect, see §14.2) and forced to `''` when
  `otherMonth` or `!showHolidays`.

**Tests** (`grid.test.ts`) — all verified:

| Month         | offset | days | rows                   | grid start | week numbers           |
| ------------- | ------ | ---- | ---------------------- | ---------- | ---------------------- |
| 2026-09 (Sep) | 1      | 30   | **5**                  | 2026-08-31 | 36, 37, 38, 39, 40     |
| 2026-08 (Aug) | 5      | 31   | **6**                  | 2026-07-27 | 31, 32, 33, 34, 35, 36 |
| 2026-11 (Nov) | 6      | 30   | **6**                  | 2026-10-26 | 44, 45, 46, 47, 48, 49 |
| 2026-03 (Mar) | 6      | 31   | **6**                  | —          | —                      |
| 2027-02 (Feb) | 0      | 28   | **5** (clamped from 4) | 2027-02-01 | 5, 6, 7, 8, 9          |
| 2021-02 (Feb) | 0      | 28   | **5** (clamped from 4) | 2021-02-01 | 5, 6, 7, 8, 9          |
| 2026-12 (Dec) | 1      | 31   | 5                      | 2026-11-30 | 49, 50, 51, 52, **53** |
| 2026-01 (Jan) | 3      | 31   | 5                      | 2025-12-29 | 1, 2, 3, 4, 5          |

Further assertions:

- Every `weeks[r].days.length === 7`; `weeks.length === rows`.
- `buildGrid` over all 1212 months of 2000–2100 yields only `rows ∈ {5,6}` — **952 five-row
  months and 260 six-row months, and zero four-row months** (verified). This matches the
  README's "5 or 6 weeks as needed".
- The clamp only ever adds rows: for all 1212 months,
  `rows >= Math.ceil((offset + daysInMonth) / 7)`, and the difference is 0 or 1.
- 2027-02: `rows === 5`, and `weeks[4].days` is 2027-03-01…2027-03-07 with every cell
  `otherMonth: true` and `holiday === ''`.
- 2026-09 grid: cell 0 is 2026-08-31 with `otherMonth: true`; cell 1 is 2026-09-01,
  `otherMonth: false`, `weekday: 2`.
- 2026-06 with `showHolidays: true`: the 2026-06-19 cell has `holiday === 'Midsommarafton'`
  and 2026-06-20 has `'Midsommardagen'`.
- 2026-01 with `showHolidays: true`: the leading 2025-12-31 cell has `holiday === ''`
  (otherMonth wins) — and the underlying lookup used year 2025, not 2026.
- `showHolidays: false` ⇒ every `holiday === ''`.

### 4.9 `view.ts` — resolved render model

This is what the component consumes. Keeping colour resolution here (rather than in Svelte)
makes every pixel decision unit-testable.

```ts
export interface ViewCell {
	dayOfMonth: number;
	holiday: string;
	/** Full CSS colour for the box fill, e.g. 'rgba(249,244,237,0.88)'. */
	background: string;
	/** Full CSS colour for the date number and holiday name. */
	foreground: string;
}
export interface ViewWeek {
	label: string;
	/* 'v.36' */ cells: ViewCell[];
}

/** Geometry of the background-photo layer, pre-serialised as CSS values (§5.2). */
export interface ViewBackground {
	/** `left` of the enlarged box, e.g. '-25%'. */
	left: string;
	/** `top` of the enlarged box, e.g. '-50%'. */
	top: string;
	/** `width` and `height` of the enlarged box, e.g. '200%'. */
	size: string;
	/** `background-position` inside that box, e.g. '25% 50%'. */
	position: string;
}

/** The handwriting task list (§5.2). */
export interface ViewTaskList {
	/** Resolved heading, `resolveTaskListTitle(o)`, e.g. 'Att göra'. */
	title: string;
	/** Grid placement of the list column, e.g. 'grid-row:2;grid-column:1'. */
	placement: string;
	/** Panel fill — the current-month day-box colour, e.g. 'rgba(249,244,237,0.88)'. */
	background: string;
	/** Colour of the row rules and the checkbox outlines (`scheme.otherFg`). */
	line: string;
	/** `border-top` per row, TASK_LIST_ROWS (14) entries: 'none', then '1px solid {line}'. */
	rowBorders: string[];
}

/** Style suffixes that make room for the task list; every one is '' when it is off. */
export interface ViewLayout {
	/** Appended to the root `<section>` style, e.g. ';grid-template-columns:50mm 1fr'. */
	section: string;
	/** Appended to the `<header>` style, e.g. ';grid-column:1/-1'. */
	header: string;
	/** Appended to the day-grid style, e.g. ';grid-row:2;grid-column:2;min-width:0'. */
	grid: string;
}

export interface CalendarView {
	title: string;
	rows: number;
	gridTemplateRows: string; // `auto repeat(5,1fr)`
	weeks: ViewWeek[];
	dayNames: readonly string[]; // DAY_NAMES
	scheme: Scheme;
	font: FontPairing;
	background: ViewBackground;
	layout: ViewLayout;
	/** `null` when `taskList === 'off'`. */
	taskList: ViewTaskList | null;
}

export function buildCalendarView(o: CalendarOptions): CalendarView;
```

Colour rules (ported exactly; `op = opacity / 100`, `i` = 0-based column index):

```
otherMonth       → background rgba(scheme.other,   alpha(op * 0.8))
i >= 5 || holiday→ background rgba(scheme.weekend, alpha(op))
otherwise        → background rgba(scheme.cell,    alpha(op))

otherMonth       → foreground scheme.otherFg
i === 6 || holiday → foreground scheme.holiday          (red rule)
i === 5          → foreground scheme.weekendFg
otherwise        → foreground scheme.text
```

Background geometry (`z = imageZoom`, `x = imageX`, `y = imageY`):

```
background.left     = pct((1 - z) * x)
background.top      = pct((1 - z) * y)
background.size     = pct(z * 100)
background.position = `${pct(x)} ${pct(y)}`
```

**Why this is correct, and aspect-ratio-agnostic.** The layer is a box `z` times the page,
offset by a negative percentage, with `background-size:cover` inside it. Let `W` be the page
width and `C` the width the photo covers the page with at `z = 1` (`C ≥ W`, and its value
depends on the photo's aspect ratio, which the server never learns). Scaling the box by `z`
scales the cover result by `z`, so the rendered photo is `z·C` wide. Its left edge then sits at

```
box offset            (1 - z) · x/100 · W
+ position inside box (z·W - z·C) · x/100
= x/100 · (W - z·C)
```

which is precisely `background-position: x%` for an image of rendered width `z·C`: the image's
left edge at `x` % of the leftover space. Linear in `x`, no aspect ratio anywhere in the
expression, no `transform`, and at `z = 1, x = y = 50` it reduces to `left:0%;top:0%;
width:100%;height:100%;background-position:50% 50%` — the same rendering as the
`inset:0` / `background-position:center` layer this replaces. The vertical axis is the same
statement with `H`, `y` and the cover height.

The rounding lives here rather than in the component so the style string is a plain, stable,
unit-testable value, and so preview and print are byte-identical by construction.

Task-list layout (`op` as above, `line = scheme.otherFg`):

| `taskList` | `layout.section`                  | `layout.header`     | `layout.grid`                           | `taskList.placement`       |
| ---------- | --------------------------------- | ------------------- | --------------------------------------- | -------------------------- |
| `'off'`    | `''`                              | `''`                | `''`                                    | — (`taskList` is `null`)   |
| `'left'`   | `;grid-template-columns:50mm 1fr` | `;grid-column:1/-1` | `;grid-row:2;grid-column:2;min-width:0` | `grid-row:2;grid-column:1` |
| `'right'`  | `;grid-template-columns:1fr 50mm` | `;grid-column:1/-1` | `;grid-row:2;grid-column:1;min-width:0` | `grid-row:2;grid-column:2` |

`taskList.background = rgba(scheme.cell, alpha(op))` — exactly a weekday current-month box, so
the box-coverage slider governs the panel too. `rowBorders[0] = 'none'`, every later entry
`1px solid {line}`, so the rules sit _between_ rows. `TASK_LIST_ROWS = 14`. The column width is the named constant `TASK_LIST_WIDTH = '50mm'`, next to it; the strings above are built from it.

The suffixes are empty strings, not omitted attributes, so with `taskList: 'off'` every style
attribute serialises to the same bytes as before the feature existed. The root grid gains a
second column only when the list is on; the header then spans both columns (the list sits
_below_ the header, beside the day grid), and the day grid and list are placed explicitly on
row 2 so the component needs a single conditional block regardless of side.

The `red` flag is evaluated **after** the `otherMonth` branch, so an adjacent-month holiday
can never be coloured red — matching the prototype, and now unreachable anyway because
`grid.ts` blanks `holiday` for other-month cells.

**Tests** (`view.test.ts`) — verified against the prototype for
`{year:2026, month:8, schemeId:'organic', opacity:88, showHolidays:true}`, first week:

| i   | date               | background                | foreground |
| --- | ------------------ | ------------------------- | ---------- |
| 0   | 2026-08-31 (other) | `rgba(220,211,196,0.704)` | `#a19786`  |
| 1   | 2026-09-01         | `rgba(249,244,237,0.88)`  | `#2e2b25`  |
| 4   | 2026-09-04         | `rgba(249,244,237,0.88)`  | `#2e2b25`  |
| 5   | 2026-09-05 (lör)   | `rgba(238,231,219,0.88)`  | `#8c491a`  |
| 6   | 2026-09-06 (sön)   | `rgba(238,231,219,0.88)`  | `#8c491a`  |

Plus: `weeks[0].label === 'v.36'`; `gridTemplateRows === 'auto repeat(5,1fr)'`;
`title === 'September 2026'`; a `natt` scheme case; an `opacity: 30` case
(`rgba(220,211,196,0.24)` for other-month); a holiday-on-a-weekday case
(2026-06-19 Midsommarafton ⇒ weekend background + `#8c491a` foreground).

Background geometry (`view.background`):

| `imageZoom` / `imageX` / `imageY` | `left`    | `top`     | `size` | `position` |
| --------------------------------- | --------- | --------- | ------ | ---------- |
| `1` / `50` / `50` (defaults)      | `0%`      | `0%`      | `100%` | `50% 50%`  |
| `2` / `25` / `50`                 | `-25%`    | `-50%`    | `200%` | `25% 50%`  |
| `4` / `0` / `100`                 | `0%`      | `-300%`   | `400%` | `0% 100%`  |
| `1.37` / `33` / `66`              | `-12.21%` | `-24.42%` | `137%` | `33% 66%`  |

The last row is the rounding regression: unrounded, `left` would be `-12.210000000000004%`.

Task list (`view.layout`, `view.taskList`): the default options give `taskList === null` and
all three `layout` strings `''`; `'left'` and `'right'` give exactly the table above;
`taskList.title` is `'Att göra'` for `taskListTitle: ''` and `'Inköp'` for `' Inköp '`;
`taskList.background === 'rgba(249,244,237,0.88)'` for organic at 88 % and
`'rgba(71,66,56,0.3)'` for natt at 30 %; `line === '#a19786'` for organic; `rowBorders` has 14
entries, the first `'none'` and the rest `'1px solid #a19786'`.

### 4.10 `options.ts`

```ts
export type ParseResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

export function parseCalendarOptions(input: unknown): ParseResult<ExportRequest>;
/** Drops `scope`, leaving a plain CalendarOptions. Used for the single-month path. */
export function stripScope(o: ExportRequest): CalendarOptions;
/** 12 CalendarOptions for a year export; title forced to '' on every one, taskList kept. */
export function yearPages(o: CalendarOptions | ExportRequest): CalendarOptions[];
export function pdfFilename(o: ExportRequest): string;
```

`yearPages` returns `Array.from({length:12}, (_, month) => stripScope({ ...o, month, title: '' }))`.

`pdfFilename`: `scope==='month'` → `calgen-${year}-${String(month+1).padStart(2,'0')}.pdf`,
with `-a3` appended before `.pdf` when `paperSize === 'A3'`; `scope==='year'` →
`calgen-${year}.pdf`, same `-a3` suffix rule. A4 filenames are unchanged.

**Tests**: valid object round-trips; each invalid field yields its documented code; `null`,
`[]`, `'string'` inputs yield `invalid_options`; unknown extra keys are ignored (not an error);
`yearPages({year:2026,month:8,title:'Vår trädgård',...})` → 12 items, months 0..11, every
`title === ''`; `pdfFilename({year:2026,month:8,scope:'month'}) === 'calgen-2026-09.pdf'`;
`pdfFilename({year:2026,month:8,scope:'year'}) === 'calgen-2026.pdf'`;
`pdfFilename({year:2026,month:8,scope:'month',paperSize:'A3'}) === 'calgen-2026-09-a3.pdf'`;
`pdfFilename({year:2026,scope:'year',paperSize:'A3'}) === 'calgen-2026-a3.pdf'`;
`stripScope` output has no `scope` key (`'scope' in stripScope(req) === false`).

For the task list: `taskList` `'off'`, `'left'` and `'right'` are accepted; `'Left'`, `'top'`,
`''`, `null`, `true` are `invalid_task_list`. `taskListTitle` `''`, `'Inköp'` and a 20-character
string are accepted; `42`, `null`, a 21-character string, `'a\tb'` and `'a\u007Fb'` are
`invalid_task_list_title`. An options object with both keys omitted parses `ok: true` with
`taskList: 'off'`, `taskListTitle: ''`. `yearPages({...,taskList:'right',taskListTitle:'Inköp'})`
carries both across all twelve pages, and `pdfFilename` ignores them.

For the image transform specifically: `imageZoom: 1` and `imageZoom: 4` are accepted and
`0.99` / `4.01` / `'2'` / `NaN` / `Infinity` are `invalid_image_zoom`; `imageX: 0` and
`imageX: 100` are accepted and `-0.01` / `100.01` / `NaN` are `invalid_image_x` (same for
`imageY` and `invalid_image_y`); a fractional `imageZoom: 1.5` with `imageX: 33.33` round-trips
unchanged — the parser must not round or clamp them, since rounding is the renderer's job
(§4.7) and clamping is the UI's (§3.3); and `yearPages` carries all three across every one of
the twelve pages. An options object with all three keys omitted parses `ok: true` with
`imageZoom: 1`, `imageX: 50`, `imageY: 50` (§3.1's defaults); `imageZoom: null` is present, not
absent, so it fails `invalid_image_zoom` (and likewise `imageX: null` / `imageY: null`).

### 4.11 `paper.ts` — paper sizes and the A3 scale factor

```ts
export type PaperSizeId = 'A4' | 'A3';

export interface PaperSize {
	id: PaperSizeId;
	name: string;
	widthMm: number;
	heightMm: number;
	/** Multiplied into `page.pdf({ scale })`; A4's is the literal `1`. */
	scale: number;
}

export const PAPER_SIZES: readonly PaperSize[];
/** @throws when the id is not one of the two. */
export function getPaperSize(id: PaperSizeId): PaperSize;
```

| id   | name | mm        | scale   |
| ---- | ---- | --------- | ------- |
| `A4` | A4   | 297 × 210 | `1`     |
| `A3` | A3   | 420 × 297 | `1.414` |

A3 is not a re-layout: `CalendarPage.svelte` always renders the 297 × 210 mm layout page
(§2.5.3). `print-html.ts`'s `@page` rule is set to the requested paper's own size (§7.4), and
`page.pdf({ scale })` (§7.5) then scales the whole rendering — `.calgen-page` included — by that
factor, so every dimension grows by one factor in vector space — same composition, same
relative type size.

**Why `scale = 1.414`, rounded down, and not `Math.SQRT2` or the exact ratio.** The scaled
content is `297 * scale` mm wide and `210 * scale` mm tall, and it has to stay strictly inside
the nominal 420 × 297 mm sheet on both axes. The obvious candidates both fail:

- `Math.SQRT2` (`1.41421356…`): `297 * 1.41421356 = 420.021` mm — wider than the 420 mm sheet:
  negative slack, horizontal overflow onto a plausible second page.
- `420 / 297 = 1.414141…` lands the content width on exactly `420.000` mm: float equality at
  the failure boundary, one rounding error away from overflow.

`1.414`, truncated rather than rounded to the nearest thousandth, gives printed content of
419.958 × 296.940 mm on the 420 × 297 mm sheet — both axes strictly inside it, with slack under
0.1 mm on both. `297 * 1.414 = 419.958 < 420` and `210 * 1.414 = 296.94 < 297` strictly — the
property `paper.test.ts` asserts directly. This matches real Chromium output (§7.5): MediaBox
1191.12 × 841.92 pt, `pageCount` 1 and 12, and the content-stream scale ratio (§7.5's "Root
cause and fix" note) confirms the drawing commands themselves are scaled, not just the
MediaBox. The margin this leaves at the right and foot is covered by `pageBg` end-to-end, so A3
has no unpainted edge either (§7.4).

`A4.scale` is the literal `1` so `PDF_OPTIONS` for an A4 job is object-identical to the
pre-A3 options — the mechanism by which A4 output is provably unchanged.

---

## 5. `CalendarPage.svelte` — the calendar page contract

### 5.1 Props

```ts
interface Props {
	/** Everything except the image. */
	options: CalendarOptions;
	/** Full CSS `background-image` value. 'none' (default), 'url("blob:…")' or 'var(--calgen-bg)'. */
	imageCss?: string;
}
let { options, imageCss = 'none' }: Props = $props();
const view = $derived(buildCalendarView(options));
```

**Why `imageCss` and not `imageUrl`:** the whole-year PDF renders twelve copies of this
component in one document. With an `imageUrl` prop, the photo would be inlined twelve times.
With `imageCss`, the print template emits one URL **once** as `:root{--calgen-bg:url(…)}` and
every page uses `var(--calgen-bg)`. The preview passes `imageCss(objectUrl)` from `css.ts`. The
value is never taken from the client — the server constructs it — so there is no
CSS-injection surface.

The print template's URL is not a `data:` URL of the photo (§7.1, §7.4): Chromium silently
drops any URL longer than 2 MiB (`url::kMaxURLChars`), which a base64-encoded phone photo
routinely exceeds, so the renderer instead serves the photo's raw bytes under a short fixed
URL via request interception. The twelve-copies argument above is unaffected — it is the
reason the URL is emitted once at the root rather than once per page — only the mechanism
behind that one URL changed.

### 5.2 DOM structure and exact styles

Transcribed from the prototype (§1.4, `CalGen.dc.html` lines 92–111), with rule §2.5.3
applied (no transform, no shadow, no radius, no absolute positioning on the root). `{}` marks
interpolation.

Root `<section>`:

```
width:297mm;height:210mm;overflow:hidden;position:relative;box-sizing:border-box;
display:grid;grid-template-rows:auto 1fr;gap:5mm;padding:30mm 10mm 10mm;
background:{view.scheme.bg};color:{view.scheme.text};font-family:{view.font.body}{view.layout.section}
```

This is the layout page and is identical for A4 and A3. `{view.layout.section}` and the other
two `layout` suffixes below are `''` unless the task list is on (§4.9).

Background photo layer (first child, always rendered):

```
position:absolute;left:{view.background.left};top:{view.background.top};
width:{view.background.size};height:{view.background.size};
background-size:cover;background-position:{view.background.position};
background-image:{imageCss}
```

At the default transform this is `left:0%;top:0%;width:100%;height:100%;background-size:cover;
background-position:50% 50%` — the same rendering as the `inset:0` / `center` layer it
replaces (§4.9). Four rules govern this element and none of them may be relaxed:

- **No `transform`.** A `transform` on the layer would be the obvious way to zoom and pan, and
  it is the wrong one here: it would put a second, component-owned transform inside a page that
  §2.5.3 keeps transform-free, it would need the photo's aspect ratio (which layer 1 does not
  have) to convert a `background-position` percentage into a translation, and Chromium's print
  path rasterises transformed layers on its own terms. The enlarged-box form is pure layout, so
  preview and print agree by construction.
- The **root `<section>` keeps `overflow:hidden`**: at `z > 1` the layer is deliberately larger
  than the page and every edge of it must be clipped.
- The layer stays **`position:absolute` inside the `position:relative` root**. Its percentages
  therefore resolve against the root's padding box — 297 × 210 mm, the full page, _including_
  the `padding:30mm 10mm 10mm`, not the content box. This is what `inset:0` already relied on.
- The layer is **always rendered**, with or without a photo. `background-image:none` makes the
  geometry invisible, so there is no conditional branch and no second DOM shape to test.

`<header>`:

```
position:relative;display:flex;align-items:flex-end;padding-left:36px{view.layout.header}
```

(36 px = 30 px week column + 6 px grid gap, so the title aligns with the Monday column. With the
task list on the left, the title keeps that 36 px and so sits over the list, not the Monday
column: the header spans the full content width either way.)

`<h1>`:

```
margin:0;display:inline-block;padding:10px 22px;border-radius:999px;
font-weight:{view.font.headingWeight};font-size:40px;line-height:1;
background:{view.scheme.titleBg};color:{view.scheme.title};font-family:{view.font.heading}
```

Grid container:

```
position:relative;display:grid;grid-template-columns:30px repeat(7,1fr);gap:6px;
min-height:0;grid-template-rows:{view.gridTemplateRows}{view.layout.grid}
```

First grid child is an empty `<div></div>` (the week-column header spacer).

Day-name pill (×7):

```
display:flex;align-items:center;padding:6px 14px;border-radius:999px;
font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
background:{view.scheme.day};color:{view.scheme.dayFg}
```

Week pill (one per row, first cell of the row):

```
display:flex;align-items:center;justify-content:center;border-radius:999px;
font-size:13px;writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;
letter-spacing:.04em;background:{view.scheme.week};color:{view.scheme.weekFg};
font-family:{view.font.heading};font-weight:{view.font.headingWeight}
```

Content: `v.{isoWeek}` (rendered as the pre-built `week.label`).

Day box (×7 per row):

```
position:relative;border-radius:16px;border:1.5px solid rgba(255,255,255,0.55);
min-height:0;padding:8px 10px;box-sizing:border-box;
display:flex;flex-direction:column;gap:4px;background:{cell.background}
```

Date `<span>`:

```
font-size:20px;line-height:1;color:{cell.foreground};
font-family:{view.font.heading};font-weight:{view.font.headingWeight}
```

Holiday `<span>`:

```
font-size:10px;font-weight:600;line-height:1.2;color:{cell.foreground}
```

The holiday `<span>` is rendered unconditionally (empty string when there is no holiday), as
in the prototype — the `gap:4px` and its zero height then produce the same layout as the
prototype in both cases.

**Task list** — the last child of the root, inside `{#if view.taskList}`. It is a 50 mm column
(the root's second grid track, §4.9) beside the day grid, taken out of the existing content
width; the page box, its padding and the photo layer are unchanged, so A3 scaling (§4.11) and
`PreviewStage.svelte` need nothing new. With `'left'` it is the leftmost thing on the page; the
week pills stay attached to the day grid.

List column `<div>`:

```
position:relative;{taskList.placement};display:grid;grid-template-rows:auto 1fr;gap:6px;
min-height:0;min-width:0
```

Its `auto 1fr` rows and `6px` gap mirror the day grid's first row and gap, so the list is top-
and bottom-aligned with the grid: the heading pill is level with the day-name pills and the
panel spans exactly the week rows.

Heading pill — the day-name pill's tokens, made a block so a long heading ellipsises instead of
widening the column:

```
display:block;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;
letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;
text-overflow:ellipsis;background:{view.scheme.day};color:{view.scheme.dayFg}
```

Content: `{taskList.title}`, by text interpolation only.

Panel — a current-month day box's tokens (border, radius, fill), split into 14 equal rows:

```
display:grid;grid-template-rows:repeat({taskList.rowBorders.length},1fr);min-height:0;padding:2px 12px;
box-sizing:border-box;border:1.5px solid rgba(255,255,255,0.55);border-radius:16px;
background:{taskList.background}
```

(`border` precedes `border-radius` here, the reverse of the day box, so the §5.5 day-box count
does not pick the panel up.)

Row (×14, one per `taskList.rowBorders` entry):

```
display:flex;align-items:center;gap:8px;min-height:0;border-top:{border}
```

Checkbox (one per row, empty):

```
width:12px;height:12px;flex:none;box-sizing:border-box;border:1.5px solid {taskList.line};
border-radius:3px
```

**`taskList: 'off'` and the pre-feature markup.** Every style attribute is byte-identical to
the pre-feature page when the list is off — the `layout` suffixes are `''`. The one byte-level
difference is unavoidable: Svelte 5's server renderer emits a hydration marker for every
`{#if}`, true or false, so the false branch leaves `' <!--[-1--><!--]-->'` (the whitespace
separator before the block, then an empty marker pair) before `</section>`. A space between
block-level siblings and an HTML comment produce no box, no layout and nothing printed, and
§5.5's snapshot assertion removes exactly that one occurrence before comparing against the
pre-feature snapshot.

### 5.3 `headingWeight` — the one deliberate deviation

The prototype hard-codes `font-weight:400` on the title and inherits `400` on week pills and
date numbers, while shipping Playfair Display only at 500, Fredoka only at 500 and Bricolage
Grotesque only at 600. CSS font matching resolves a 400 request to the nearest available
weight, so the prototype _renders_ correctly — but only by accident, and it is fragile under
self-hosted `@font-face` with a single weight per family. We therefore add `headingWeight` to
the `FontPairing` table and set it explicitly. Rendering is byte-identical; robustness is not.

### 5.4 Scheme and font tables (verbatim)

```ts
export const SCHEMES = [
	{
		id: 'organic',
		name: 'Organic',
		bg: '#f5ead8',
		text: '#2e2b25',
		title: '#2e2b25',
		titleBg: 'rgba(249,244,237,0.95)',
		day: '#8c491a',
		dayFg: '#fff2eb',
		week: '#56633f',
		weekFg: '#f0fae1',
		cell: '249,244,237',
		weekend: '238,231,219',
		other: '220,211,196',
		weekendFg: '#8c491a',
		otherFg: '#a19786',
		holiday: '#8c491a'
	},
	{
		id: 'skog',
		name: 'Skog',
		bg: '#e1eecc',
		text: '#272e1b',
		title: '#3d472b',
		titleBg: 'rgba(251,253,245,0.95)',
		day: '#3d472b',
		dayFg: '#f0fae1',
		week: '#728157',
		weekFg: '#f0fae1',
		cell: '251,253,245',
		weekend: '240,250,225',
		other: '214,227,191',
		weekendFg: '#56633f',
		otherFg: '#8fa073',
		holiday: '#56633f'
	},
	{
		id: 'neutral',
		name: 'Neutral',
		bg: '#eee7db',
		text: '#2e2b25',
		title: '#2e2b25',
		titleBg: 'rgba(249,244,237,0.95)',
		day: '#2e2b25',
		dayFg: '#f9f4ed',
		week: '#645c50',
		weekFg: '#f9f4ed',
		cell: '249,244,237',
		weekend: '238,231,219',
		other: '220,211,196',
		weekendFg: '#645c50',
		otherFg: '#a19786',
		holiday: '#474238'
	},
	{
		id: 'terrakotta',
		name: 'Terrakotta',
		bg: '#ffe1d0',
		text: '#402310',
		title: '#8c491a',
		titleBg: 'rgba(255,242,235,0.95)',
		day: '#b2622d',
		dayFg: '#fff2eb',
		week: '#8c491a',
		weekFg: '#fff2eb',
		cell: '255,242,235',
		weekend: '255,225,208',
		other: '240,206,184',
		weekendFg: '#8c491a',
		otherFg: '#c67139',
		holiday: '#8c491a'
	},
	{
		id: 'hav',
		name: 'Hav',
		bg: '#dfe8ee',
		text: '#1f2b36',
		title: '#2f4a60',
		titleBg: 'rgba(245,248,250,0.95)',
		day: '#2f4a60',
		dayFg: '#eef4f8',
		week: '#6c8ea3',
		weekFg: '#eef4f8',
		cell: '245,248,250',
		weekend: '230,238,244',
		other: '204,216,224',
		weekendFg: '#2f4a60',
		otherFg: '#8aa3b3',
		holiday: '#2f4a60'
	},
	{
		id: 'natt',
		name: 'Natt',
		bg: '#2e2b25',
		text: '#f9f4ed',
		title: '#f9f4ed',
		titleBg: 'rgba(71,66,56,0.92)',
		day: '#c67139',
		dayFg: '#fff2eb',
		week: '#8fa073',
		weekFg: '#272e1b',
		cell: '71,66,56',
		weekend: '86,79,68',
		other: '52,48,42',
		weekendFg: '#ffc6a5',
		otherFg: '#82796a',
		holiday: '#f6a06b'
	}
] as const satisfies readonly Scheme[];

export const FONTS = [
	{
		id: 'organic',
		name: 'Caprasimo + Figtree',
		heading: "'Caprasimo', serif",
		body: "'Figtree', sans-serif",
		headingWeight: 400,
		headingFamily: 'Caprasimo',
		bodyFamily: 'Figtree'
	},
	{
		id: 'klassisk',
		name: 'Playfair + Source Sans',
		heading: "'Playfair Display', serif",
		body: "'Source Sans 3', sans-serif",
		headingWeight: 500,
		headingFamily: 'Playfair Display',
		bodyFamily: 'Source Sans 3'
	},
	{
		id: 'lekfull',
		name: 'Fredoka + Nunito',
		heading: "'Fredoka', sans-serif",
		body: "'Nunito', sans-serif",
		headingWeight: 500,
		headingFamily: 'Fredoka',
		bodyFamily: 'Nunito'
	},
	{
		id: 'modern',
		name: 'Bricolage + Instrument',
		heading: "'Bricolage Grotesque', sans-serif",
		body: "'Instrument Sans', sans-serif",
		headingWeight: 600,
		headingFamily: 'Bricolage Grotesque',
		bodyFamily: 'Instrument Sans'
	}
] as const satisfies readonly FontPairing[];
```

### 5.5 Component tests (`CalendarPage.ssr.test.ts`)

Run in the vitest `server` project (`environment: 'node'`), using `render` from
`svelte/server`:

```ts
import { render } from 'svelte/server';
import CalendarPage from '$lib/components/CalendarPage.svelte';
const { body, head } = render(CalendarPage, { props: { options: FIXTURE } });
```

Assertions for `FIXTURE = { year:2026, month:8, schemeId:'organic', fontId:'organic',
opacity:88, showHolidays:true, title:'', imageZoom:1, imageX:50, imageY:50, paperSize:'A4' }`:

1. `head === ''` (no `<svelte:head>`; if this ever becomes non-empty the print template must
   start forwarding it — see §7.4).
2. **Primary style guard:** `readFileSync('src/lib/components/CalendarPage.svelte','utf8')`
   does **not** match `/<style[\s>]/`. Secondary: `body` does not contain `class="svelte-`
   (rule §2.5.1 — the secondary check alone misses a `:global` style block).
3. `body` sizes the layout page at exactly `width:297mm;height:210mm`. Rendering the same
   options with `paperSize:'A3'` produces a `body` byte-identical to `paperSize:'A4'`:
   `CalendarPage.svelte` never reads `options.paperSize` (§2.5.3, §4.11).
4. `body` contains `>September 2026<` (the resolved title).
5. `body` contains all seven day names `Måndag`…`Söndag`.
6. `body` contains `v.36`, `v.37`, `v.38`, `v.39`, `v.40` and does **not** contain `v.41`.
7. `body` contains `grid-template-rows:auto repeat(5,1fr)`.
8. `body` contains `rgba(220,211,196,0.704)` (the 31 Aug other-month cell).
9. `body` contains `background-image:none`.
10. Counting `border-radius:16px;border:1.5px solid rgba(255,255,255,0.55)` yields 35 day boxes.
11. With `{...FIXTURE, month:5}` (June 2026): `body` contains `Midsommarafton` and
    `Midsommardagen`; with `showHolidays:false` it contains neither.
12. With `{...FIXTURE, month:7}` (Aug 2026): `grid-template-rows:auto repeat(6,1fr)`, 42 boxes.
    12b. With `{...FIXTURE, year:2027, month:1}` (Feb 2027, the clamped case):
    `grid-template-rows:auto repeat(5,1fr)`, 35 boxes, and the trailing row's seven cells all
    carry the other-month fill `rgba(220,211,196,0.704)`.
13. With `{...FIXTURE, title:'Vår trädgård'}`: `body` contains `>Vår trädgård<`.
14. With `{...FIXTURE, schemeId:'natt'}`: `body` contains `background:#2e2b25`.
15. With `imageCss: 'var(--calgen-bg)'`: `body` contains `background-image:var(--calgen-bg)`.
16. An inline snapshot of the full `body` for `FIXTURE` (`toMatchInlineSnapshot`) as a
    regression net for accidental style edits.
17. At the default transform, `body` contains
    `left:0%;top:0%;width:100%;height:100%;background-size:cover;background-position:50% 50%`.
18. With `{...FIXTURE, imageZoom:2, imageX:25}`, `body` contains
    `left:-25%;top:-50%;width:200%;height:200%;background-size:cover;background-position:25% 50%`.
19. With `{...FIXTURE, imageZoom:4, imageX:0, imageY:100}`, `body` contains
    `left:0%;top:-300%;width:400%;height:400%;background-size:cover;background-position:0% 100%`.
20. With `{...FIXTURE, imageZoom:1.37, imageX:33, imageY:66}`, `body` contains `left:-12.21%`
    and does **not** contain `String((1 - 1.37) * 33)` — compute the unrounded literal in the test rather than hard-coding it, so the assertion cannot drift from the platform's float result (the §4.7 rounding, end to end).
21. The background layer carries no `transform` (rule §5.2). Capture it — the first and only
    style attribute starting `position:absolute` — with `/<div style="(position:absolute[^"]*)"/`
    and assert the captured declaration list does not include `transform`. A blanket
    `expect(body).not.toContain('transform')` would be wrong: the week pills legitimately carry
    `transform:rotate(180deg)`. Assert separately that the root `<section>` still contains
    `overflow:hidden`, which is what clips the layer at `z > 1`.
22. The transform is a property of the layer, not of the photo: assertions 17–20 hold with the
    default `imageCss` (`none`) as well as with `imageCss: 'var(--calgen-bg)'`.
23. `FIXTURE` gains `taskList:'off', taskListTitle:''`. Its `body` contains the empty-`{#if}`
    marker exactly once, and with that one occurrence removed it equals the pre-feature
    snapshot unchanged (§5.2). It does not contain `Att göra`.
24. With `taskList:'right'`: the root `<section>` style ends `;grid-template-columns:1fr 50mm`;
    the header carries `;grid-column:1/-1`; the day grid carries
    `;grid-row:2;grid-column:1;min-width:0`; `body` contains `grid-row:2;grid-column:2`,
    `>Att göra<`, `grid-template-rows:repeat(14,1fr)`, the panel fill
    `background:rgba(249,244,237,0.88)` after the panel border, 14 checkboxes (counting
    `border-radius:3px`), 13 `border-top:1px solid #a19786` and one `border-top:none`; 35
    day boxes still. The list markup comes after the day grid in source order.
25. With `taskList:'left'`: `;grid-template-columns:50mm 1fr`, the day grid carries
    `;grid-row:2;grid-column:2;min-width:0`, the list `grid-row:2;grid-column:1`.
26. With `taskList:'right', taskListTitle:'<b>Inköp</b>'`: `body` contains the escaped
    `&lt;b>Inköp&lt;/b>` and no `<b>`.
27. Snapshots of the full `body` for `{...FIXTURE, taskList:'left'}` and `'right'`.

---

## 6. App UI

### 6.1 Shell

`src/routes/+page.svelte`. CSS grid, `grid-template-columns: 340px 1fr`,
`grid-template-rows: 64px 1fr`, `height: 100vh`, `min-height: 0`.

### 6.2 Top bar (`TopBar.svelte`)

`grid-column:1/-1; display:flex; align-items:center; justify-content:space-between;
padding:0 28px; border-bottom:1.5px solid #dcd3c4; background:#f5ead8`

Left: 28 px circle `border-radius:999px; background:#c67139` + wordmark
`font-family:'Caprasimo',serif; font-size:22px; color:#201e1d` reading `CalGen`.

Right: a flex row, `gap:10px`, with **two buttons** (decision — see below):

1. Secondary, outlined: `Exportera hela året` —
   `padding:12px 20px;border-radius:999px;border:1.5px solid #c67139;background:#fff2eb;
color:#8c491a;font:600 15px 'Figtree',sans-serif` · hover `background:#ffe1d0`.
2. Primary, filled: `Exportera PDF` —
   `padding:12px 22px;border-radius:999px;border:0;background:#c67139;color:#fff2eb;
font:600 15px 'Figtree',sans-serif` · hover `background:#b2622d`.

**Decision: two buttons, not a dropdown.** A dropdown needs a menu component, focus trapping,
Escape/arrow-key handling and outside-click dismissal — real code and real a11y surface for
two options. Two buttons is one line of markup with correct keyboard behaviour for free. This
is a small addition to the README's single-button top bar; flagged in §14.4.

Loading state: while an export is in flight, both buttons get `disabled`, `cursor:progress`,
`opacity:.7`, and the pressed button's label becomes `Exporterar…` / `Exporterar året…`.
`aria-busy="true"` on the button. Concurrent exports are prevented by the disabled state.

### 6.3 Sidebar (`Sidebar.svelte`)

`display:flex;flex-direction:column;gap:22px;padding:24px 24px 32px;overflow:auto;
background:#f5ead8;border-right:1.5px solid #dcd3c4`

Section heading (`<h2>`): `margin:0;font-family:'Caprasimo',serif;font-size:17px;color:#201e1d`.
Every text/number/select input: `height:44px;padding:0 14px;border-radius:999px;
border:1.5px solid #c0b6a5;background:#f9f4ed;font:15px 'Figtree',sans-serif;color:#201e1d;
box-sizing:border-box`. Global focus rule in `app.css`:
`input:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid #c67139;outline-offset:2px}`.
The file input inside the **Bakgrundsbild** label is the one control that rule cannot reach on
its own, so the label carries `.file-pill:has(input:focus-visible){outline:2px solid #c67139;
outline-offset:2px}`. Do **not** use `label:focus-within` for this: `:focus-within` has no
keyboard heuristic and would paint an outline on the checkbox and slider labels on every mouse
click.

**Månad** — `<div style="display:grid;grid-template-columns:1fr 110px;gap:8px">` containing
the month `<select>` (12 `MONTHS` options, `value` = index) and a
`<input type="number" min="2000" max="2100">` for the year. Below: the title
`<input type="text">` with `placeholder={defaultTitle(year, month)}`. Below: a checkbox row
`display:flex;align-items:center;gap:10px;font-size:14px;color:#474238;cursor:pointer`
with an `<input type="checkbox" style="width:18px;height:18px;accent-color:#c67139">` labelled
`Visa svenska helgdagar`.

Year input is clamped on `change`: `Math.min(2100, Math.max(2000, Number(value) || 2026))`.
The clamped value MUST also be assigned back to `input.value`. Svelte patches the DOM only when
the bound value changes, so a clamp that lands on the year already in state (clearing the field,
or re-entering 2200) would leave the rejected text on screen while the preview shows something
else.

Under the title input, a hint in `font-size:12px;color:#645c50`:
`Egen rubrik används inte vid årsexport.` (shown only when `title.trim() !== ''`).

**Bakgrundsbild** — a `<div>` (`display:flex;gap:8px;align-items:stretch`) holding the file pill
and, once an image is set, the removal button next to it.

The file pill is a `<label>` styled as an outlined pill
(`display:flex;align-items:center;justify-content:center;height:44px;flex:1;min-width:0;
border-radius:999px;border:1.5px solid #c67139;color:#8c491a;font:600 15px 'Figtree',sans-serif;
cursor:pointer;background:#fff2eb`, hover `#ffe1d0`) reading `Välj bild…` / `Byt bild`, wrapping a
`<input type="file" accept="image/jpeg,image/png,image/webp">` that is **visually hidden but
still focusable** (`position:absolute;width:1px;height:1px;opacity:0;pointer-events:none` on a
`position:relative` label). `display:none` removes the input from the tab order entirely, which
makes "Välj bild…" impossible to operate by keyboard. `flex:1;min-width:0` is what keeps the pill
filling the row both with and without the removal button beside it.

Two controls share one secondary-pill token, `pill-secondary`
(`display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 16px;
border-radius:999px;border:1.5px solid #dcd3c4;background:#fbf7f1;color:#645c50;
font:600 13px 'Figtree',sans-serif;cursor:pointer;white-space:nowrap`; hover, when not disabled,
`border-color:#c67139;color:#8c491a;background:#fff2eb`; disabled `opacity:.45;cursor:default`,
with no hover change). Its focus ring is the pre-existing global `button:focus-visible` rule in
`src/app.css`, not a rule of its own.

When an image is set, `Ta bort bild` sits beside the file pill using the _pill-secondary_ token
above, with `height` overridden to `auto` so the row's `align-items:stretch` grows it to the
file pill's 44px:

```
<button type="button" style="{pill-secondary};height:auto">Ta bort bild</button>
```

**Only when an image is set**, the zoom control follows it — the same slider token as the
coverage slider below, plus a reset:

```
<label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:#645c50">
  <span>Zooma: {Math.round(imageZoom * 100)} %</span>
  <input type="range" min="100" max="400" step="1" style="accent-color:#c67139">
</label>
<p style="margin:0;font-size:12px;color:#645c50">Dra i förhandsvisningen för att flytta bilden.</p>
<button type="button" style="{pill-secondary};width:100%">Återställ bildens läge</button>
```

The slider's DOM value is **percent** (an integer 100–400, so the native keyboard step is a
sane 1 %); state holds the ratio. Read `imageZoom = Number(input.value) / 100`, write
`value={Math.round(imageZoom * 100)}`. `min`/`max` mirror the §3.3 range, so the API never
sees an out-of-range zoom from this control — the UI clamps, the API rejects (§3.3).

`Återställ bildens läge` sets `imageZoom = 1`, `imageX = 50`, `imageY = 50` and nothing else;
it does not touch the photo, the coverage or any other setting. It is disabled (`disabled`)
at the default transform, taking the _pill-secondary_ disabled state above, so it never reads
as a control that does nothing.

Then the coverage slider, unchanged and always shown:

```
<label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:#645c50">
  <span>Rutornas täckning: {opacity} %</span>
  <input type="range" min="30" max="100" step="2" style="accent-color:#c67139">
</label>
```

Client-side file validation before accepting: type ∈ {jpeg,png,webp} and
`size ≤ maxUploadBytes`. That number reaches the client from
`src/routes/+layout.server.ts`:

```ts
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = () => ({ maxUploadBytes: cfg.maxUploadBytes });
```

consumed in `+layout.svelte` / `+page.svelte` as `data.maxUploadBytes` (typed via
`./$types`). No `PUBLIC_*` env var — one fewer thing to keep in sync. On rejection show the
Swedish toast and do not set the image.

Props, beyond `app` and `maxUploadBytes`: `onReject: (message: string) => void`, called with
the Swedish message when a chosen file is rejected, and `onImage?: () => void`, called once
immediately after a successful `setImage`. `onImage` is optional so the sidebar stands alone in
a test; `+page.svelte` passes `onImage={() => void measureImage(state)}`, which is what starts
the measurement described in §6.5. The sidebar itself never measures: `measureImage` is
asynchronous and the sidebar has nothing to do with the result.

**Färgskala** — `display:grid;grid-template-columns:1fr 1fr;gap:8px`; per scheme a button
`display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:999px;cursor:pointer;
background:#f9f4ed;font:600 13px 'Figtree',sans-serif;color:#201e1d;border:2px solid {sel ? '#c67139' : '#dcd3c4'}`
containing a `<span style="display:flex">` of three 16 px dots
(`width:16px;height:16px;border-radius:999px`) coloured `scheme.bg`, `scheme.day`,
`scheme.week`, the 2nd and 3rd with `margin-left:-6px`, then the scheme name.
(The prototype's `gap:-4px` on that span is invalid CSS and is dropped — the overlap comes
from the negative margins.)
`aria-pressed={selected}` on each button.

**Typsnitt** — `display:flex;flex-direction:column;gap:8px`; per pairing a button
`display:flex;align-items:baseline;justify-content:space-between;padding:10px 16px;
border-radius:16px;cursor:pointer;background:#f9f4ed;color:#201e1d;text-align:left;
border:2px solid {sel ? '#c67139' : '#dcd3c4'}` containing
`<span style="font-size:20px;line-height:1;font-family:{f.heading};font-weight:{f.headingWeight}">Aa</span>`
and `<span style="font-size:13px;color:#645c50;font-family:{f.body}">{f.name}</span>`.
`aria-pressed={selected}`.

**Att göra-lista** — placed after **Typsnitt**, before **Pappersstorlek**:

```
<section>
  <h2>Att göra-lista</h2>
  <div class="task-list-options">
    {#each TASK_LIST_CHOICES as choice (choice.id)}
      <button type="button" class="paper" aria-pressed={app.taskList === choice.id}
              style="border-color:{border(app.taskList === choice.id)}"
              onclick={() => (app.taskList = choice.id)}>
        <span>{choice.name}</span>
      </button>
    {/each}
  </div>
  {#if app.taskList !== 'off'}
    <input type="text" aria-label="Rubrik" placeholder={DEFAULT_TASK_LIST_TITLE}
           maxlength={MAX_TASK_LIST_TITLE_LENGTH} bind:value={app.taskListTitle} />
  {/if}
</section>
```

`TASK_LIST_CHOICES` is `off` → `Av`, `left` → `Vänster`, `right` → `Höger`, in that order.
`.task-list-options` is `display:grid;grid-template-columns:repeat(3,1fr);gap:8px`; the buttons
reuse the **Pappersstorlek** `.paper` token, `aria-pressed` and `border()` helper exactly. The
heading input is the shared text-input token, labelled `Rubrik` via `aria-label` like the title
input, with `maxlength` 20 (`MAX_TASK_LIST_TITLE_LENGTH` from `options.ts`, the same constant
the API checks, §3.3). It is shown only while the list is on; `taskListTitle` is kept in state
while it is hidden, so turning the list off and on again restores the heading.

**Pappersstorlek** — the last section, placed after **Typsnitt** and **Att göra-lista** because
it is the only control that does not change the preview (§6.4):

```
<section>
  <h2>Pappersstorlek</h2>
  <div class="paper-list">
    {#each PAPER_SIZES as paper (paper.id)}
      <button type="button" class="paper" aria-pressed={app.paperSize === paper.id}
              style="border-color:{border(app.paperSize === paper.id)}"
              onclick={() => (app.paperSize = paper.id)}>
        <span>{paper.name}</span>
      </button>
    {/each}
  </div>
  <p class="hint">Samma layout i båda storlekarna — A3 skalas proportionellt.</p>
</section>
```

`.paper-list` reuses the **Färgskala** grid's tokens (`display:grid;
grid-template-columns:1fr 1fr;gap:8px`); `.paper` reuses the **Typsnitt** button's
(`border:2px solid`, `border-radius:16px`, `background:#f9f4ed`). Each button shows only
`paper.name` — no dimension copy (product-owner decision, §14.4). `aria-pressed` and the shared
`border()` helper match the scheme and font groups exactly. Focus ring: the pre-existing global
`button:focus-visible` rule in `app.css`, like every other button in the sidebar.

### 6.4 Preview stage (`PreviewStage.svelte`)

```
<main style="position:relative;display:flex;align-items:center;justify-content:center;
             padding:32px;overflow:hidden;min-height:0;background:#eee7db">
  <div bind:this={frame} style="position:relative;width:100%;height:100%">
    <div style="position:absolute;left:50%;top:50%;
                transform:translate(-50%,-50%) scale({scale});
                border-radius:8px;overflow:hidden;
                box-shadow:0 10px 30px rgba(32,30,29,0.14)">
      <CalendarPage {options} {imageCss} />
      <!-- only when a photo is set: the pan/zoom surface, §6.4.1 -->
    </div>
  </div>
</main>
```

Scale formula (the prototype's, kept exactly):

```ts
const MM = 96 / 25.4; // 3.779527559…
scale = Math.min(frame.clientWidth / (297 * MM), frame.clientHeight / (210 * MM));
```

(= `min(w / 1122.52, h / 793.70)`. The README's rounded 1122/794 is the same number to three
significant figures; use the mm-derived form.)

The fit formula stays A4-derived for both paper sizes. A4 is 297:210 = 1.414286:1, A3 is
420:297 = 1.414141:1 — 0.010 % apart, under one device pixel at any realistic preview size.
`PreviewStage.svelte` does not change for A3 (§4.11): the preview always shows the 297 × 210 mm
layout page, and a hint next to the paper-size control (§6.3) explains that the preview does
not change.

Recomputed by a `ResizeObserver` on `frame` inside `$effect`, plus one deferred recompute
(`setTimeout(…, 300)`) after mount so web-font loading cannot leave a stale scale. The
observer and the effect live in `PreviewStage.svelte`, never in `CalendarPage.svelte`.

The stage is `overflow:hidden`; the page is never larger than the frame because `scale ≤ 1`
is not enforced — at very large viewports `scale > 1` is allowed, matching the prototype.

#### 6.4.1 Pan and zoom surface

Two extra props, both optional so the component is still usable with no photo:

```ts
interface Props {
	options: CalendarOptions;
	imageCss: string;
	children?: Snippet;
	/** Natural pixel size of the background photo; null when there is none, or not measured yet. */
	imageSize?: { width: number; height: number } | null;
	/** New, already-clamped transform. Called on drag, wheel and arrow keys. */
	onTransform?: (t: { imageZoom: number; imageX: number; imageY: number }) => void;
}
```

The surface is rendered **only** when `imageSize` and `onTransform` are both supplied, as the
last child of the scaled `.page` element (so it inherits the same `scale` and the same clip):

```
position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:none;
cursor:{dragging ? 'grabbing' : 'grab'};touch-action:none;border-radius:8px;outline-offset:-3px
```

It is a real `<button type="button">`, not a `<div>`, and it carries
`aria-label="Flytta bakgrundsbilden. Dra med musen eller använd piltangenterna."`. Three
reasons, in order of weight:

1. **Keyboard.** A drag-only affordance is unreachable without a pointer. A button is focusable
   for free, and `ArrowLeft/Right/Up/Down` then move the photo (see below).
2. **Correct a11y semantics without lying.** Svelte's compiler classifies `role="application"`
   as non-interactive (its `aria-query` superclass is `structure`, not `widget`), so a
   `<div role="application">` with `onpointerdown`/`onkeydown` still trips
   `a11y_no_static_element_interactions` / `a11y_no_noninteractive_element_interactions`. A
   `<button>` trips neither, and it is the honest element: a control the user operates.
3. **Focus ring for free** from the global `button:focus-visible` rule in `app.css` — with
   `outline-offset:-3px` and `border-radius:8px` (matching the `.page` clip, so the ring is not cut at the corners), because the `.page` wrapper is `overflow:hidden` and would clip an
   outset ring.

It carries no `onclick`, so there is nothing for Enter/Space to activate and no
`a11y_click_events_have_key_events` warning.

Interaction, all of it delegating the arithmetic to §6.9:

- **Drag.** `onpointerdown`: record the pointer position, `setPointerCapture(event.pointerId)`,
  set `dragging = true`. `onpointermove` while dragging: convert the screen delta to page space
  by dividing by `scale` — `PreviewStage` already owns `scale`, which is exactly why the surface
  lives here — feed it to `panBy`, and emit the result. `onpointerup` / `onpointercancel`:
  `dragging = false`. Pointer capture keeps the drag alive when the pointer leaves the page
  rectangle, which happens constantly at high zoom.
- **One pointer, primary button.** `onpointerdown` ignores anything but `event.button === 0`, so
  a right- or middle-button drag is left to the browser. The `pointerId` that started the drag is
  recorded, and `onpointermove` / `onpointerup` / `onpointercancel` ignore every other one: a
  second finger reports its own moves through the same handler, and following both makes the
  photo jitter between two positions.
- **`onlostpointercapture`** ends the drag as well. Capture can be lost without a `pointerup` —
  the element is removed, or the browser takes over the gesture — and `dragging` would otherwise
  stick, leaving a `grabbing` cursor and a photo that follows the pointer with no button held.
- **Wheel.** `onwheel`: `preventDefault()`, then `zoomBy(transform, event.deltaY)`. Wheel up
  (negative `deltaY`) zooms in. `imageX`/`imageY` are passed through unchanged — deliberately
  **not** zoom-about-cursor, which would need a second reference frame and a second set of
  tests to buy a nicety the sidebar slider already covers. `preventDefault` costs nothing here:
  the shell is `height:100vh` and the stage is `overflow:hidden`, so there is no scrolling
  behind the preview to suppress.
- **Ctrl/Cmd + wheel is not ours.** When `event.ctrlKey || event.metaKey` is set the handler
  returns immediately — no `preventDefault`, no `zoomBy`. That combination is the browser's own
  page-zoom gesture (and what a trackpad pinch reports as), and swallowing it would take page
  zoom away from exactly the users who depend on it.
- **Keyboard.** `onkeydown`: the four arrows call `nudge` for 1 percentage point, 10 with
  `Shift`; `preventDefault()` on those four keys only, so Tab and everything else still work.
- **Locked axes.** When the photo does not overflow the page on an axis, §6.9 returns that
  axis unchanged. No special-casing in the component.

`CalendarPage.svelte` gets **no** event handlers, no wrapper and no extra prop from any of
this. It stays props-in / HTML-out and SSR-clean (§2.5.2); the interaction is entirely the
app's, exactly as `scale` already is.

### 6.5 Client state

`src/lib/client/app-state.svelte.ts`

```ts
export interface AppState extends CalendarOptions {
	/** The selected File, kept for upload. */
	imageFile: File | null;
	/** Object URL for the preview; revoked on replace/clear. */
	imageUrl: string | null;
	/** Natural pixel size of the photo, once measured. Client-only — never sent. */
	imageSize: { width: number; height: number } | null;
	exporting: null | 'month' | 'year';
	toast: { kind: 'error' | 'info'; text: string } | null;
}
export function createAppState(): AppState; // a $state(...) object

/** Loads a URL and reports the decoded pixel size. Injected so the module is testable. */
export type ImageMeasurer = (url: string) => Promise<{ width: number; height: number }>;
export function measureImage(state: AppState, measure?: ImageMeasurer): Promise<void>;
/** Restores imageZoom 1 / imageX 50 / imageY 50. */
export function resetImageTransform(state: AppState): void;
```

`imageSize` is the photo's `naturalWidth`/`naturalHeight`. It is needed to know how far the
photo overflows the page (§6.9) and for nothing else, so it stays client-side: it is **not**
part of `CalendarOptions`, is never sent to the server, and never appears in `toOptions`. The
server does not need it — that is the point of the §4.9 geometry.

`setImage` MUST, in addition to what it already does, clear `imageSize` and call
`resetImageTransform`; `clearImage` MUST do the same. A transform is meaningful only against
the photo it was chosen for: carrying a 4× zoom on the left edge over to a different photo
shows the user a crop they never picked. Between `setImage` and the resolution of
`measureImage`, `imageSize` is `null`, the preview surface is not rendered and dragging is
simply not offered — the preview itself is already correct, because the geometry is at its
default.

`measureImage` is started from `Sidebar`'s `onImage` callback (§6.3), which fires once after a
successful `setImage`; `+page.svelte` wires it as `onImage={() => void measureImage(state)}`.
Both of its outcomes are discarded when `state.imageUrl` no longer equals the URL that was
measured — the user replaced or removed the photo mid-flight — so a stale size never describes
the wrong photo and a stale failure never toasts about the new one. A measurement with a zero
width or height is discarded as well: `coverSize` (§6.9) would divide by it, and `NaN` would
leak into `imageX`/`imageY`. `imageSize` then simply stays `null`, which the UI already handles
by not offering the drag surface.

The default measurer creates an `Image`, sets `src` to the object URL and resolves on `load`
(rejecting on `error`, which surfaces as a toast). It is a parameter, not an import, so
`app-state.test.ts` can run in the `server` vitest project with no DOM — the same pattern as
`fetchImpl` in §6.6.

`imageUrl` MUST be created with `URL.createObjectURL` and revoked with `URL.revokeObjectURL`
when replaced or cleared, and on page unload. (The prototype used a `FileReader` data URL;
object URLs avoid holding a 27 MB base64 string in memory for the preview.)

Derived in `+page.svelte`: `const options = $derived({ year, month, schemeId, fontId, opacity,
showHolidays, title, imageZoom, imageX, imageY, paperSize, taskList, taskListTitle })` (i.e.
`toOptions(state)`) and
`const imageCss = $derived(imageCssOf(state.imageUrl))`. `+page.svelte` passes
`imageSize={state.imageSize}` and an `onTransform` that writes the three fields back onto the
state object — three assignments, no intermediate store.

### 6.6 Export client (`src/lib/client/export.ts`)

```ts
export async function exportPdf(
	opts: CalendarOptions,
	scope: ExportScope,
	image: File | null,
	fetchImpl: typeof fetch = fetch
): Promise<{ blob: Blob; filename: string }>;
```

- Builds `FormData`: `options` = `JSON.stringify({ ...opts, scope })`; `image` = the `File`
  when present.
- `POST /api/pdf`.
- On non-2xx: parse `{error}` JSON and throw an `ExportError { code }`. When the body is
  **not** JSON — which happens when adapter-node rejects an oversized body before our handler
  runs, and SvelteKit serves its own HTML error page — fall back on the status code:
  `413 → image_too_large`, `415 → unsupported_image_type`, anything else → `internal_error`.
  Without this fallback an over-limit upload surfaces as the generic "Något gick fel" toast
  instead of telling the user the image is too big.
- On 2xx: read `blob()`, take the filename from `Content-Disposition` when parseable,
  otherwise compute it with `pdfFilename`.
- The caller creates an object URL, clicks a synthetic `<a download>`, then revokes.

`fetchImpl` is a parameter so the module is unit-testable with a fake — no DI container.

Swedish toast map (`src/lib/client/errors.ts`):

| code                        | Swedish message                                         |
| --------------------------- | ------------------------------------------------------- |
| `image_too_large`           | `Bilden är för stor. Max 20 MB.`                        |
| `unsupported_image_type`    | `Bildformatet stöds inte. Använd JPEG, PNG eller WebP.` |
| `renderer_busy`             | `Servern är upptagen. Försök igen om en stund.`         |
| `render_timeout`            | `Exporten tog för lång tid. Försök igen.`               |
| `renderer_unavailable`      | `PDF-tjänsten är inte tillgänglig just nu.`             |
| any `invalid_*`             | `Ogiltiga inställningar. Kontrollera år och månad.`     |
| `network` (thrown by fetch) | `Kunde inte nå servern. Kontrollera din anslutning.`    |
| default                     | `Något gick fel. Försök igen.`                          |

### 6.7 Toast (`Toast.svelte`)

Bottom-centre of the stage, `position:absolute;bottom:24px;left:50%;transform:translateX(-50%)`,
`padding:12px 20px;border-radius:999px;background:#474238;color:#f9f4ed;
font:600 14px 'Figtree',sans-serif;box-shadow:0 10px 30px rgba(32,30,29,.24)`,
`role="status" aria-live="polite"`. Auto-dismiss after 6 s; dismissible by click.

### 6.8 Behaviour

- Every control updates the preview synchronously — no debouncing, no async work.
- Changing year or month re-derives grid, week numbers and holidays via `$derived`.
- The title input's placeholder always shows the current default title.
- The year export ignores the custom title (§14.3).
- Dragging, wheeling or arrowing on the preview updates `imageZoom`/`imageX`/`imageY` on the
  same synchronous `$state → $derived → CalendarPage` path as every other control, so the day
  boxes, week pills and dates re-render over the moved photo immediately, at the position they
  will occupy in the PDF.
- The exported PDF matches the preview because both sides render the identical style string
  from the identical three numbers (§4.9): there is no separate export-time transform, and no
  device-pixel or aspect-ratio input to disagree about.
- Choosing or removing a photo resets the transform to `1 / 50 / 50` (§6.5).

### 6.9 Pan and zoom math (`src/lib/client/image-transform.ts`)

Dependency-free and pure: no DOM, no Svelte, no imports outside the module. It runs in the
`server` vitest project like any other unit (§12.1), which is the whole reason the arithmetic
does not live inside `PreviewStage.svelte`.

```ts
/** The printed page, in CSS pixels at 96 dpi: 297 × 210 mm. */
export const PAGE_WIDTH_PX: number; // 297 * 96 / 25.4 = 1122.519685…
export const PAGE_HEIGHT_PX: number; // 210 * 96 / 25.4 =  793.700787…
// These describe the layout page and are independent of paperSize; the A3 scale is applied
// outside the document (§4.11, §7.5), not in this module.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export interface ImageSize {
	width: number;
	height: number;
}
export interface Transform {
	imageZoom: number;
	imageX: number;
	imageY: number;
}

/** Size the photo is rendered at by `cover` on the page, before zoom. */
export function coverSize(image: ImageSize): { width: number; height: number };
/** How far the photo overruns the page on each axis at this zoom. Never negative. */
export function overflow(image: ImageSize, zoom: number): { x: number; y: number };
/** New transform after dragging by (dx, dy) **page** pixels. Axes without overflow are fixed. */
export function panBy(t: Transform, image: ImageSize, dx: number, dy: number): Transform;
/** New transform after moving the focal point by whole percentage points (arrow keys). */
export function nudge(
	t: Transform,
	image: ImageSize,
	dxPercent: number,
	dyPercent: number
): Transform;
/** New transform after a wheel tick. `deltaY < 0` (wheel up) zooms in. */
export function zoomBy(t: Transform, deltaY: number): Transform;
/** Clamps a zoom into [MIN_ZOOM, MAX_ZOOM]; NaN returns MIN_ZOOM, ±Infinity clamps into the range. */
export function clampZoom(zoom: number): number;
```

`coverSize` is `max(W/nw, H/nh)` applied to both natural dimensions — i.e.
`width = max(W, H · nw/nh)`, `height = max(H, W · nh/nw)` — and `overflow` is
`max(0, zoom · coverSize − page)` per axis.

`panBy` inverts the §4.9 geometry. The photo's left edge sits at `imageX/100 · (W − zoom·C)`,
so moving the photo right by `dx` page pixels means

```
imageX ← clamp(imageX - 100 * dx / overflow.x, 0, 100)      when overflow.x > 0
imageX ← imageX                                             when overflow.x === 0
```

and the same for `imageY`/`dy`. The minus sign is the whole point of direct manipulation: the
photo follows the pointer, so the _focal point_ moves the opposite way. An axis with no
overflow has nothing to reveal, so it is returned untouched rather than clamped to an edge.

`nudge` is the keyboard sibling of `panBy` and shares its clamping and its axis lock, but takes
percentage points directly instead of pixels: `ArrowRight` should always move the focal point
the same visible amount regardless of how far the photo overflows. Its sign convention is the
focal point's, not the drag's — `ArrowRight` means "focus further right", i.e. `+1`.

`zoomBy` uses a multiplicative step, `zoom * (deltaY < 0 ? 1.1 : 1/1.1)`, clamped — a fixed
additive step feels coarse near 1× and glacial near 4×. `deltaY === 0` returns the transform
unchanged. Only the sign of `deltaY` is read, never its magnitude: `deltaMode` differs between
mouse wheels, trackpads and browsers, and one notch must mean one step everywhere.

Nothing in this module knows about `scale`, elements or events; `PreviewStage` divides the
screen delta by `scale` before calling `panBy`, and decides which wheel events reach `zoomBy` at
all — a Ctrl/Cmd-modified wheel is the browser's page zoom and is never forwarded (§6.4.1).

**Tests** (`image-transform.test.ts`), with `W ≈ 1122.52`, `H ≈ 793.70`:

1. `coverSize({width:1000,height:1000})` (square, page is landscape) → width and height both
   `≈ 1122.52`: the width is the binding dimension and the height overruns.
2. `coverSize({width:4000,height:3000})`: 4:3 is 1.333, narrower than the page's 1.414, so
   `cover` binds on **width** — width `≈ 1122.52`, height `≈ 841.89`. And
   `coverSize({width:4000,height:2000})`: 2:1 is wider than the page, so it binds on
   **height** — height `≈ 793.70`, width `≈ 1587.40`. In both, and as a property over a
   handful of aspect ratios, the box covers the page: `width ≥ W` and `height ≥ H`.
3. A photo of exactly 297:210 → `coverSize` equals the page and `overflow(…, 1)` is `{x:0,y:0}`
   on both axes.
4. `overflow` scales linearly in zoom: `overflow(img, 2).x === 2 * coverWidth - W`.
5. `panBy` with `overflow.x === 0` returns `imageX` unchanged, whatever `dx` is.
6. `panBy` moves the focal point against the drag: dragging right (`dx > 0`) decreases
   `imageX`; dragging down decreases `imageY`.
7. `panBy` clamps: from `imageX: 0`, a large positive `dx` leaves `imageX` at `0`, never
   negative; from `100`, a large negative `dx` leaves it at `100`.
8. `panBy` is exactly invertible within the clamped range: `panBy(panBy(t, img, 40, 25), img,
-40, -25)` returns the original values (within 1e-9).
9. `panBy` is calibrated in **page pixels**, not percent and not screen pixels: take
   `dx = overflow(image, zoom).x / 10` and assert `imageX` moves by exactly 10 points. This is
   the assertion that catches a caller which forgets to divide the screen delta by `scale`
   only if it is read together with the `PreviewStage` wiring — so state the unit in the
   JSDoc of `panBy` as well.
10. `zoomBy` with `deltaY < 0` increases the zoom; with `deltaY > 0` decreases it; with
    `deltaY === 0` returns it unchanged.
11. `zoomBy` reads only the sign: `deltaY: -1` and `deltaY: -240` give the same result.
12. `zoomBy` clamps at both ends — from `4`, zooming in stays `4`; from `1`, out stays `1` —
    and repeated calls never leave `[1, 4]`.
13. `zoomBy` never changes `imageX`/`imageY`.
14. `clampZoom(NaN) === 1`, `clampZoom(Infinity) === 4`, `clampZoom(0.5) === 1`,
    `clampZoom(2.5) === 2.5`.
15. `PAGE_WIDTH_PX` and `PAGE_HEIGHT_PX` equal `297 * 96 / 25.4` and `210 * 96 / 25.4`, the same
    mm-derived form `PreviewStage`'s scale formula uses (§6.4).
16. `nudge(t, image, 1, 0)` adds exactly 1 to `imageX` on an axis that overflows, whatever the
    zoom — unlike `panBy`, the step does not depend on the overflow.
17. `nudge` clamps to `[0, 100]` and leaves a non-overflowing axis alone, like `panBy`.
18. `nudge` and `panBy` agree on direction as the user experiences it: `nudge(t, image, +1, 0)`
    and a leftward drag (`panBy(t, image, -dx, 0)`, `dx > 0`) both increase `imageX`.

---

## 7. PDF service

### 7.1 Interfaces (`src/lib/server/pdf/types.ts`)

Deliberately the smallest surface that covers the job — one `setContent`, one request
interceptor, one `pdf`, one `close`. A fake implementation is ~25 lines.

```ts
export interface InterceptedRequest {
	url(): string;
	respond(response: { status: number; contentType: string; body: Uint8Array }): Promise<void>;
	abort(): Promise<void>;
}
export interface PageLike {
	// `'networkidle0'`/`'networkidle2'` are excluded because puppeteer-core 25's
	// `SetContentWaitForOptions` itself excludes them; nothing here passes them anyway.
	setContent(html: string, options?: { waitUntil?: 'load'; timeout?: number }): Promise<void>;
	setRequestInterception(enabled: boolean): Promise<void>;
	on(event: 'request', handler: (request: InterceptedRequest) => void): unknown;
	pdf(options: PdfOptions): Promise<Uint8Array>;
	close(): Promise<void>;
}
export interface BrowserLike {
	newPage(): Promise<PageLike>;
	close(): Promise<void>;
	connected?: boolean;
}
export type BrowserFactory = () => Promise<BrowserLike>;

export interface RenderJob {
	/** One entry per PDF page; length 1 or 12. */
	pages: CalendarOptions[];
	/**
	 * The background photo's raw bytes and validated MIME type, or null. Served to the print
	 * page under a fixed URL via request interception (§7.4) rather than a data URL, because
	 * Chromium silently drops any URL over 2 MiB — a base64-encoded phone photo routinely does.
	 */
	image: { bytes: Uint8Array; type: string } | null;
}
/** Observability context for one render. Reaches the log lines only, never the output. */
export interface RenderContext {
	/** Correlation id from `event.locals.id`. */
	id?: string;
	scope?: ExportScope;
}

export interface PdfRenderer {
	render(job: RenderJob, context?: RenderContext): Promise<Uint8Array>;
	shutdown(): Promise<void>;
}
```

### 7.2 `createPdfRenderer` (`renderer.ts`)

```ts
export function createPdfRenderer(deps: {
	launch: BrowserFactory;
	loadFontCss: (fonts: FontPairing[]) => Promise<string>;
	concurrency: number; // PDF_CONCURRENCY
	timeoutMs: number; // PDF_TIMEOUT_MS
	queueTimeoutMs: number; // PDF_QUEUE_TIMEOUT_MS
	log: Logger;
}): PdfRenderer;
```

Lifecycle:

- **Lazy launch.** The browser is launched on the first `render()`. A single in-flight
  `Promise<BrowserLike>` is memoised so concurrent first requests share one launch.
- **Crash recovery.** If `render()` throws with a disconnected browser, the memoised promise
  is cleared so the next request relaunches. One retry per request, at most.
- **Concurrency.** A `Semaphore(concurrency)`. Acquire waits at most `queueTimeoutMs`; on
  expiry throw `RenderError('renderer_busy')`.
- **Timeout.** The **whole job** — `loadFontCss` and the Svelte render, the (possibly cold)
  browser launch, and `newPage → setContent → pdf → close` — is wrapped in `Promise.race`
  against `timeoutMs`; on expiry the page is closed best-effort and
  `RenderError('render_timeout')` is thrown. Two properties are load-bearing, not incidental:
  1. The budget's rejection handler is attached **when the budget is created**, not when it is
     first raced. A budget that expires while the launch is still in flight is otherwise an
     unhandled rejection, which terminates the Node process (`PDF_TIMEOUT_MS=200` plus a cold
     launch reproduces it), and the default `PDF_TIMEOUT_MS` equals puppeteer's own 30 s launch
     timeout, so a stalled launch reaches it too.
  2. Racing only the printing step is not enough: a cold launch can take tens of seconds while
     nothing is listening. `printOn` additionally re-checks the budget after every `await`, so
     a page opened just after expiry is closed at once instead of running on outside the
     semaphore.
- **Shutdown.** `shutdown()` closes the browser if launched and makes further `render()` calls
  throw `renderer_unavailable`. Idempotent. The stopped flag is re-checked inside the lazy
  launch, not only at the top of `render()`: a job that passed the entry check and then awaited
  the semaphore or the fonts would otherwise launch a browser that `shutdown()` has already
  stopped tracking, orphaning it.
- Pages are always closed in a `finally`; the semaphore is always released in a `finally`.

The renderer — not the endpoint — owns the image→CSS mapping. Inside `render(job)`:

```ts
const imageCss = job.image ? 'var(--calgen-bg)' : 'none';
const bodies = job.pages.map(
	(options) => render(CalendarPage, { props: { options, imageCss } }).body
);
const pageBg = getScheme(job.pages[0].schemeId).bg; // every page shares one scheme
const html = buildPrintHtml({ pages: bodies, fontCss, hasImage: job.image !== null, pageBg });
```

`RenderJob` therefore carries only `{ pages, image }`; `imageCss` never crosses the endpoint
boundary. Before `setContent`, `printOn` also enables request interception on the new page and
registers the single handler described in §7.4, so the photo (when present) reaches the print
page without ever crossing the URL-length limit a `data:` URL would hit.

`src/lib/server/pdf/instance.ts` exposes `getPdfRenderer(): PdfRenderer` — a module-level
singleton wired to the real `puppeteerBrowserFactory` and `config`. `hooks.server.ts`
registers `process.on('sveltekit:shutdown', () => getPdfRenderer().shutdown())` and, for the
`vite preview` / bare-`node` cases, `process.once('SIGTERM'|'SIGINT', …)` guarded so it runs
once.

`src/lib/server/semaphore.ts`:

```ts
export function createSemaphore(limit: number): {
	acquire(timeoutMs: number): Promise<() => void>; // resolves to release()
	readonly inFlight: number;
	readonly queued: number;
};
```

Tested standalone: respects the limit, FIFO order, rejects on queue timeout, release is
idempotent, a rejected waiter does not consume a slot.

### 7.3 Fonts

**Decision: the print HTML embeds the required `woff2` faces as base64 `data:` URIs inside
`@font-face` rules. Chromium never touches the network.**

Rejected alternatives:

- _Chromium loads `/fonts/*.woff2` from the app's own origin._ Requires `page.goto()` against
  a real URL instead of `setContent`, which means the 20 MB image would also have to travel
  through a URL. It also couples PDF rendering to the HTTP server being reachable from inside
  the container and adds a startup ordering hazard. Worse on every axis that matters.
- _`file://` URLs._ Needs `--allow-file-access-from-files` and breaks if the build layout
  changes. No.

Measured cost (real download, latin + latin-ext subsets, deduplicated by source URL — six of
the eight families are variable fonts and Google serves one file for weights 400/600/700):

| Pairing                     | Weights | Distinct files | woff2 bytes | base64 bytes |
| --------------------------- | ------- | -------------- | ----------- | ------------ |
| Caprasimo + Figtree         | 1 + 3   | 4              | 52.3 KB     | ≈ 70 KB      |
| Playfair + Source Sans 3    | 1 + 3   | 4              | 122.0 KB    | ≈ 163 KB     |
| Fredoka + Nunito            | 1 + 3   | 4              | 91.4 KB     | ≈ 122 KB     |
| Bricolage + Instrument Sans | 1 + 3   | 4              | 72.2 KB     | ≈ 96 KB      |
| all 8 families              | 16      | **16**         | 337.9 KB    | —            |

("Weights" counts distinct `font-weight` values, not `@font-face` blocks: each weight has a
latin and a latin-ext face, so a pairing declares 8 faces backed by 4 files.)

(Undeduplicated the same 32 faces would be 796.6 KB — deduplication more than halves the
committed asset weight, so step 3 of the fetch script is not an optimisation, it is required.)

Only the selected pairing's faces are embedded (heading weight + body 400/600/700). Base64
strings are computed once and cached in a module-level `Map` keyed by file name.

`scripts/fetch-fonts.mjs` — Node ≥ 20, zero dependencies:

1. `GET https://fonts.googleapis.com/css2?family=Caprasimo&family=Figtree:wght@400;600;700&family=Playfair+Display:wght@500&family=Source+Sans+3:wght@400;600;700&family=Fredoka:wght@500&family=Nunito:wght@400;600;700&family=Bricolage+Grotesque:wght@600&family=Instrument+Sans:wght@400;600;700`
   with header `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36`
   (a modern Chrome UA is what makes Google return `woff2` + `unicode-range` subsets).
2. Parse the CSS into blocks of `/* <subset> */ @font-face { … }`; keep only
   `subset ∈ {latin, latin-ext}`.
3. **Deduplicate by source URL** — six of these families are variable fonts and Google serves
   one file for 400/600/700 (verified: across all subsets, 60 `url()` occurrences resolve to
   28 distinct files; restricted to latin + latin-ext, 32 faces resolve to **16** files).
   Download each distinct URL once.
4. Write each file as `static/fonts/<slug(family)>-<weight>-<subset>.woff2`, where a shared
   variable file is written once under its first (lowest-weight) face's name and referenced by
   the other faces in the manifest.
5. Emit `static/fonts/fonts.json`:
   `[{ family, weight, style:'normal', subset, file, unicodeRange }]`.
6. Emit `static/fonts/fonts.css` — the same faces with `src:url('/fonts/<file>') format('woff2')`
   and `font-display:swap`, for the browser app.
7. Idempotent: skip a download when the target file exists with the same byte length, unless
   `--force`.
8. Fail loudly (non-zero exit) on any HTTP error, and never write a partial `fonts.json`.

Generated `woff2` files and both generated text files are **committed** — the Docker build and
CI must not need network access to Google. Re-run `pnpm fetch-fonts` only when the font list
changes; the fetch script is not part of `pnpm build`.

All eight families are OFL-licensed; add `static/fonts/OFL.txt` noting the licence and the
source, and reference it in `README`/`CLAUDE.md`.

Swedish coverage note: `å` (U+00E5), `ä` (U+00E4) and `ö` (U+00F6) are in the **latin**
subset. `latin-ext` is included for names containing e.g. `š`, `ž`, `ł`.

`src/lib/server/fonts.ts`:

```ts
/** Absolute path of the directory holding fonts.json and the woff2 files. */
export function fontsDir(): string;
/** @font-face CSS with data: URIs, for exactly the families these pairings need. */
export async function loadPrintFontCss(pairings: FontPairing[], dir?: string): Promise<string>;
```

**Font path resolution (product-owner decision, no implementer choice):** the files are always
read from `static/fonts`. `fontsDir()` returns `process.env.FONTS_DIR` when set, otherwise
`path.resolve(process.cwd(), 'static/fonts')`. That path is correct in dev (repo root) and in
the container (the Dockerfile copies `static/fonts` to `/app/static/fonts`, and the working
directory is `/app`). `FONTS_DIR` exists so a deployment that relocates the assets — or a test
pointing at a fixture directory — needs no code change. `fontsDir(override?)` is the single helper; do
not resolve font paths anywhere else — `config.fontsDir` is this function's output, and
`loadPrintFontCss` takes the directory as a parameter (defaulting to `fontsDir()`) so the
composition root passes `config.fontsDir` and tests pass a fixture directory without touching
`process.env`.

`loadPrintFontCss` reads `fontsDir()/fonts.json` and the `woff2` files beside it. Selects
faces where
`family ∈ {headingFamily, bodyFamily}` and
`weight ∈ {headingWeight} ∪ {400,600,700}` for the body family. Emits, per face:

```css
@font-face {
	font-family: 'Figtree';
	font-style: normal;
	font-weight: 400;
	font-display: block;
	src: url(data:font/woff2;base64,…) format('woff2');
	unicode-range: U+0000-00FF, …;
}
```

`font-display:block` (not `swap`) for print: a swap fallback would be baked into the PDF if
the font were slow. Combined with puppeteer's `waitForFonts` this is belt and braces.

### 7.4 Standalone print HTML (`print-html.ts`)

**Why not a `data:` URL.** Chromium enforces a hard 2,097,152-character limit on any URL
(`url::kMaxURLChars`) and silently drops longer ones rather than erroring — a `background-image`
referencing an over-limit `data:` URL simply never paints, while the render otherwise succeeds
(no error, `hasImage:true` in the logs, a PDF with no photo). A base64-encoded phone photo
routinely exceeds it: verified threshold is 2,097,091 chars renders, 2,097,223 does not, i.e.
somewhere above ~1.5 MB of original photo bytes. `MAX_UPLOAD_BYTES` allows 20 MiB, so this was
not an edge case.

Instead the photo is served to the print page under one short, constant URL —
`BACKGROUND_IMAGE_URL = 'https://calgen.invalid/background'` (`.invalid` is a reserved TLD,
RFC 2606) — answered by puppeteer request interception (§7.2, §7.5) rather than embedded in the
HTML at all. This has no length limit regardless of photo size, and doubles as a hard fetch
allowlist: interception aborts every request the print page could ever issue except that one.

```ts
export const BACKGROUND_IMAGE_URL = 'https://calgen.invalid/background';

export function buildPrintHtml(input: {
	pages: string[]; // render(CalendarPage, …).body per page
	fontCss: string;
	/** Whether a background photo was uploaded. */
	hasImage: boolean;
	/** Scheme `bg`; paints the ~0.24 mm sliver Chromium leaves at the page foot. */
	pageBg: string;
	/** The physical sheet, for `@page`. Only `widthMm`/`heightMm` of `PaperSize` (§4.11). */
	paper: Pick<PaperSize, 'widthMm' | 'heightMm'>;
}): string;
```

Template:

```html
<!doctype html>
<html lang="sv">
	<head>
		<meta charset="utf-8" />
		<title>CalGen</title>
		<style>
			{fontCss}
		</style>
		<style>
			@page { size: {paper.widthMm}mm {paper.heightMm}mm; margin: 0 }
			html, body { margin:0; padding:0; background:{pageBg};
			             -webkit-print-color-adjust: exact; print-color-adjust: exact }
			* { box-sizing: border-box }
			.calgen-page { width:297mm; height:210mm; overflow:hidden;
			               break-inside: avoid; break-after: page; page-break-after: always }
			.calgen-page:last-child { break-after: auto; page-break-after: auto }
			{rootVars}
		</style>
	</head>
	<body>
		<div class="calgen-page">{pages[0]}</div>
		…
	</body>
</html>
```

where `rootVars` is `:root{--calgen-bg:url("https://calgen.invalid/background")}` when an image
was uploaded, and empty otherwise.

Notes:

- `render().head` is currently always `''` (§5.5 assertion 1). The template still concatenates
  it into `<head>` so a future `<svelte:head>` cannot silently break the PDF.
- `.calgen-page:last-child{break-after:auto}` is what prevents a trailing blank page — the
  single most common 12-page-export bug.
- **`html, body { background: {pageBg} }` is load-bearing, not cosmetic.** Chromium quantises
  the PDF MediaBox to 1/100 inch, producing `[0 0 841.92 595.92]` pt = 297.02 × 210.24 mm for
  a 297 × 210 mm request (§7.5). Content is not clipped, but a ~0.24 mm strip at the foot of
  every page falls outside the 210 mm page element. Painting the root with the scheme
  background makes that strip the scheme colour instead of white. The page element MUST NOT be
  enlarged to cover it — a page taller than the layout page risks overflowing into a second
  printed page, which is a far worse failure. All pages in one export share one scheme, so a
  single `pageBg` is always correct. A3 has no such unpainted edge at all: its `@page` box is
  the full 420 × 297 mm sheet (§4.11), so `page.pdf({ scale })` (§7.5) scales that whole box —
  background included — well past the sheet's own dimensions, and Chromium crops the excess
  instead of centring it. The visible sheet therefore sits entirely inside the scaled,
  background-painted page box: `.calgen-page`'s scaled content plus the same background out to
  every edge, with nothing left unpainted. Measured directly on a rasterised A3 export (§13
  step 13): all four edge rows and columns are the scheme colour, not white.
- **`@page` MUST match the requested paper, not the 297 × 210 mm layout page.** `buildPrintHtml`
  takes `paper` (§4.11's `PaperSize`, `widthMm`/`heightMm` only) and emits `@page { size:
{paper.widthMm}mm {paper.heightMm}mm }`. This is the fix for the original A3 defect: the
  `@page` size is the CSS page box Chromium lays print content out into, and Chromium _centres_
  that box on the sheet `page.pdf({ width, height })` requests — it does not stretch it. With
  `@page` fixed at 297 × 210 mm regardless of paper, an A3 export laid the unscaled A4 page out
  and centred it, unscaled, on the 420 × 297 mm sheet; `page.pdf({ scale })` was never applied,
  because there was nothing left for it to scale into. Passing the real paper into `@page`
  makes Chromium lay out (and `scale`, per §7.5) a page box matching the sheet, so the 297 × 210
  mm content fills it. `.calgen-page` itself stays at `width:297mm;height:210mm` for every
  paper size — it is the layout page, unrelated to the sheet — and `renderer.ts` resolves
  `getPaperSize(job.pages[0].paperSize)` once and passes it to both `buildPrintHtml` and
  `page.pdf`, so the two always agree.
- The whole document is built as one string; there is no templating dependency. `pages[i]`
  is already-escaped Svelte output. `fontCss`, `pageBg` and `hasImage` are server-constructed.

**Tests** (`print-html.test.ts`): output starts with `<!doctype html>`; contains
`@page { size: 297mm 210mm` for the A4 `paper`, and `@page { size: 420mm 297mm` for the A3
`paper` (whitespace-insensitive assertions); `.calgen-page { width: 297mm; height: 210mm;`
appears for both paper sizes; contains exactly `n` occurrences of `class="calgen-page"` for
`n ∈ {1, 12}`; contains `--calgen-bg` only when an image is supplied; the supplied font CSS
appears verbatim; `html, body` carry the supplied `pageBg` (e.g. `#2e2b25` for `natt`); the
page bodies appear in order.

### 7.5 Chromium driver — `puppeteer-core`, not `playwright-core`

**Decision: `puppeteer-core`.** Reasoning, in order of weight:

1. **System-Chromium tolerance.** Playwright ships and expects its own _patched_ Chromium
   build and only officially supports third-party browsers through `channel: 'chrome'|'msedge'`;
   pointing `executablePath` at a distro `chromium` is untested territory and has repeatedly
   broken across Playwright releases. `puppeteer-core` speaks plain CDP and is explicitly
   designed to attach to a browser you supply. Our constraint is a _system_ Chromium
   (Debian package in Docker, Google Chrome 151 on the dev Mac), so tolerance is the deciding
   property.
2. **`page.pdf({ waitForFonts: true })` is a puppeteer default.** It awaits `document.fonts.ready`
   before printing. Playwright has no equivalent option; we would have to add
   `await page.evaluate(() => document.fonts.ready)` and hope it is sufficient. Missing-font
   PDFs are exactly the failure mode we cannot afford.
3. **Smaller dependency.** `puppeteer-core` has no browser download, no driver process, no
   `playwright` CLI. `playwright-core` would pull in a driver harness we never use.
4. Playwright's advantages (selectors engine, auto-waiting, tracing) are irrelevant: the render
   path calls `setContent` and `pdf`, plus `Fetch.enable`/`fulfillRequest`/`failRequest`
   underneath `setRequestInterception` for the background photo — nothing beyond that.

Pin `puppeteer-core` to the current major (`25.9.0` at time of writing) with an exact version
in `package.json` and let Renovate/manual bumps move it.

`src/lib/server/pdf/puppeteer-browser.ts`:

```ts
import puppeteer from 'puppeteer-core';

export const puppeteerBrowserFactory =
	(cfg: Config): BrowserFactory =>
	async () =>
		puppeteer.launch({
			executablePath: resolveChromiumPath(cfg),
			headless: true, // "new" headless; the only supported value we use
			protocolTimeout: cfg.pdfTimeoutMs + 15_000,
			timeout: 30_000,
			dumpio: cfg.logLevel === 'debug',
			pipe: true, // CDP over stdio, not a localhost WebSocket
			handleSIGINT: false, // signals belong to adapter-node + tini, not puppeteer
			handleSIGTERM: false,
			handleSIGHUP: false,
			args: [
				'--disable-dev-shm-usage', // /dev/shm is 64 MB in default Docker
				'--disable-gpu',
				'--hide-scrollbars',
				'--font-render-hinting=none', // deterministic glyph metrics in PDF output
				'--disable-extensions',
				'--disable-background-networking',
				'--disable-features=Translate,BackForwardCache,AcceptCHFrame',
				'--no-first-run',
				'--no-default-browser-check',
				'--host-resolver-rules=MAP * ~NOTFOUND', // hard network kill-switch
				...(cfg.chromiumNoSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : [])
			]
		}) as unknown as BrowserLike;
```

`--host-resolver-rules=MAP * ~NOTFOUND` guarantees the render can never reach the real network,
so a missing font can never be silently fetched from Google. It is defence in depth beneath the
renderer's own request interception (§7.2, §7.4), which is the primary control: interception
answers only `BACKGROUND_IMAGE_URL` and `abort()`s everything else, so even a request that
somehow bypassed the host-resolver rule (a `.invalid` TLD never resolves regardless) would still
be refused at the page level. This is cheap defence and makes the "no network" claim testable.
Interception is a network allowlist, not a resource allowlist: puppeteer's
`HTTPRequest.canBeIntercepted()` returns `false` for `data:` URLs (and memory-cache hits), so
`abort()` is a no-op for them and they load regardless — which is exactly why the §7.3 font
`@font-face` faces, embedded as `data:` URIs, still render.

**`pipe: true` is required, not a preference.** It moves CDP onto stdio, which removes the
localhost DevTools WebSocket entirely — no listening port to secure, and no WebSocket
frame-size question for the interception responses a 20 MB background produces (the photo
travels as a `request.respond()` body, not through `setContent`'s HTML payload).

**`handleSIGINT/SIGTERM/SIGHUP: false` is required.** By default puppeteer installs its own
signal handlers, and its `SIGINT` handler kills the browser and calls `process.exit(130)` —
which terminates the Node process before adapter-node can drain in-flight requests. With these
three off, signal handling belongs solely to adapter-node (and `tini` as PID 1), and the
browser is closed by our `sveltekit:shutdown` hook (§7.2). Leaving them on silently defeats
the graceful shutdown this spec requires.

`resolveChromiumPath(cfg)`: `cfg.chromiumPath` if set; otherwise the first existing path from
`/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/usr/bin/google-chrome`,
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. If none exists, throw
`RenderError('renderer_unavailable')` with the searched list in the log (not the response).

`page.pdf` options, now paper-dependent (`paper` resolved via `getPaperSize`, §4.11):

```ts
{
  width: `${paper.widthMm}mm`, height: `${paper.heightMm}mm`,
  printBackground: true,
  preferCSSPageSize: false,          // explicit width/height wins; deterministic
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
  scale: paper.scale,
  landscape: false,                  // irrelevant when width/height are explicit; keep false
  displayHeaderFooter: false,
  tagged: false,                     // puppeteer defaults to true; we do not need PDF/UA tags
  outline: false,
  waitForFonts: true,
  timeout: cfg.pdfTimeoutMs
}
```

`scale` is clamped by puppeteer to `[0.1, 2]`; `A4.scale` is the literal `1` and `A3.scale` is
`1.414`, both comfortably inside the range.

`page.setContent(html, { waitUntil: 'load', timeout: cfg.pdfTimeoutMs })`. `'load'` (not
`'networkidle0'`) — request interception (§7.2, §7.4) is registered before `setContent`, so the
one request the page can issue (the background photo) is answered or aborted synchronously and
`load` fires right after; `networkidle0` would still add a fixed 500 ms wait per render on top
of that for no benefit.

**Measured output geometry (A4).** With these options Chromium emits `MediaBox [0 0 841.92
595.92]` pt — 297.02 × 210.24 mm, because the page box is quantised to 1/100 inch. Content is
not clipped; the excess shows as a ~0.24 mm unpainted strip at the foot of each page, handled
by the root background in §7.4. `preferCSSPageSize: true` was measured as _worse_: it yields
209.9 mm, i.e. a page box smaller than the 210 mm content, so `false` is correct.

**Measured output geometry (A3).** Measured against real Chromium (Google Chrome 151,
`renderer.integration.test.ts`): a single-month A3 job emits `MediaBox [0 0 1191.12
841.91998]` pt — 420.20 × 297.01 mm — at `pageCount === 1`; a whole-year A3 job stays at
`pageCount === 12`, with no trailing blank page. The MediaBox and page counts match the
prediction: no second page, no factor correction needed.

**Root cause and fix — `@page` must track the requested paper (§7.4).** The first
implementation left `buildPrintHtml`'s `@page` rule fixed at `297mm 210mm` regardless of paper,
on the assumption that `page.pdf({ scale })` alone would enlarge the rendering onto the larger
sheet. Measured against real Chromium, that assumption was wrong: `@page` sets the CSS page box
Chromium lays print content out into, and `page.pdf({ width, height })` **centres** that box on
the requested sheet — it does not stretch it. With `@page` fixed at 297 × 210 mm, an A3 export
laid out the unscaled A4 page and centred it, untouched, on the 420 × 297 mm sheet, leaving a
large blank margin on the right and at the foot. (This was first misdiagnosed as a Chromium
day-grid pagination quirk — a diagnosis this section used to carry — but the same centring
reproduces with a placeholder page, ruling the grid out.) `buildPrintHtml`
now takes `paper` (§7.4) and emits `@page { size: {paper.widthMm}mm {paper.heightMm}mm }`;
`renderer.ts` resolves `getPaperSize(job.pages[0].paperSize)` once and passes the identical
value to both `buildPrintHtml` and `page.pdf`, so the CSS page box Chromium lays out and the
`scale` applied to it always agree, and the 297 × 210 mm content fills the requested sheet.

Verified two ways: a manual `natt` A3 export, rasterised with `sips`, shows the calendar filling
the 420 × 297 mm sheet edge-to-edge with no blank margin (§13 step 13). And
`renderer.integration.test.ts` decodes each PDF's first content stream (`contentStreams`,
`tests/pdf-utils.ts`) and reads Chromium's leading `q <sx> 0 0 <sy> <tx> <ty> cm` transform —
the operator that scales every subsequent drawing command. Measured: A4's `|sx|` is `3.125`;
A3's is `4.4187503` — a ratio of `1.41400010`, matching `paper.ts`'s `A3_SCALE` (`1.414`) to
five decimal places. This is the regression guard: it fails if `@page` ever stops tracking the
paper, because `MediaBox`/`pageCount` alone cannot detect an unscaled render centred on a
correctly-sized sheet.

`page.emulateMedia` is **not** called: `page.pdf()` already uses print media, and the layout is
media-agnostic.

### 7.6 Renderer tests

`renderer.test.ts` uses a fake `BrowserFactory` returning a `BrowserLike` that records calls
and returns `Buffer.from('%PDF-1.4 fake')`:

- happy path returns those bytes; `setContent` received HTML containing `class="calgen-page"`.
- 12-page job produces one `setContent` with 12 sections and one `pdf` call.
- `newPage`/`close` are balanced; `close` runs even when `pdf` rejects.
- launch happens once across two concurrent renders (memoised promise).
- `concurrency: 1` serialises two renders (assert via a deferred fake `pdf`).
- queue timeout → `RenderError('renderer_busy')`.
- `pdf` hanging past `timeoutMs` → `RenderError('render_timeout')` and the page is closed.
- `launch` rejecting → `RenderError('renderer_unavailable')`; the next call retries the launch.
- after `shutdown()`, `render()` rejects with `renderer_unavailable`; `browser.close()` called
  once; a second `shutdown()` is a no-op.
- a disconnected browser (`connected === false`) triggers exactly one relaunch-and-retry.
- request interception is enabled before `setContent`, on every render, image or not.
- a request for `BACKGROUND_IMAGE_URL` is answered with the job's `image.bytes`/`image.type`
  when an image was supplied; any other URL, and `BACKGROUND_IMAGE_URL` itself when no image
  was supplied, is `abort()`ed.
- `respond()` rejecting (puppeteer's `verifyInterception()` double-handled case) never becomes
  an unhandled rejection, and logs `pdf.intercept` with the request's `url` and the failure's
  `message` instead of swallowing it.

`renderer.integration.test.ts` (real Chromium) additionally builds an 800×800 PNG from
`crypto.randomBytes` at test time (1,920,000 bytes of raw pixel data, ~1.83 MiB; a 1,921,153-byte
PNG) — large enough that its base64 form exceeds the 2 MiB URL limit above — and asserts the
resulting PDF contains an image XObject
(`tests/pdf-utils.ts#hasImageXObject`), which a `data:`-URL-based implementation fails.

---

## 8. HTTP API

### 8.1 `GET /` — the app

SvelteKit page. `Cache-Control: no-store` on the document (the app is tiny and always fresh);
hashed assets get SvelteKit's default immutable caching. Applied in `hooks.server.ts`, which
sets the header on any response whose `Content-Type` starts with `text/html` — the page itself
sets nothing, so without that hook the document ships with only an `ETag`.

### 8.2 `GET /healthz`

`src/routes/healthz/+server.ts`

```
200 application/json  {"status":"ok","uptime":123.4,"version":"1.0.0"}
Cache-Control: no-store
```

Liveness only — it MUST NOT launch or probe Chromium (a health check that starts a browser
turns a slow render into a restart loop). Readiness of the PDF path is observable through the
`renderer_unavailable` rate in logs. Documented as such.

### 8.3 `POST /api/pdf`

| Property               | Value                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Request `Content-Type` | `multipart/form-data` (anything else → 415 `unsupported_media_type`)                      |
| Part `options`         | `string`, JSON of `ExportRequest`. Required.                                              |
| Part `image`           | `File`, optional. `image/jpeg` · `image/png` · `image/webp`.                              |
| Max request body       | `BODY_SIZE_LIMIT` (default `24M`) — enforced by adapter-node                              |
| Max image              | `MAX_UPLOAD_BYTES` (default `20971520`) — enforced by the handler                         |
| Success                | `200`, `Content-Type: application/pdf`                                                    |
|                        | `Content-Disposition: attachment; filename="calgen-2026-09.pdf"`                          |
|                        | `Content-Length: <bytes>` · `Cache-Control: no-store` · `X-Content-Type-Options: nosniff` |

**CSRF.** SvelteKit's cross-origin form-POST protection is on by default and needs no route
configuration — there is no `csrf` route export (`csrf` is a `KitConfig` key, and its
`checkOrigin` field is deprecated in favour of `trustedOrigins`). Do not add one. The check
compares the request `Origin` against the app's own origin, which in production is
**whatever `ORIGIN` says**. If `ORIGIN` is unset or wrong behind a reverse proxy,
`POST /api/pdf` fails with a bare **403** and an HTML body — not one of our error codes — and
the UI shows the generic toast. That is the single most likely deployment misconfiguration;
see §9.

No `GET` variant of this endpoint exists (an image cannot travel in a URL, and a GET that
renders a PDF is a cache and DoS hazard).

### 8.4 Handler outline

```ts
export const POST: RequestHandler = async ({ request }) => {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data'))
    return err(415, 'unsupported_media_type', 'Expected multipart/form-data.');

  let form: FormData;
  try {
    form = await request.formData();              // adapter-node enforces BODY_SIZE_LIMIT
  } catch {
    // A truncated or malformed body would otherwise escape as SvelteKit's HTML error page,
    // not the §3.4 shape.
    return err(400, 'invalid_multipart', '…');
  }

  const raw = form.get('options');
  if (typeof raw !== 'string') return err(400, 'missing_options', '…');

  let json: unknown;
  try { json = JSON.parse(raw); } catch { return err(400, 'invalid_json', '…'); }

  const parsed = parseCalendarOptions(json);
  if (!parsed.ok) return err(400, parsed.code, parsed.message);

  const file = form.get('image');
  let image: { bytes: Uint8Array; type: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > cfg.maxUploadBytes) return err(413, 'image_too_large', '…');
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) return err(415, 'unsupported_image_type', '…');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (sniffImageType(bytes) !== file.type)
      return err(415, 'unsupported_image_type', 'Declared type does not match content.');
    image = { bytes, type: file.type };
  } else if (file != null && !(file instanceof File)) {
    return err(400, 'invalid_image', '…');
  }

  const o = parsed.value;
  const pages = o.scope === 'year' ? yearPages(o) : [stripScope(o)];
  const pdf = await getPdfRenderer().render({ pages, image });   // RenderError → mapped
  return new Response(pdf, { status: 200, headers: { … } });
};
```

The endpoint no longer base64-encodes the upload at all — the renderer takes the raw bytes and
serves them to the print page under a fixed URL via request interception (§7.1, §7.4). This is
what fixed the silent-drop bug: a `data:` URL over 2 MiB is dropped by Chromium with no error,
which a base64-encoded phone photo (routinely well above `MAX_UPLOAD_BYTES`'s low end) hit in
practice despite the endpoint validating and accepting it correctly.

The image transform needs nothing of its own here: `imageZoom`/`imageX`/`imageY` are ordinary
`CalendarOptions` fields, so they are validated by `parseCalendarOptions` and carried into
every page by `stripScope`/`yearPages` like the scheme or the opacity. The endpoint is
unchanged by §1.2.

`sniffImageType(bytes)`: JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; WebP `RIFF` at 0 and
`WEBP` at 8. Content sniffing (not just the `Content-Type` header) is what keeps a renamed
`.svg` or `.html` out of Chromium's parser. Unit-tested with the three magic prefixes plus a
`<svg` prefix and an empty buffer.

`RenderError` codes map to status via a single table; anything else is logged with a
correlation id and returned as `500 internal_error`.

### 8.5 Security headers (`hooks.server.ts`)

Applied to every response through `handle`:

```
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

CSP is configured through SvelteKit's own `csp` option so Kit adds hashes for its inline
bootstrap script automatically. **It lives flat inside `sveltekit({ … })` in `vite.config.ts`**
— there is no `svelte.config.js` and no `kit:` wrapper (§2.5.6); a `csp` block put in a
`svelte.config.js` is silently ignored and the app ships with no CSP at all.

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter(),
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'], // the UI is built on inline style attributes
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'frame-ancestors': ['none'],
					'form-action': ['self']
				}
			}
		})
	]
});
```

`style-src 'unsafe-inline'` is unavoidable: both the design system and `CalendarPage.svelte`
are inline-style-driven by design (and inline `style` _attributes_ are covered by
`style-src-attr`, which falls back to `style-src`). Documented, not silently accepted. It is
also harmless to the script hashing: with `'unsafe-inline'` present in `style-src`, Kit skips
style hashing entirely and still hashes its inline bootstrap script.

`handleError` logs `{ level:'error', event:'unhandled', id, message, stack }` and returns
`{ message: 'Något gick fel.' , id }` — no stack to the client.

### 8.6 Logging (`src/lib/server/log.ts`)

Zero-dependency structured JSON to stdout, one line per event:

```json
{
	"ts": "2026-09-02T10:11:12.345Z",
	"level": "info",
	"event": "pdf.render",
	"id": "01J…",
	"scope": "year",
	"pages": 12,
	"bytes": 1843221,
	"ms": 4210,
	"hasImage": true
}
```

Events: `http.request` (method, path, status, ms — skip `/healthz` and `/_app/*`),
`pdf.render` (id, scope, pages, bytes, ms, hasImage), `pdf.error` (id, scope, code, message,
ms), `browser.launch` (ms, executablePath), `browser.shutdown`, `server.shutdown` (reason),
`server.start` (port, config summary with no secrets).

`id` and `scope` reach the renderer through the optional `RenderContext` second argument of
`render()` (§7.1). A `RenderError` is logged **once**, by the renderer, which is the layer that
holds the diagnostic `message` (e.g. the list of Chromium paths that were searched); the
endpoint logs only failures the renderer did not classify. The response body never carries the
message.

`LOG_LEVEL` ∈ `debug|info|warn|error`, default `info`. Never log image bytes, data URLs, or
the full print HTML. `id` is a per-request `crypto.randomUUID()` stored on `event.locals`.

---

## 9. Configuration

`src/lib/server/config.ts` — parsed once at module load, typed, validated, with a
`server.start` log line summarising the effective values.

| Env var                | Default                               | Meaning                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                 | `3000`                                | adapter-node listen port                                                                                                                                                                                                                                      |
| `HOST`                 | `0.0.0.0`                             | adapter-node bind address                                                                                                                                                                                                                                     |
| `ORIGIN`               | _(unset)_                             | Public origin, e.g. `https://calgen.example.se`. **Required in production** (PO decision): without it the CSRF origin check rejects `POST /api/pdf` with a bare 403. `config.ts` fails fast at startup when `NODE_ENV === 'production'` and `ORIGIN` is unset |
| `BODY_SIZE_LIMIT`      | `512K` _(adapter-node's own default)_ | adapter-node request cap, read by the adapter at module load before our code runs. **MUST be set explicitly** — 512K rejects every real upload. `config.ts` fails fast if it is unset, or below `MAX_UPLOAD_BYTES + 1 MiB`                                    |
| `SHUTDOWN_TIMEOUT`     | `30`                                  | adapter-node graceful-shutdown seconds                                                                                                                                                                                                                        |
| `FONTS_DIR`            | `<cwd>/static/fonts`                  | Overrides `fontsDir()` (§7.3)                                                                                                                                                                                                                                 |
| `CHROMIUM_PATH`        | _(auto-detect)_                       | Chromium/Chrome executable                                                                                                                                                                                                                                    |
| `CHROMIUM_NO_SANDBOX`  | `false`                               | Adds `--no-sandbox --disable-setuid-sandbox`                                                                                                                                                                                                                  |
| `PDF_CONCURRENCY`      | `2`                                   | Simultaneous Chromium pages                                                                                                                                                                                                                                   |
| `PDF_TIMEOUT_MS`       | `30000`                               | Per-render budget (single month _and_ year)                                                                                                                                                                                                                   |
| `PDF_QUEUE_TIMEOUT_MS` | `15000`                               | Max wait for a semaphore slot before 503                                                                                                                                                                                                                      |
| `MAX_UPLOAD_BYTES`     | `20971520` (20 MiB)                   | Background image cap                                                                                                                                                                                                                                          |
| `LOG_LEVEL`            | `info`                                | `debug\|info\|warn\|error`                                                                                                                                                                                                                                    |

Numeric variables must be plain decimal integers (`/^\d+$/`): `Number()` alone would accept
`0x10`, `1e3` and ` 7`, and a byte count that silently parses as hex is worse than a refusal.
`PORT`, `PDF_CONCURRENCY`, `PDF_TIMEOUT_MS`, `PDF_QUEUE_TIMEOUT_MS` and `MAX_UPLOAD_BYTES` have
a floor of 1; `SHUTDOWN_TIMEOUT` may be 0.

**`vite preview` counts as production.** It sets `NODE_ENV=production` while `building` is
false, so the `ORIGIN` and `BODY_SIZE_LIMIT` fail-fast checks fire and the command dies out of
the box. The `preview` script therefore supplies both
(`ORIGIN=http://localhost:4173 BODY_SIZE_LIMIT=24M vite preview`, §11.3).

Invalid values fail fast at startup with a clear message (do not silently fall back).
`PDF_TIMEOUT_MS` is one budget for both scopes — a 12-page render is ~4–8× a single page, so
30 s is comfortable; if year exports start timing out, raise the env var rather than
introducing a second knob.

`MAX_UPLOAD_BYTES` stays at 20 MiB (PO decision). The Dockerfile therefore sets
`BODY_SIZE_LIMIT=24M`, comfortably above `20 MiB + 1 MiB`.

`config.ts` cannot _change_ `BODY_SIZE_LIMIT` — adapter-node has already read it — so its job
is purely to refuse to start on a combination that would fail at runtime.

**Tests** (`config.test.ts`): defaults; each override parsed; unset `BODY_SIZE_LIMIT` throws;
`BODY_SIZE_LIMIT` below `MAX_UPLOAD_BYTES + 1 MiB` throws; `NODE_ENV=production` with no
`ORIGIN` throws while development does not; non-numeric `PDF_CONCURRENCY` throws;
`BODY_SIZE_LIMIT` suffix parsing (`512K`, `24M`, `1G`, and `Infinity`, which parses and passes
the comparison).

---

## 10. Docker

Multi-stage, Debian-based (`chromium` is a first-class Debian package; Alpine's Chromium plus
musl is a known source of font and sandbox surprises).

```dockerfile
# ---------- build ----------
FROM node:24-trixie-slim AS build
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

# ---------- runtime ----------
FROM node:24-trixie-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    CHROMIUM_PATH=/usr/bin/chromium \
    PORT=3000 \
    BODY_SIZE_LIMIT=24M \
    NODE_OPTIONS=--max-old-space-size=768
# ORIGIN has no default — it MUST be supplied at run time (§9)
WORKDIR /app
COPY --from=build --chown=node:node /app/build       ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/static/fonts ./static/fonts
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","build/index.js"]
```

Notes:

- `USER node` (uid 1000) — never root.
- `"packageManager": "pnpm@11.17.0"` MUST be added to `package.json` (`sv` does not add one).
  `corepack enable` in the build stage resolves the pnpm version from that field; without it
  the build stage is not reproducible. Bump it together with the local pnpm.
- Confirm the `node:24-trixie-slim` tag actually exists before step 16 (`docker manifest
inspect node:24-trixie-slim`); fall back to `node:24-bookworm-slim` if not, and check that
  the distro still ships a `chromium` package.
- `tini` as PID 1 so `SIGTERM` reaches Node (and so zombie Chromium processes get reaped);
  adapter-node's graceful shutdown then fires `sveltekit:shutdown` → `renderer.shutdown()`.
  **Signal handling is owned by `tini` + adapter-node only** — puppeteer's own handlers are
  disabled at launch (§7.5). If they were left on, `docker stop` would kill the process before
  in-flight renders drained.
- **Memory floor: ≥ 1.5 GB per container.** A single 20 MiB upload costs roughly 20 MB (raw
  bytes held by the renderer) + a transient ~27 MB base64 copy while puppeteer relays it to
  Chromium as a request-interception response + ~80 MB decoded inside Chromium once the image
  is decoded to RGBA — and `PDF_CONCURRENCY` defaults to 2. The photo no longer travels through
  the print HTML itself; it is served under a fixed URL via request interception rather than
  inlined as a `data:` URL (§7.4). Set `NODE_OPTIONS=--max-old-space-size=768` so Node fails
  with a clean heap error instead of being OOM-killed by the cgroup, and size the container
  above that.
- **Sandbox.** Chromium's namespace sandbox needs unprivileged user namespaces. Default is
  `CHROMIUM_NO_SANDBOX=false` (sandbox on). If the container platform blocks `unshare`, run
  with `--cap-add=SYS_ADMIN` **or** set `CHROMIUM_NO_SANDBOX=true` and compensate with
  `--read-only`, `--cap-drop=ALL`, `--security-opt no-new-privileges` and a tmpfs `/tmp`.
  The `README`/`CLAUDE.md` must state this tradeoff — the uploaded image is attacker-controlled
  input decoded by Chromium's image parsers, so the sandbox is not decorative.
- `--shm-size=256m` is recommended even though `--disable-dev-shm-usage` is passed.
- `static/fonts` is copied to `/app/static/fonts` because `fontsDir()` resolves
  `<cwd>/static/fonts` and the working directory is `/app` (§7.3). SvelteKit separately bundles
  `static/` into `build/client` for HTTP serving; the copy is the one the PDF path reads.
- `.dockerignore` excludes `node_modules`, `.git`, `.svelte-kit`, `docs`.

Image size expectation: ~450 MB (node slim ~200 MB + chromium ~230 MB). Documented, not
optimised. A `chromium-headless-shell`-only image would be ~120 MB smaller but requires
`headless: 'shell'` and diverges from the dev Mac's full Chrome — rejected for now.

---

## 11. Tooling

### 11.1 Scaffolding

This exact invocation is non-interactive (verified — without `vitest="usages:unit"` the CLI
still prompts):

```
pnpm dlx sv create . --template minimal --types ts \
  --add prettier eslint vitest="usages:unit" --no-install --no-dir-check
pnpm install
pnpm add -D @sveltejs/adapter-node
pnpm add -E puppeteer-core
```

`--no-dir-check` is required because the directory already holds the reference files.

What it generates: `prettier.config.js` (**not** `.prettierrc`), `.prettierignore`, `.npmrc`,
`eslint.config.js`, `vite.config.ts`, `tsconfig.json` — and **no `svelte.config.js`** (§2.5.6).
Add the adapter and the CSP to the `sveltekit({ … })` call in `vite.config.ts` (§8.5), plus
`"packageManager": "pnpm@11.17.0"` to `package.json` (§10).

`vitest="usages:unit"` produces a **single** vitest project (there is no `client`/browser
project to delete). Add the `integration` project by hand (§11.3).

### 11.2 Dependencies (the complete list)

| Package                                                 | Kind | Why it earns its place                            |
| ------------------------------------------------------- | ---- | ------------------------------------------------- |
| `svelte` `^5.57`                                        | prod | UI + `render()`                                   |
| `@sveltejs/kit` `^2.70`                                 | prod | routing, endpoints, hooks, CSP                    |
| `@sveltejs/adapter-node` `^5.5`                         | prod | Node server, `BODY_SIZE_LIMIT`, graceful shutdown |
| `puppeteer-core` `25.9.0` (exact)                       | prod | the only way to drive Chromium (§7.5)             |
| `vite` `^8.2`                                           | dev  | build                                             |
| `vitest` `^4.1`                                         | dev  | tests                                             |
| `typescript` `^6.0.3`                                   | dev  | types (what `sv` 0.17 scaffolds — see §14.7)      |
| `svelte-check` `^4.7`                                   | dev  | `.svelte` type checking                           |
| `eslint` + `typescript-eslint` + `eslint-plugin-svelte` | dev  | lint                                              |
| `prettier` + `prettier-plugin-svelte`                   | dev  | format                                            |
| `@sveltejs/vite-plugin-svelte`                          | dev  | (transitive via Kit; declare explicitly)          |

Nothing else. No jsdom, no testing-library, no date library, no PDF library, no logger, no
multipart parser (the platform `Request.formData()` handles it), no validation library.

### 11.3 `package.json` scripts

```json
{
	"scripts": {
		"dev": "vite dev",
		"build": "vite build",
		"preview": "ORIGIN=http://localhost:4173 BODY_SIZE_LIMIT=24M vite preview",
		"start": "node build/index.js",
		"test": "pnpm test:unit",
		"test:unit": "vitest run --project server",
		"test:watch": "vitest --project server",
		"test:integration": "vitest run --project integration",
		"check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
		"lint": "eslint . && prettier --check .",
		"format": "prettier --write .",
		"fetch-fonts": "node scripts/fetch-fonts.mjs",
		"hooks:install": "git config core.hooksPath .githooks"
	}
}
```

Two things are required to keep the default suite hermetic, and **both** are needed:

1. `test:unit` names the project explicitly (`--project server`). A bare `vitest run` executes
   _every_ project, integration included.
2. The `server` project's `exclude` gains `'src/**/*.integration.test.ts'`. Its scaffolded
   `include` is `src/**/*.{test,spec}.{js,ts}`, which otherwise matches the integration files
   too — they would be collected by both projects and run twice.

`vite.config.ts` sketch:

```ts
test: {
	projects: [
		{
			extends: true,
			test: {
				name: 'server',
				environment: 'node',
				include: ['src/**/*.{test,spec}.{js,ts}'],
				exclude: ['src/**/*.integration.test.ts']
			}
		},
		{
			extends: true,
			test: {
				name: 'integration',
				environment: 'node',
				include: ['src/**/*.integration.test.ts'],
				testTimeout: 60_000
			}
		}
	];
}
```

### 11.4 Lint / format config

- `eslint.config.js` — flat config from the `sv add eslint` add-on: `@eslint/js` recommended,
  `typescript-eslint` recommended, `eslint-plugin-svelte` flat/recommended, plus one project
  rule: `no-restricted-imports` forbidding `puppeteer-core` outside
  `src/lib/server/pdf/puppeteer-browser.ts`, and forbidding `$lib/server/**` from
  `src/lib/calendar/**` and `src/lib/components/**` (enforces §2.1 mechanically).
- `prettier.config.js` (the file `sv` generates — there is no `.prettierrc`): the scaffolded
  defaults with `printWidth` raised to 100, i.e. `useTabs: true`, `singleQuote: true`,
  `plugins: ['prettier-plugin-svelte']`, and the `*.svelte` parser override.

### 11.5 Git hooks

`.githooks/pre-commit` (POSIX sh, executable), enabled by
`git config core.hooksPath .githooks` (run once; also the `hooks:install` script, and a line
in `CLAUDE.md`):

```sh
#!/bin/sh
set -e
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact --no-banner
else
  echo "pre-commit: gitleaks not installed — skipping secret scan" >&2
fi
pnpm exec prettier --check $(git diff --cached --name-only --diff-filter=ACM \
  | grep -E '\.(ts|js|svelte|json|css|md)$' | tr '\n' ' ') 2>/dev/null || {
  echo "pre-commit: run 'pnpm format'" >&2; exit 1; }
pnpm exec eslint --max-warnings=0 $(git diff --cached --name-only --diff-filter=ACM \
  | grep -E '\.(ts|js|svelte)$' | tr '\n' ' ')
```

Guard against an empty file list (no staged matching files ⇒ skip the command).

### 11.6 `CLAUDE.md`

Repo-root file, required. Contents: one-paragraph project description, the file map from §2.2
(condensed), the command table (`pnpm dev`, `build`, `test`, `test:integration`, `check`,
`lint`, `format`, `fetch-fonts`, `hooks:install`, `docker build`, `docker run`), the env-var
table from §9, the layering rules from §2.5, and the sandbox note from §10. No AI/assistant
attribution anywhere.

---

## 12. Test plan

TDD throughout: every step in §13 writes the failing test first.

Two scaffolding traps to know before writing any test file:

- The generated vitest config sets **`expect.requireAssertions: true`** — a test that runs no
  assertion fails. Tests that only assert "does not throw" must say so explicitly (e.g.
  `expect(() => f()).not.toThrow()`).
- The `server` project **excludes `src/**/*.svelte.{test,spec}.{js,ts}`**. A file named
  `app-state.svelte.test.ts` is therefore silently never collected — it reports as zero tests,
  not as an error. Name it `app-state.test.ts` (§2.2).

### 12.1 Unit — pure logic (vitest, `environment: 'node'`)

`src/lib/calendar/*.test.ts`, using the concrete tables in §4. Fast, hermetic, no mocks.
Includes the `TZ`-invariance test and the 2000–2100 property sweeps. Target: this suite alone
proves every calendar rule.

`src/lib/client/app-state.test.ts` also runs here: Node 24 provides `Blob`, `File`,
`URL.createObjectURL` and `URL.revokeObjectURL`, so the object-URL revoke-on-replace test needs
no jsdom.

### 12.2 Component — SSR render

`src/lib/components/CalendarPage.ssr.test.ts` (§5.5). Runs in the `server` vitest project.

Pitfall to expect: with `environment: 'node'`, `@sveltejs/vite-plugin-svelte` compiles
`.svelte` in server mode, which is exactly what `render()` needs — but if the config resolves
the `browser` export condition (some jsdom setups force this), `render()` fails with
`lifecycle_function_unavailable`. Keep the calendar tests in a project that does **not** set
`resolve.conditions: ['browser']`.

### 12.3 Service — fake browser

`src/lib/server/pdf/renderer.test.ts` and `print-html.test.ts` and `semaphore.test.ts` (§7.2,
§7.4, §7.6). No Chromium, no network, sub-second.

### 12.4 Integration — real Chromium

`src/lib/server/pdf/renderer.integration.test.ts`, in the separate `integration` vitest project
(and excluded from the `server` project's `include` — see §11.3, both halves are required).

```ts
const exe = resolveChromiumPathOrNull();
describe.skipIf(!exe)('pdf integration', () => { … });
```

Assertions:

1. Single month: bytes start with `%PDF-`, end with `%%EOF` (allowing trailing whitespace),
   `pageCount(bytes) === 1`, `bytes.length > 20_000`.
2. Year: `pageCount(bytes) === 12` — this is the assertion that catches the trailing-blank-page
   bug and any 210 mm overflow.
3. With a 1×1 JPEG background (`tests/fixtures/tiny.jpg`), still 1 page and larger output.
4. Fonts embedded: the PDF bytes contain `FontFile2` and match `/[A-Z]{6}\+Caprasimo/` (a
   subset prefix is expected). Verified working against real Chrome 151. **Do not also assert
   that no fallback font is embedded** — Chromium legitimately emits a
   `/BAAAAA+Times-Roman` entry alongside the subset faces, and an assertion that no other
   `/BaseFont` appears would fail for a correct PDF.
5. `natt` scheme + `klassisk` fonts renders 1 page (exercises a second font pairing's
   `@font-face` block).
6. A4 `MediaBox` ≈ 841.92 × 595.92 pt (±0.5 pt), added to the single-month assertion in (1).
7. A3 single month: `pageCount(bytes) === 1` and `MediaBox` matches the value measured against
   real Chromium (§4.11, §7.5) — this is the assertion that would catch the scale factor
   pushing content onto a second page.
8. A3 whole year: `pageCount(bytes) === 12`, no trailing blank page.
9. A3 with `tests/fixtures/tiny.jpg`: 1 page and the image is embedded (`hasImageXObject`);
   `FontFile2` and `/[A-Z]{6}\+Caprasimo/` are still present in A3 output — scaling must not
   drop the embedded font subset.
10. **Content-scale regression guard.** Assertions (1)-(9) read only the page container
    (`MediaBox`) and the page count, neither of which can tell an unscaled A4 render centred on
    a correctly-sized A3 sheet from a genuinely scaled one — the defect this feature originally
    shipped with (§7.5's "Root cause and fix" note). A tenth
    assertion decodes each PDF's first content stream (`contentStreams`, `tests/pdf-utils.ts`)
    and reads Chromium's leading `q <sx> 0 0 <sy> <tx> <ty> cm` transform, which scales every
    subsequent drawing command: `|sx|` for A3 divided by `|sx|` for A4 must equal `A3_SCALE`
    (`1.414`, within `toBeCloseTo`'s 3-digit tolerance) — proving the drawing commands
    themselves grew by the paper factor, not just the MediaBox.
11. Task list on the right: a single month is `pageCount(bytes) === 1` and a whole year
    (`yearPages`) is `pageCount(bytes) === 12` — the list column must not push the 14 rows or
    the day grid past 210 mm.

Page counting and geometry helpers (`tests/pdf-utils.ts`):

```ts
/** Counts `/Type /Page` objects, excluding `/Type /Pages`. */
export function pageCount(bytes: Uint8Array): number {
	const s = Buffer.from(bytes).toString('latin1');
	return (s.match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
}

export const PT_PER_MM = 72 / 25.4;

/** First `/MediaBox [a b c d]` match, as a width/height in points. Same heuristic caveat. */
export function mediaBox(bytes: Uint8Array): { widthPt: number; heightPt: number } | null;

/** Decodes every FlateDecode `stream…endstream` block to text, in document order. Used to read
 *  Chromium's content-stream `cm` transform for the (10) content-scale regression guard. */
export function contentStreams(bytes: Uint8Array): string[];
```

Document the caveat: this is a heuristic that works because we never produce object streams
with compressed cross-reference tables containing page dictionaries — Chromium's PDF writer
emits uncompressed page objects. If it ever proves flaky, switch to counting `/Count N` in the
page tree root. `mediaBox` shares the same caveat: it reads the first match, which is
sufficient because every page in one export shares one paper size.

### 12.5 HTTP — handler unit tests

**Recommendation: invoke the route handler directly, do not spin up a server.**

`src/routes/api/pdf/server.test.ts`:

```ts
vi.mock('$lib/server/pdf/instance', () => ({
	getPdfRenderer: () => ({ render: fakeRender, shutdown: async () => {} })
}));
import { POST } from './+server';

const form = new FormData();
form.set('options', JSON.stringify({ ...DEFAULT_OPTIONS, scope: 'month' }));
const res = await POST({
	request: new Request('http://x/api/pdf', { method: 'POST', body: form })
} as any);
```

This gives full status/header/body coverage with no process management, no port allocation and
no flakiness. A `vite preview`-based end-to-end test would add a Playwright dependency and a
second Chromium for essentially the same assertions — rejected.

Cases: happy month (200, `Content-Type`, `Content-Disposition` filename), happy year
(filename `calgen-2026.pdf`, 12 pages passed to the fake), the `RenderContext` (`id`, `scope`)
reaching the renderer, wrong content type → 415, an unparseable multipart body →
400 `invalid_multipart`, missing `options` → 400, malformed JSON → 400, each invalid field → 400 with its code, oversized image
→ 413, `image/gif` → 415, JPEG magic bytes mismatching a `image/png` declaration → 415,
renderer throwing `render_timeout` → 504, `renderer_busy` → 503, unknown throw → 500 with no
stack in the body.

`src/routes/healthz/server.test.ts`: 200, `status: 'ok'`, `Cache-Control: no-store`, and that
the renderer singleton was **not** touched.

### 12.6 Client

`src/lib/client/export.test.ts` with an injected `fetchImpl`: FormData shape, error mapping,
filename fallback — including that the serialised `options` part carries `imageZoom`, `imageX`
and `imageY` and does **not** carry `imageSize`. `errors.test.ts`: every code maps to a Swedish
string; unknown code falls back — the new `invalid_image_zoom` / `invalid_image_x` /
`invalid_image_y` need no new entry, they are covered by the existing `invalid_*` rule (§6.6).

`src/lib/client/image-transform.test.ts` (§6.9): the eighteen pure cases. No DOM, no fixtures.

`src/lib/client/app-state.test.ts` additionally: `toOptions` carries the three transform fields
and never `imageSize`; `setImage` and `clearImage` both reset the transform to `1 / 50 / 50` and
clear `imageSize`; `measureImage` with an injected measurer fills `imageSize`; a rejecting
measurer leaves `imageSize` null and does not throw out of the caller. `toOptions` also
projects `paperSize`: `createAppState()` defaults it to `'A4'` (the `toEqual(DEFAULT_OPTIONS)`
guard in `createAppState`'s own test forces this), and setting `app.paperSize = 'A3'` carries
through to `toOptions(app).paperSize`. Likewise `taskList` (default `'off'`) and
`taskListTitle` (default `''`): setting `'right'` / `'Inköp'` carries through to `toOptions`.
`export.test.ts` needs no new case: the `options` part is `JSON.stringify({ ...opts, scope })`
of whatever `toOptions` returns.

### 12.7 What is deliberately not automated

Visual fidelity of the app chrome, and pixel comparison of the PDF. Both are checked manually
against the prototype (§1.4) before the MR is opened; a screenshot of the preview and the first
page of a generated PDF go in the MR description.

---

## 13. Implementation plan

Ordered, TDD, one implementer. Each step ends green (`pnpm test && pnpm lint && pnpm check`)
and is a commit on `feat/calgen-service`.

**Step 1 — Scaffold.**
`pnpm dlx sv create …` (§11.1), adapter-node, `.gitignore`, `eslint.config.js` with the
`no-restricted-imports` layering rules, `prettier.config.js` (`printWidth: 100`),
`.githooks/pre-commit`, `vite.config.ts` carrying **both** the `sveltekit({ adapter, csp })`
options (§8.5) and the `server`/`integration` vitest projects (§11.3), `package.json` scripts
plus `packageManager`, `CLAUDE.md` skeleton. **Do not create `svelte.config.js`** (§2.5.6).
_Verify:_ `pnpm dev` serves a blank page; `pnpm test` runs zero tests successfully; the dev
page's response carries a `content-security-policy` header (proves the CSP is wired into the
plugin and not into a dead config file).

**Step 2 — `civil.ts`.** Tests first (§4.1 table, round-trip sweep, TZ invariance). Then the
implementation.

**Step 3 — `iso-week.ts`, `easter.ts`.** Tests from §4.2/§4.3 (including the 53-week year set
and the Easter property test), then implementations.

**Step 4 — `holidays.ts`.** Tests from §4.4 (boundary years 2026/2027 mandatory), then
implementation with `saturdayInRange` and the memoising `holidayMap`.

**Step 5 — `strings.ts`, `schemes.ts`, `fonts.ts`, `css.ts`.** Tests from §4.5–§4.7, then the
verbatim tables and helpers.

**Step 6 — `grid.ts`.** Tests from §4.8 (the 8-month table, the 2000–2100 sweep asserting
`rows ∈ {5,6}` with 952/260 split, the "clamp only adds rows" property, the 2027-02 trailing
row, the cell-year holiday lookup), then implementation.

**Step 7 — `view.ts`, `options.ts`.** Tests from §4.9/§4.10, then implementations.
_Checkpoint:_ the entire calendar domain is proven with zero framework code.

**Step 8 — `scripts/fetch-fonts.mjs` + font assets.** Run it; commit the 16 `woff2` files
(32 face entries), `fonts.json`, `fonts.css`, `OFL.txt`. Add a test asserting `fonts.json` covers all eight
families and all required weights, and that every referenced file exists on disk.

**Step 9 — `CalendarPage.svelte`.** Write `CalendarPage.ssr.test.ts` (§5.5) first — it will
fail to import. Then build the component from §5.2 with inline styles only.
_Verify:_ the inline snapshot is reviewed by eye against the prototype (§1.4).

**Step 10 — App UI.** `app.css` (Organic tokens + `@import '/fonts/fonts.css'`),
`app-state.svelte.ts`, `TopBar`, `Sidebar`, `PreviewStage`, `Toast`, `+page.svelte`,
`+layout.svelte`, `+layout.server.ts` (`maxUploadBytes`). Unit-test `app-state` transitions
(object-URL revoke on replace/clear) in **`app-state.test.ts`** — not `*.svelte.test.ts`,
which is never collected (§12) — and `errors.ts`.
_Verify manually:_ side-by-side with the prototype (§1.4) — all six schemes, all four fonts,
opacity extremes, a 6-row month (2026-08), a minimum-5-row month (2027-02) whose last row is
entirely next-month cells, a custom title, an image.

**Step 11 — Server plumbing.** `config.ts` (+ tests), `log.ts` (+ tests), `semaphore.ts`
(+ tests), `hooks.server.ts` with security headers and the request log, `routes/healthz`
(+ test).

**Step 12 — PDF service, faked.** `paper.test.ts` → `paper.ts` (§4.11), then `pdf/types.ts`,
`print-html.test.ts` → `print-html.ts`, `renderer.test.ts` (all cases in §7.6) → `renderer.ts`,
`fonts.ts` (`loadPrintFontCss` + path-resolver test).

**Step 13 — Real browser.** `puppeteer-browser.ts`, `instance.ts`, the `sveltekit:shutdown`
wiring, `renderer.integration.test.ts`.
_Verify:_ `CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
pnpm test:integration` passes on the Mac; open the produced PDF and check the page is A4
landscape with no white margin — specifically **look at the bottom edge**: the ~0.24 mm strip
outside the 210 mm page element must be the scheme background colour, not white (§7.4). Check
it on `natt`, where any leak is obvious. Then export A3, confirm 420 × 297 mm, one page, right
and bottom edges scheme colour not white — check on `natt`.

**Step 14 — HTTP endpoint.** `routes/api/pdf/server.test.ts` → `+server.ts`, including
`sniffImageType` and its tests.

**Step 15 — Export client.** `export.test.ts` → `export.ts`; wire the two top-bar buttons,
loading states and the toast.
_Verify manually:_ both exports download with the right filenames; the year PDF has 12 pages
with default month titles even when a custom title is set.

**Step 16 — Docker.** `Dockerfile`, `.dockerignore`. Build, run, `curl /healthz`, export a
year PDF from inside the container, confirm `docker stop` shuts down cleanly (log shows
`browser.shutdown`, exit code 0, no orphan Chromium).

**Step 17 — Docs & MR.** Finish `CLAUDE.md`; rewrite the repo `README.md` to describe the
service (keeping a short "design reference files" section); confirm no AI attribution anywhere;
open the MR with screenshots.

**Step 18 — Background pan and zoom** (added after 1.0; §1.2, §4.9, §6.9). Strictly in this
order, each half red before green:

1. `css.test.ts` → `pct()` in `css.ts` (§4.7).
2. `options.test.ts` and `types.ts`: the three fields, `DEFAULT_OPTIONS`, and the three
   validation branches in `parseCalendarOptions` (§3.1, §3.3, §4.10). Every existing
   `CalendarOptions` literal in the suite gains the three defaults; the compiler finds them.
3. `view.test.ts` → `ViewBackground` and `buildCalendarView`'s `background` (§4.9).
4. `CalendarPage.ssr.test.ts` assertions 17–22 → the new background-layer style string (§5.2).
   Re-record the snapshot (`vitest -u`) and **read the diff**: the only change must be that one
   `<div>`'s style attribute.
5. `image-transform.test.ts` → `image-transform.ts` (§6.9). Pure; no component yet.
6. `app-state.test.ts` → `imageSize`, `measureImage`, `resetImageTransform`, and the reset
   inside `setImage`/`clearImage` (§6.5).
7. Wire the UI: `PreviewStage.svelte` (§6.4.1), `Sidebar.svelte` (§6.3), `+page.svelte`. Not
   unit-tested — §12.7 already covers app chrome by manual check — so verify by hand:
   `pnpm dev`, load a photo, drag it, wheel it, arrow it with the keyboard, reset it, export
   the month and the year, and compare the PDF against the preview.
8. Add `image-transform.ts` to the file map in `CLAUDE.md`.

---

## 14. Findings, deviations, open questions

### 14.1 Minimum five rows — the prototype's formula is clamped (resolved)

The prototype's `rows = ceil((offset + daysInMonth) / 7)` yields **4** for a non-leap February
starting on a Monday — eleven times between 2000 and 2100 (2010-02, 2021-02, 2027-02, 2038-02,
2049-02, 2055-02, 2066-02, 2077-02, 2083-02, 2094-02, 2100-02). Because the grid rows are
`1fr`, those pages would render with noticeably taller day boxes than every other page, which
is most visible in a year export where eleven pages match and one does not.

**Product-owner decision: clamp to a minimum of five rows** —
`rows = max(5, ceil((offset + daysInMonth) / 7))` (§4.8). The extra row is entirely
next-month cells, styled like any other adjacent-month cells. With the clamp, 2000–2100
contains 952 five-row and 260 six-row months and **no four-row months**, so the README's
"N = 5 or 6 weeks as needed" is accurate as written and needs no correction. This is the only
place where the ported logic intentionally differs from the prototype's arithmetic.

### 14.2 Latent defect: holidays looked up in the wrong year

The prototype computes `hol = holidays(year)` for the _option_ year and looks up every grid
cell in it, including leading/trailing cells that belong to the adjacent year. For January the
grid can contain 29–31 December of the previous year; for December it can contain 1–3 January
of the next. Those lookups always miss.

Today the miss is invisible, because the `other` branch wins in both the background and
foreground expressions and `holiday` text is suppressed for other-month cells. It is a bug
waiting for the first change that makes adjacent-month holidays visible. §4.8 fixes it by
looking up `holidayMap(cell.date.year)`, at zero cost.

### 14.3 Year export vs. custom title — decided

The whole-year export **ignores** the custom title and uses `"<Månad> <År>"` for every page
(`yearPages` forces `title: ''`). Rationale: a custom title is inherently month-specific
("Vår trädgård i september"); repeating it on twelve pages produces twelve pages that look
identical at a glance and lose the month label entirely, which is the one thing a wall
calendar must have. Scheme, font, image, opacity and holiday settings **are** carried across
all twelve pages. The UI states this inline (§6.3) so it is not a surprise.

### 14.4 Two export buttons, not one

The README's top bar has a single primary button. The whole-year export requires a second
affordance; §6.2 adds a secondary outlined pill `Exportera hela året` to its left, using the
existing outlined-pill token from the sidebar's image button. A dropdown was rejected as
disproportionate. This is a visible, deliberate deviation from the handoff.

New Swedish copy not present in the prototype (**approved by the product owner as written** —
the implementer must use these strings verbatim, and any further new copy needs sign-off):

| String                                    | Where                                     |
| ----------------------------------------- | ----------------------------------------- |
| `Exportera hela året`                     | top-bar secondary button (§6.2)           |
| `Exporterar…`                             | primary button, busy state (§6.2)         |
| `Exporterar året…`                        | secondary button, busy state (§6.2)       |
| `Egen rubrik används inte vid årsexport.` | sidebar hint under the title input (§6.3) |
| all eight toast messages                  | §6.6                                      |

Pan/zoom copy (§1.2), likewise verbatim:

| String                                                               | Where                                        |
| -------------------------------------------------------------------- | -------------------------------------------- |
| `Zooma: {n} %`                                                       | sidebar zoom slider label (§6.3)             |
| `Dra i förhandsvisningen för att flytta bilden.`                     | sidebar hint under the zoom slider (§6.3)    |
| `Återställ bildens läge`                                             | sidebar reset button (§6.3)                  |
| `Flytta bakgrundsbilden. Dra med musen eller använd piltangenterna.` | `aria-label` of the preview surface (§6.4.1) |

Paper-size copy (§4.11, §6.3), approved as written — the product owner asked for the dimension
strings (`297 × 210 mm`, `420 × 297 mm`) to be dropped from the buttons, so only the name and
the hint remain:

| String                                                        | Where                                       |
| ------------------------------------------------------------- | ------------------------------------------- |
| `Pappersstorlek`                                              | sidebar section heading (§6.3)              |
| `A4`                                                          | paper-size button label (§6.3)              |
| `A3`                                                          | paper-size button label (§6.3)              |
| `Samma layout i båda storlekarna — A3 skalas proportionellt.` | sidebar hint under the paper buttons (§6.3) |

Task-list copy (§5.2, §6.3), decided by the product owner:

| String           | Where                                                      |
| ---------------- | ---------------------------------------------------------- |
| `Att göra`       | default task-list heading on the page; heading placeholder |
| `Att göra-lista` | sidebar section heading (§6.3)                             |
| `Av`             | task-list position button (§6.3)                           |
| `Vänster`        | task-list position button (§6.3)                           |
| `Höger`          | task-list position button (§6.3)                           |
| `Rubrik`         | `aria-label` of the task-list heading input (§6.3)         |

### 14.5 The prototype's `gap:-4px`

`<span style="display:flex;gap:-4px">` in the scheme swatches is invalid CSS and is ignored by
every browser; the actual overlap comes from `margin-left:-6px` on the 2nd and 3rd dots.
Dropped in §6.3. No visual change.

### 14.6 `satIn` can return `undefined`

`satIn(y, m, from, to)` has no fallback return. For the two ranges actually used (7 consecutive
days each) it always finds a Saturday, so it never fires — but the function's type is
`Date | undefined` and `addDays(undefined, -1)` would produce `Invalid Date` silently. §4.4
makes it throw.

### 14.7 TypeScript: use 6, defer 7

`sv` 0.17.0 scaffolds `typescript ^6.0.3`, and `svelte-check 4.7.6` + `typescript-eslint 8.69`
were verified to pass on it with zero errors. TypeScript **7.0.2** is `latest` on npm (the
native-port release), but ecosystem support across `svelte-check`, `typescript-eslint` and the
SvelteKit toolchain was not verified for this project. **Take what `sv` gives you (`^6`)** and
treat the 7.x upgrade as a separate change with its own green run.
Other verified current versions (2026-09-02): `svelte 5.57.0`, `@sveltejs/kit 2.70.3`,
`@sveltejs/adapter-node 5.5.7`, `vite 8.2.2`, `vitest 4.1.11`, `puppeteer-core 25.9.0`,
`playwright-core 1.62.1`, `eslint 10.9.1`, `prettier 3.9.6`, `svelte-check 4.7.6`, `sv 0.17.0`.
Node on this machine is v24.18.0, pnpm 11.17.0.

### 14.8 Risks

| Risk                                                                                                                                                                               | Likelihood         | Mitigation                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Year PDF produces 13 pages (trailing blank) or 24 (overflow)                                                                                                                       | medium             | `:last-child{break-after:auto}`; `overflow:hidden` on each page; the integration test asserts exactly 12                                                                                                                                                            |
| Chromium version drift breaks CDP calls                                                                                                                                            | low                | `puppeteer-core` speaks plain CDP; the render path uses `setContent`/`pdf` plus `Fetch.enable`/`fulfillRequest`/`failRequest` underneath request interception — all stable, long-lived commands. Pin the Debian base image tag                                      |
| Sandbox blocked by the container platform                                                                                                                                          | medium             | `CHROMIUM_NO_SANDBOX` escape hatch, documented with its cost                                                                                                                                                                                                        |
| 20 MB image → ~27 MB base64 + ~80 MB decoded RGBA in Chromium, per render                                                                                                          | medium             | `MAX_UPLOAD_BYTES` 20 MiB × `PDF_CONCURRENCY` 2 ⇒ container memory floor **1.5 GB** and `NODE_OPTIONS=--max-old-space-size=768` (§10), so Node throws a heap error instead of being OOM-killed. §14.10 is the fallback                                              |
| Background photo silently missing from the PDF above ~1.5 MB (a `data:` URL over Chromium's 2 MiB `url::kMaxURLChars` limit is dropped with no error, `hasImage:true` in the logs) | was high, now none | Photo served under a fixed URL via request interception (§7.1, §7.4, §7.5) instead of a `data:` URL; integration test renders with an image whose base64 form exceeds the limit and asserts an image XObject is present                                             |
| Signal handling hijacked (puppeteer `SIGINT` → `process.exit(130)`)                                                                                                                | high if defaulted  | `handleSIGINT/SIGTERM/SIGHUP: false` at launch (§7.5); `docker stop` drain verified in step 16                                                                                                                                                                      |
| CSP silently absent because config went into `svelte.config.js`                                                                                                                    | high if defaulted  | §2.5.6 forbids the file; step 1 verifies the `content-security-policy` response header                                                                                                                                                                              |
| `POST /api/pdf` returns 403 behind a proxy                                                                                                                                         | medium             | `ORIGIN` is required in production and `config.ts` refuses to start without it (§9)                                                                                                                                                                                 |
| Fonts not embedded (blank/fallback glyphs in PDF)                                                                                                                                  | low                | data-URI `@font-face` + `font-display:block` + `waitForFonts:true` + `--host-resolver-rules=MAP * ~NOTFOUND` + an integration assertion on `FontFile2`                                                                                                              |
| Someone adds a `<style>` block to `CalendarPage.svelte`                                                                                                                            | medium             | Test asserts the SSR body contains no `class="svelte-`                                                                                                                                                                                                              |
| Browser process leak under load                                                                                                                                                    | low                | Single shared browser, pages always closed in `finally`, `tini` reaps, semaphore bounds page count                                                                                                                                                                  |
| A3 scale rounding produces a trailing blank page                                                                                                                                   | low                | Factor rounded down (§4.11) so scaled content stays strictly inside the sheet; the 12-page integration assertion (§12.4) catches an overflow that would add one                                                                                                     |
| A3 content is not enlarged for the real, fully-populated day grid — realised, not hypothetical                                                                                     | occurred, fixed    | Root cause was `print-html.ts`'s `@page` rule staying fixed at 297 × 210 mm instead of tracking the requested paper (§7.4/§7.5's "Root cause and fix" note); fixed by passing `paper` into `buildPrintHtml`, with a content-stream regression guard (§12.4 item 10) |

### 14.9 Product-owner decisions — all resolved

No open questions remain. For the record:

1. **4-row Februaries** → **clamp to a minimum of 5 rows** (§4.8, §14.1). Rendered output
   changes; the README's "5 or 6 weeks" becomes accurate.
2. **`ORIGIN`** → **required in production**; `config.ts` fails fast without it, and §8.3
   documents the bare-403 symptom when it is wrong (§9, §10).
3. **20 MB upload limit** → **unchanged at 20 MiB**; the memory cost is absorbed by the
   1.5 GB container floor and the Node heap cap (§10).
4. **Font path resolution** → always `static/fonts` via the single `fontsDir()` helper,
   overridable by `FONTS_DIR` (§7.3).
5. **The ~0.24 mm bottom sliver** → painted by `html, body { background: <scheme bg> }` in the
   print template. The page element is **never** enlarged past 210 mm (§7.4).
6. **New Swedish copy** → approved as written (§14.4).
7. **Pan and zoom of the background photo** → **in scope** (§1.2), zoom range 100–400 %, one
   transform shared by all twelve pages of a year export, dragged directly in the preview.
   **Crop remains out of scope** (§1.3). Pan/zoom copy approved as written (§14.4).
8. **Paper size** → **A4/A3**, A4 default, A3 produced by proportional scaling with no
   re-layout — `CalendarPage.svelte` is unchanged and never reads `options.paperSize` (§2.5.3,
   §4.11). Filenames gain a `-a3` suffix; A4 filenames are unchanged. The scale factor is
   `1.414`, rounded down (§4.11). Paper-size copy is approved as written, with the dimension
   strings dropped from the buttons per the product owner (§14.4). `print-html.ts`'s
   `@page` rule tracks the requested paper (§7.4), which is what makes the scaled content fill
   the A3 sheet (§7.5's "Root cause and fix" note).

### 14.10 Deliberate simplifications (with their tradeoffs)

- **No server-side image downscaling.** Chromium already downsamples to the printed raster
  during PDF generation, so a 20 MP photo does not linearly inflate the PDF. Adding a resizer
  means adding `sharp` (a native, platform-specific dependency, ~40 MB in the image) to save
  memory we have measured as acceptable. If exports start OOMing, the cheaper first move is
  lowering `MAX_UPLOAD_BYTES`, then switching the image transport from an inline data URI to
  `page.setRequestInterception` + `request.respond(buffer)` (§7.1's `PageLike` would grow two
  methods). Not now.
- **No browser pool beyond one instance.** One Chromium with `PDF_CONCURRENCY` pages is
  simpler and uses far less memory than N browsers. Scale horizontally with replicas.
- **No streaming PDF response.** `page.pdf()` returns a buffer; the whole PDF is ≤ a few MB.
- **No `vite preview` end-to-end suite** (§12.5).

### 14.11 Pan/zoom: the alternatives that were rejected

Recorded because each one looks cheaper than the enlarged box (§4.9) until it is written down.

- **`transform: scale(z) translate(…)` on the background layer.** Needs the photo's aspect
  ratio to turn a focal-point percentage into a translation — a number layer 1 does not have
  and, by §3.1, must never need. It also puts a transform inside a page that §2.5.3 keeps
  transform-free, and makes preview and print depend on Chromium's rasterisation of a
  transformed layer rather than on plain layout.
- **`background-size: {z*100}% auto` instead of an enlarged box.** `cover` and a percentage
  size are not interchangeable: which axis a percentage binds to depends on the photo's aspect,
  so `z = 1` would no longer reduce to today's rendering for every photo.
- **Sending the photo's natural size to the server** so the server can compute pixel offsets.
  Adds two more validated fields, another way for client and server to disagree, and buys
  nothing — the §4.9 form is aspect-ratio-free.
- **Cropping on the client into a new `File`.** Would mean decoding and re-encoding a 20 MB
  photo in the browser, a canvas round-trip, quality loss, and a second source of truth about
  what the PDF contains. Crop stays out of scope (§1.3).
- **Zoom about the cursor on wheel.** A second reference frame and a second set of tests, for
  a refinement the drag plus the slider already deliver. §6.4.1 keeps the focal point fixed.
