import { render } from 'svelte/server';
import CalendarPage from '$lib/components/CalendarPage.svelte';
import { getFont, type FontPairing } from '$lib/calendar/fonts';
import { getScheme } from '$lib/calendar/schemes';
import { createSemaphore } from '../semaphore';
import type { Logger } from '../log';
import { buildPrintHtml } from './print-html';
import {
	RenderError,
	type BrowserFactory,
	type BrowserLike,
	type PageLike,
	type PdfOptions,
	type PdfRenderer,
	type RenderContext,
	type RenderJob
} from './types';

export interface RendererDeps {
	launch: BrowserFactory;
	loadFontCss: (fonts: FontPairing[]) => Promise<string>;
	/** `PDF_CONCURRENCY` — simultaneous Chromium pages. */
	concurrency: number;
	/** `PDF_TIMEOUT_MS` — budget for the whole newPage → setContent → pdf → close sequence. */
	timeoutMs: number;
	/** `PDF_QUEUE_TIMEOUT_MS` — how long a request may wait for a slot. */
	queueTimeoutMs: number;
	/** Resolved Chromium path, for the `browser.launch` log line. Optional so fakes can omit it. */
	executablePath?: () => string | null;
	log: Logger;
}

const PDF_OPTIONS = (timeout: number): PdfOptions => ({
	width: '297mm',
	height: '210mm',
	printBackground: true,
	// Explicit width/height wins; `true` was measured as worse (a 209.9 mm page box).
	preferCSSPageSize: false,
	margin: { top: '0', right: '0', bottom: '0', left: '0' },
	scale: 1,
	landscape: false,
	displayHeaderFooter: false,
	tagged: false,
	outline: false,
	waitForFonts: true,
	timeout
});

interface Budget {
	/** Rejects with `render_timeout` once the budget is spent. Never unhandled. */
	readonly promise: Promise<never>;
	/** True once the budget has expired, so long-running steps can bail out early. */
	readonly expired: boolean;
	cancel(): void;
}

/**
 * A render budget, so a wedged Chromium cannot hold a request open forever.
 *
 * The rejection handler is attached at creation: without it, a budget that expires before
 * anything races it is an unhandled rejection, which terminates the Node process.
 */
function createBudget(ms: number): Budget {
	let expired = false;
	let timer: ReturnType<typeof setTimeout>;
	const promise = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			expired = true;
			reject(new RenderError('render_timeout'));
		}, ms);
	});
	promise.catch(() => {});
	return {
		promise,
		get expired() {
			return expired;
		},
		cancel: () => clearTimeout(timer)
	};
}

/**
 * Creates the process-wide PDF renderer.
 *
 * One lazily launched browser, one page per concurrent render, one `setContent` and one
 * `pdf()` per job whether the job is one month or a whole year.
 */
export function createPdfRenderer(deps: RendererDeps): PdfRenderer {
	const semaphore = createSemaphore(deps.concurrency);
	let browserPromise: Promise<BrowserLike> | null = null;
	let stopped = false;

	async function launch(): Promise<BrowserLike> {
		// Re-checked here, not only at the top of render(): a job that passed that check and then
		// awaited the semaphore or the fonts would otherwise launch a browser shutdown() has
		// already stopped tracking, orphaning it.
		if (stopped) throw new RenderError('renderer_unavailable', 'Renderer is shut down');
		if (!browserPromise) {
			const started = Date.now();
			browserPromise = deps.launch().then((browser) => {
				deps.log.info('browser.launch', {
					ms: Date.now() - started,
					executablePath: deps.executablePath?.() ?? null
				});
				return browser;
			});
			browserPromise.catch(() => {
				browserPromise = null;
			});
		}
		return browserPromise;
	}

	/** Returns a connected browser, relaunching at most once if the memoised one is dead. */
	async function connectedBrowser(): Promise<BrowserLike> {
		let browser: BrowserLike;
		try {
			browser = await launch();
		} catch (cause) {
			throw new RenderError('renderer_unavailable', (cause as Error).message);
		}
		if (browser.connected === false) {
			deps.log.warn('browser.reconnect', {});
			browserPromise = null;
			try {
				browser = await launch();
			} catch (cause) {
				throw new RenderError('renderer_unavailable', (cause as Error).message);
			}
		}
		return browser;
	}

	async function buildHtml(job: RenderJob): Promise<string> {
		if (job.pages.length === 0)
			throw new RenderError('internal_error', 'Render job carries no pages');
		const imageCss = job.imageDataUrl ? 'var(--calgen-bg)' : 'none';
		const rendered = job.pages.map((options) =>
			render(CalendarPage, { props: { options, imageCss } })
		);
		const fontCss = await deps.loadFontCss([getFont(job.pages[0].fontId)]);
		return buildPrintHtml({
			pages: rendered.map((r) => r.body),
			// Every page renders the same component, so their heads are identical; emit one copy.
			head: [...new Set(rendered.map((r) => r.head))].join(''),
			fontCss,
			imageDataUrl: job.imageDataUrl,
			pageBg: getScheme(job.pages[0].schemeId).bg
		});
	}

	/**
	 * Prints one document. `open` exposes the live page so the timeout path can close it: when
	 * `pdf()` hangs, this function's own `finally` never runs.
	 *
	 * The budget is re-checked after every await. Without that, a page opened just after the
	 * budget expired would keep working outside the semaphore, transiently exceeding
	 * `PDF_CONCURRENCY` and leaking a tab.
	 */
	async function printOn(
		browser: BrowserLike,
		html: string,
		open: { page: PageLike | null },
		budget: Budget
	): Promise<Uint8Array> {
		try {
			open.page = await browser.newPage();
			if (budget.expired) throw new RenderError('render_timeout');
			await open.page.setContent(html, { waitUntil: 'load', timeout: deps.timeoutMs });
			if (budget.expired) throw new RenderError('render_timeout');
			return await open.page.pdf(PDF_OPTIONS(deps.timeoutMs));
		} finally {
			await closeQuietly(open);
		}
	}

	async function closeQuietly(open: { page: PageLike | null }): Promise<void> {
		const page = open.page;
		open.page = null;
		if (page) await page.close().catch(() => {});
	}

	return {
		async render(job: RenderJob, context: RenderContext = {}): Promise<Uint8Array> {
			const entered = Date.now();

			/**
			 * Logs `pdf.error` and throws. The renderer is the single site that logs a
			 * `RenderError` (SPEC §8.6), so the two early exits below — which happen before the
			 * main try-block — have to go through here or nothing records them at all.
			 */
			const fail = (error: RenderError, since = entered): never => {
				deps.log.warn('pdf.error', {
					id: context.id,
					scope: context.scope,
					code: error.code,
					message: error.message,
					ms: Date.now() - since
				});
				throw error;
			};

			if (stopped) fail(new RenderError('renderer_unavailable', 'Renderer is shut down'));

			let release: () => void;
			try {
				release = await semaphore.acquire(deps.queueTimeoutMs);
			} catch (cause) {
				return fail(new RenderError('renderer_busy', (cause as Error).message ?? 'renderer_busy'));
			}

			const started = Date.now();
			const budget = createBudget(deps.timeoutMs);
			const open: { page: PageLike | null } = { page: null };

			// The budget covers the WHOLE job. A cold Chromium launch can take tens of seconds,
			// and racing only the printing step let a slow launch blow the budget with nothing
			// listening to the rejection.
			const job$ = (async () => {
				const html = await buildHtml(job);
				const browser = await connectedBrowser();
				return printOn(browser, html, open, budget);
			})();

			try {
				const bytes = await Promise.race([job$, budget.promise]);
				deps.log.info('pdf.render', {
					id: context.id,
					scope: context.scope,
					pages: job.pages.length,
					bytes: bytes.length,
					ms: Date.now() - started,
					hasImage: job.imageDataUrl !== null
				});
				return bytes;
			} catch (cause) {
				const error =
					cause instanceof RenderError
						? cause
						: new RenderError('internal_error', (cause as Error).message);
				// The timeout path abandons a page that printOn's own finally will never reach.
				await closeQuietly(open);
				// The losing branch of the race must not surface as an unhandled rejection.
				job$.catch(() => {});
				return fail(error, started);
			} finally {
				budget.cancel();
				release();
			}
		},

		async shutdown(): Promise<void> {
			if (stopped) return;
			stopped = true;
			const pending = browserPromise;
			browserPromise = null;
			if (!pending) return;
			try {
				await (await pending).close();
				deps.log.info('browser.shutdown', {});
			} catch {
				// A browser that is already gone is a successful shutdown.
			}
		}
	};
}
