import type { CalendarOptions, ExportScope } from '$lib/calendar/types';

/** The smallest slice of a Chromium page this service needs. A fake is about 20 lines. */
export interface PageLike {
	setContent(
		html: string,
		options?: { waitUntil?: 'load' | 'networkidle0'; timeout?: number }
	): Promise<void>;
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
	/** `data:` URL for the background photo, or `null`. */
	imageDataUrl: string | null;
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
