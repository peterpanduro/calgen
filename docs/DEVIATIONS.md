# Deviations from `docs/SPEC.md`

Every place the implementation differs from the specification, with the reason. The end state
of the branch is otherwise the specification, literally.

---

## 1. `BODY_SIZE_LIMIT` is only enforced in production (§9)

**Spec:** `config.ts` "fails fast if it is unset, or below `MAX_UPLOAD_BYTES + 1 MiB`".

**Implementation:** both checks are gated on `NODE_ENV === 'production'`, the same gate the
spec already puts on `ORIGIN`.

**Reason:** `config.ts` is imported at module load. Enforcing the check unconditionally makes
`pnpm dev`, `pnpm test` and `pnpm check` throw unless every developer exports
`BODY_SIZE_LIMIT` first. The variable is read by adapter-node, which is only in play for the
built server — i.e. exactly the production case. The spec's own rationale agrees: "its job is
purely to refuse to start on a combination that would fail at runtime". `config.test.ts`
covers both halves (production throws, development does not).

## 2. The production fail-fast checks are inert while the build runs (§9)

`config.ts` parses `process.env` at module load. SvelteKit's post-build `analyse` step imports
every server module with `NODE_ENV=production` but none of the deployment variables set, so an
unguarded check makes `pnpm build` fail with
`Invalid configuration: ORIGIN must be set in production`.

`parseConfig` therefore takes a second parameter, `deploying`, passed as `!building` from
`$app/environment`. The checks fire when the built server actually starts, and stay inert while
Kit is building. `config.test.ts` drives the pure function directly, so both paths are covered.

## 3. `config.ts` was written during step 10 rather than step 11 (§13)

`src/routes/+layout.server.ts` (step 10) needs `config.maxUploadBytes`, so `config.ts` and its
tests landed one step early, in their own commit. Nothing else moved; the rest of step 11
(`log.ts`, `semaphore.ts`, `hooks.server.ts`, `healthz`) landed where the plan puts it.

## 4. `imageCss` also rejects `(` (§4.7)

The spec lists `"`, `)`, `\`, `<` and control characters. The implementation's character class
additionally covers `(` for symmetry with `)`. Strictly a superset of the required rejection;
no valid `blob:` or `data:` URL contains that character.

## 5. Measured container image size is 1.08 GB, not ~450 MB (§10)

The spec estimates "~450 MB (node slim ~200 MB + chromium ~230 MB)". The image actually built
and tested here (`node:24-trixie-slim`, arm64) is **1.08 GB**: the `chromium` apt layer alone is
710 MB on trixie, plus ~98 MB of pruned production `node_modules`. Nothing in the Dockerfile
deviates from the spec; only the documented expectation was wrong. `README.md` and `CLAUDE.md`
carry the measured figure. The spec's own note stands: this is documented, not optimised, and
`chromium-headless-shell` remains the rejected alternative.

## 6. App chrome uses scoped `<style>` blocks, not inline `style` attributes (§6.2, §6.3)

§6 writes the top bar, sidebar, preview stage and toast as inline `style` strings. They are
implemented as Svelte scoped `<style>` blocks instead, with **every declared value unchanged**.

**Reason:** the design calls for hover states (`background:#b2622d` on the primary button,
`#ffe1d0` on the two outlined pills) and disabled states. An inline `style` attribute wins over
any stylesheet rule, so keeping the values inline would mean either `!important` or tracking
hover in component state — both worse code for no visual difference. The rule that genuinely
matters, §2.5.1, is scoped to `CalendarPage.svelte`, which remains inline-only and is guarded by
a source-file assertion.

## 7. The image-picker label carries its own focus rule (§6.3)

§6.3 specifies `input:focus-visible, select:focus-visible, button:focus-visible`. `Sidebar.svelte`
adds one scoped rule, `.file-pill:has(input:focus-visible)`, with the identical outline.

**Reason:** the "Välj bild…" control is a `<label>` wrapping a file input. The input has to be
hidden, so no global `:focus-visible` rule can reach it, and the label is not itself focusable.

An earlier revision hid the input with `display:none` and used `label:focus-within` instead.
Both halves were wrong and are fixed: `display:none` removes the input from the tab order
entirely (the control could not be reached by keyboard at all, so `:focus-within` could never
fire), and `:focus-within` has no keyboard heuristic, so it painted an outline on the checkbox
and slider labels on every mouse click. The input is now visually hidden but focusable
(`position:absolute;width:1px;height:1px;opacity:0;pointer-events:none`). §6.3 of the spec has
been updated to describe this.

## 8. The `CalendarPage` regression snapshot is external, not inline (§5.5 assertion 16)

`toMatchSnapshot()` writing `src/lib/components/__snapshots__/CalendarPage.ssr.test.ts.snap`,
rather than `toMatchInlineSnapshot()`. The rendered body is ~30 KB of one-line HTML; inlining it
would bury the fifteen readable assertions above it in the same file. Same regression net, same
review workflow (`vitest -u` to accept a deliberate change).

## 9. `PdfRenderer.render` takes an optional second argument (§7.1, §8.6)

§8.6 requires `id` and `scope` on the `pdf.render` log line, but §7.1's `render(job)` signature
gives the renderer no way to learn either. `render(job, context?: RenderContext)` adds them as
observability-only data; `RenderJob` stays a pure description of what to draw. §7.1 and §8.6
have been updated.

Related: a `RenderError` is now logged **once**, by the renderer. Previously both the renderer
and the endpoint logged `pdf.error`, and the endpoint's copy dropped the diagnostic `message` —
so `renderer_unavailable` reached the log without the list of Chromium paths that were searched.
The response body is unchanged and still generic.

## 10. New error code `invalid_multipart` (§3.4)

`request.formData()` throws on a truncated or malformed body. Unguarded, that escaped as
SvelteKit's `handleError` HTML page rather than the `{error, message}` shape §3.4 promises for
every API failure. Added to the §3.4 table as a 400, and to §8.4's handler outline. The client's
Swedish toast needs no new entry: `invalid_*` already maps to "Ogiltiga inställningar…".

## 11. `Cache-Control: no-store` on HTML is applied in `hooks.server.ts` (§8.1)

§8.1 requires it on the app document but does not say who sets it, and nothing did — `GET /`
shipped with only an `ETag`. `handle` now sets it on any response whose `Content-Type` starts
with `text/html`. Hashed assets keep Kit's immutable caching. §8.1 records the mechanism.

## 12. The `preview` script supplies `ORIGIN` and `BODY_SIZE_LIMIT` (§11.3)

`vite preview` sets `NODE_ENV=production` while `building` is false, so the fail-fast checks
from deviation #1/#2 fire and `pnpm preview` died out of the box. The script now bakes in
`ORIGIN=http://localhost:4173 BODY_SIZE_LIMIT=24M`. §9 and §11.3 updated.

## 13. `Toast.svelte` nests a `<button>` inside `role="status"` (§6.7)

§6.7 puts `role="status" aria-live="polite"` on the toast itself and makes it dismissible by
click. A clickable `<div role="status">` is not keyboard-operable, and `<button role="status">`
is an invalid role for an interactive element. The live region is therefore the wrapper and the
dismiss control is a real `<button>` inside it. The button carries `title="Stäng meddelande"`,
**not** `aria-label`: an `aria-label` would replace the button's accessible name, so the live
region would announce "Stäng meddelande" and drop the actual message. Same visual result,
correct semantics.

## 14. `loadPrintFontCss` takes the directory as a parameter (§7.3)

§7.3 makes `fontsDir()` "the single helper", but `config.ts` had grown a second copy of the same
resolution and `loadPrintFontCss` re-read `FONTS_DIR` itself, so `config.fontsDir` was only ever
used by the startup log. `fontsDir(override?)` is now genuinely the only resolver:
`config.fontsDir` is its output, and `loadPrintFontCss(pairings, dir = fontsDir())` receives it
from the composition root. Tests pass a fixture directory instead of mutating `process.env`.
§7.3 updated.
