import type { CalendarOptions, ExportScope } from '$lib/calendar/types';

/** One intercepted request, answered or aborted by the renderer before `setContent` resolves. */
export interface InterceptedRequest {
	url(): string;
	respond(response: { status: number; contentType: string; body: Uint8Array }): Promise<void>;
	abort(): Promise<void>;
}

/** The smallest slice of a Chromium page this service needs. A fake is about 20 lines. */
export interface PageLike {
	// `'networkidle0'`/`'networkidle2'` are excluded because puppeteer-core 25's
	// `SetContentWaitForOptions` itself excludes them — nothing here passes them anyway
	// (`renderer.ts` always passes `'load'`).
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

export interface PdfMargin {
	top: string;
	right: string;
	bottom: string;
	left: string;
}

export interface PdfOptions {
	width: string;
	height: string;
	printBackground: boolean;
	preferCSSPageSize: boolean;
	margin: PdfMargin;
	scale: number;
	landscape: boolean;
	displayHeaderFooter: boolean;
	tagged: boolean;
	outline: boolean;
	waitForFonts: boolean;
	timeout: number;
}

export interface RenderJob {
	/** One entry per PDF page; length 1 or 12. */
	pages: CalendarOptions[];
	/**
	 * The background photo's raw bytes and validated MIME type, or `null`. Served to the print
	 * page via request interception rather than a `data:` URL — Chromium silently drops any URL
	 * over 2 MiB (`url::kMaxURLChars`), which a base64-encoded phone photo routinely exceeds.
	 */
	image: { bytes: Uint8Array; type: string } | null;
}

/** Observability context for one render. Carried into the log lines, never into the output. */
export interface RenderContext {
	/** Correlation id from `event.locals.id`. */
	id?: string;
	scope?: ExportScope;
}

export interface PdfRenderer {
	render(job: RenderJob, context?: RenderContext): Promise<Uint8Array>;
	shutdown(): Promise<void>;
}

/** Error codes the endpoint maps straight onto HTTP statuses. */
export type RenderErrorCode =
	'renderer_busy' | 'render_timeout' | 'renderer_unavailable' | 'internal_error';

export class RenderError extends Error {
	constructor(
		readonly code: RenderErrorCode,
		message: string = code
	) {
		super(message);
		this.name = 'RenderError';
	}
}
