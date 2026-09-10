/**
 * The URL the print page's background photo is served under. Answered by request interception
 * in `renderer.ts` before `setContent` resolves; `.invalid` is a reserved TLD (RFC 2606) so the
 * request can never leave interception even if it somehow escaped (defence in depth alongside
 * `--host-resolver-rules=MAP * ~NOTFOUND`).
 */
export const BACKGROUND_IMAGE_URL = 'https://calgen.invalid/background';

export interface PrintHtmlInput {
	/** `render(CalendarPage, …).body` per PDF page. */
	pages: string[];
	/** `@font-face` rules with `data:` URIs. */
	fontCss: string;
	/** Whether a background photo was uploaded. */
	hasImage: boolean;
	/** Scheme `bg`; paints the ~0.24 mm sliver Chromium leaves at the page foot (SPEC §7.4). */
	pageBg: string;
	/** Concatenated `render().head`, forwarded so a future `<svelte:head>` cannot break print. */
	head?: string;
}

/**
 * Builds the standalone document Chromium prints.
 *
 * The background photo is emitted **once** as a custom property referencing
 * {@link BACKGROUND_IMAGE_URL}, so a twelve-page year export carries one short URL rather than
 * twelve copies of the photo — and, unlike a `data:` URL, one that never exceeds Chromium's
 * 2 MiB URL length limit no matter how large the photo is.
 */
export function buildPrintHtml({
	pages,
	fontCss,
	hasImage,
	pageBg,
	head = ''
}: PrintHtmlInput): string {
	const rootVars = hasImage ? `:root{--calgen-bg:url("${BACKGROUND_IMAGE_URL}")}` : '';
	const sections = pages.map((body) => `<div class="calgen-page">${body}</div>`).join('');

	return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><title>CalGen</title>
${head}<style>${fontCss}</style>
<style>
  @page { size: 297mm 210mm; margin: 0 }
  html, body { margin: 0; padding: 0; background: ${pageBg};
               -webkit-print-color-adjust: exact; print-color-adjust: exact }
  * { box-sizing: border-box }
  .calgen-page { width: 297mm; height: 210mm; overflow: hidden;
                 break-inside: avoid; break-after: page; page-break-after: always }
  .calgen-page:last-child { break-after: auto; page-break-after: auto }
  ${rootVars}
</style>
</head><body>${sections}</body></html>`;
}
