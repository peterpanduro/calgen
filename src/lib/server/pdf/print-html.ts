export interface PrintHtmlInput {
	/** `render(CalendarPage, …).body` per PDF page. */
	pages: string[];
	/** `@font-face` rules with `data:` URIs. */
	fontCss: string;
	/** `data:` URL for the background photo, or `null`. */
	imageDataUrl: string | null;
	/** Scheme `bg`; paints the ~0.24 mm sliver Chromium leaves at the page foot (SPEC §7.4). */
	pageBg: string;
	/** Concatenated `render().head`, forwarded so a future `<svelte:head>` cannot break print. */
	head?: string;
}

/**
 * Builds the standalone document Chromium prints.
 *
 * The background photo is emitted **once** as a custom property, so a twelve-page year export
 * carries one copy of a 27 MB data URL rather than twelve.
 */
export function buildPrintHtml({
	pages,
	fontCss,
	imageDataUrl,
	pageBg,
	head = ''
}: PrintHtmlInput): string {
	const rootVars = imageDataUrl ? `:root{--calgen-bg:url("${imageDataUrl}")}` : '';
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
