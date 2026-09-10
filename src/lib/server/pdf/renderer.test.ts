import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPdfRenderer } from './renderer';
import { BACKGROUND_IMAGE_URL } from './print-html';
import {
	RenderError,
	type BrowserLike,
	type InterceptedRequest,
	type PageLike,
	type PdfOptions,
	type RenderJob
} from './types';
import { createLogger } from '../log';
import { DEFAULT_OPTIONS } from '$lib/calendar/types';
import { yearPages } from '$lib/calendar/options';

const FAKE_PDF = Buffer.from('%PDF-1.4 fake');
const silent = createLogger('error', () => {});

interface LogLine {
	level: string;
	event: string;
	code?: string;
	message?: string;
	id?: string;
	scope?: string;
	ms?: number;
	url?: string;
}

/** A logger that keeps every line, so a test can assert what was emitted. */
function recordingLogger() {
	const lines: LogLine[] = [];
	const log = createLogger('debug', (line) => lines.push(JSON.parse(line)));
	return { log, lines, errors: () => lines.filter((l) => l.event === 'pdf.error') };
}

interface RequestOutcome {
	url: string;
	respondedWith?: { status: number; contentType: string; body: Uint8Array };
	aborted?: boolean;
}

interface Recorder {
	setContentCalls: string[];
	pdfCalls: number;
	pdfOptions: PdfOptions[];
	newPageCalls: number;
	closedPages: number;
	browserCloses: number;
	/** Call order across one page's lifecycle, so tests can assert interception is set up first. */
	callOrder: string[];
	interceptionEnabled: boolean[];
	requestHandler: ((request: InterceptedRequest) => void) | null;
}

function fakeBrowser(options: { pdf?: () => Promise<Uint8Array>; connected?: boolean } = {}) {
	const rec: Recorder = {
		setContentCalls: [],
		pdfCalls: 0,
		pdfOptions: [],
		newPageCalls: 0,
		closedPages: 0,
		browserCloses: 0,
		callOrder: [],
		interceptionEnabled: [],
		requestHandler: null
	};
	const browser: BrowserLike = {
		connected: options.connected ?? true,
		async newPage(): Promise<PageLike> {
			rec.newPageCalls++;
			rec.callOrder.push('newPage');
			return {
				async setRequestInterception(enabled) {
					rec.interceptionEnabled.push(enabled);
					rec.callOrder.push(`setRequestInterception:${enabled}`);
				},
				on(event, handler) {
					if (event === 'request') rec.requestHandler = handler;
					return undefined;
				},
				async setContent(html) {
					rec.setContentCalls.push(html);
					rec.callOrder.push('setContent');
				},
				async pdf(pdfOptions) {
					rec.pdfCalls++;
					rec.callOrder.push('pdf');
					rec.pdfOptions.push(pdfOptions);
					return options.pdf ? await options.pdf() : FAKE_PDF;
				},
				async close() {
					rec.closedPages++;
					rec.callOrder.push('close');
				}
			};
		},
		async close() {
			rec.browserCloses++;
		}
	};
	return { browser, rec };
}

/** Fires the fake page's registered `request` handler and reports how it resolved. */
async function emitRequest(rec: Recorder, url: string): Promise<RequestOutcome> {
	const outcome: RequestOutcome = { url };
	if (!rec.requestHandler) throw new Error('no request handler registered');
	rec.requestHandler({
		url: () => url,
		respond: async (response) => {
			outcome.respondedWith = response;
		},
		abort: async () => {
			outcome.aborted = true;
		}
	});
	await Promise.resolve();
	return outcome;
}

const job = (pages = [DEFAULT_OPTIONS], image: RenderJob['image'] = null): RenderJob => ({
	pages,
	image
});

const deps = (
	launch: () => Promise<BrowserLike>,
	over: Partial<Parameters<typeof createPdfRenderer>[0]> = {}
) => ({
	launch,
	loadFontCss: async () => '@font-face{font-family:"Figtree"}',
	concurrency: 2,
	timeoutMs: 1000,
	queueTimeoutMs: 1000,
	log: silent,
	...over
});

describe('happy path', () => {
	it('returns the bytes the browser produced', async () => {
		const { browser } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		expect(Buffer.from(await renderer.render(job()))).toEqual(FAKE_PDF);
	});

	it('feeds Chromium a document containing the calendar page', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await renderer.render(job());
		expect(rec.setContentCalls[0]).toContain('class="calgen-page"');
		expect(rec.setContentCalls[0]).toContain('September 2026');
	});

	it('renders a twelve-page job as one document and one pdf call', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await renderer.render(job(yearPages(DEFAULT_OPTIONS)));
		expect(rec.setContentCalls).toHaveLength(1);
		expect(rec.setContentCalls[0].split('class="calgen-page"')).toHaveLength(13);
		expect(rec.pdfCalls).toBe(1);
	});

	it('requests A4 as 297×210mm at scale 1', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await renderer.render(job([{ ...DEFAULT_OPTIONS, paperSize: 'A4' }]));
		expect(rec.pdfOptions[0]).toMatchObject({ width: '297mm', height: '210mm', scale: 1 });
	});

	it('requests A3 as 420×297mm at scale 1.414', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await renderer.render(job([{ ...DEFAULT_OPTIONS, paperSize: 'A3' }]));
		expect(rec.pdfOptions[0]).toMatchObject({ width: '420mm', height: '297mm', scale: 1.414 });
	});

	it('renders a twelve-page A3 job as one pdf call', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await renderer.render(job(yearPages({ ...DEFAULT_OPTIONS, paperSize: 'A3' })));
		expect(rec.pdfCalls).toBe(1);
		expect(rec.pdfOptions[0]).toMatchObject({ width: '420mm', height: '297mm', scale: 1.414 });
	});

	it('renders identical print HTML for an A4 and an otherwise-identical A3 job, except @page', async () => {
		// print-html.ts's `@page` rule MUST track the requested paper (that is the A3 fix), so
		// the two documents cannot be string-equal any more; everything else still must match.
		const a4 = fakeBrowser();
		const a3 = fakeBrowser();
		const a4Renderer = createPdfRenderer(deps(async () => a4.browser));
		const a3Renderer = createPdfRenderer(deps(async () => a3.browser));
		await a4Renderer.render(job([{ ...DEFAULT_OPTIONS, paperSize: 'A4' }]));
		await a3Renderer.render(job([{ ...DEFAULT_OPTIONS, paperSize: 'A3' }]));
		const stripPageSize = (html: string) => html.replace(/@page \{ size: [^}]+\}/, '@page { }');
		expect(stripPageSize(a3.rec.setContentCalls[0])).toBe(stripPageSize(a4.rec.setContentCalls[0]));
		expect(a4.rec.setContentCalls[0]).toContain('@page { size: 297mm 210mm; margin: 0 }');
		expect(a3.rec.setContentCalls[0]).toContain('@page { size: 420mm 297mm; margin: 0 }');
	});

	it('switches the page to the CSS variable pointing at the fixed URL when an image is supplied', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await renderer.render(
			job([DEFAULT_OPTIONS], { bytes: new Uint8Array([1, 2, 3]), type: 'image/jpeg' })
		);
		expect(rec.setContentCalls[0]).toContain('background-image:var(--calgen-bg)');
		expect(rec.setContentCalls[0]).toContain(`:root{--calgen-bg:url("${BACKGROUND_IMAGE_URL}")}`);
		expect(rec.setContentCalls[0]).not.toContain('data:image');
	});

	it('uses no background image when none is supplied', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await renderer.render(job());
		expect(rec.setContentCalls[0]).toContain('background-image:none');
		expect(rec.setContentCalls[0]).not.toContain('--calgen-bg');
	});

	it('balances newPage and close', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await renderer.render(job());
		await renderer.render(job());
		expect(rec.newPageCalls).toBe(2);
		expect(rec.closedPages).toBe(2);
	});

	it('closes the page even when pdf() rejects', async () => {
		const { browser, rec } = fakeBrowser({
			pdf: async () => {
				throw new Error('boom');
			}
		});
		const renderer = createPdfRenderer(deps(async () => browser));
		await expect(renderer.render(job())).rejects.toThrow();
		expect(rec.closedPages).toBe(1);
	});
});

describe('request interception', () => {
	it('enables interception before setContent, on every render, image or not', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await renderer.render(job());
		expect(rec.interceptionEnabled).toEqual([true]);
		expect(rec.callOrder.indexOf('setRequestInterception:true')).toBeLessThan(
			rec.callOrder.indexOf('setContent')
		);
	});

	it("answers the background URL with the job's bytes and declared type", async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		const bytes = new Uint8Array([9, 9, 9]);
		await renderer.render(job([DEFAULT_OPTIONS], { bytes, type: 'image/png' }));
		const outcome = await emitRequest(rec, BACKGROUND_IMAGE_URL);
		expect(outcome.respondedWith).toEqual({ status: 200, contentType: 'image/png', body: bytes });
		expect(outcome.aborted).toBeUndefined();
	});

	it('aborts any request that is not the background URL', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await renderer.render(
			job([DEFAULT_OPTIONS], { bytes: new Uint8Array([1]), type: 'image/jpeg' })
		);
		const outcome = await emitRequest(rec, 'https://example.com/exfiltrate');
		expect(outcome.aborted).toBe(true);
		expect(outcome.respondedWith).toBeUndefined();
	});

	it('aborts the background URL too when no image was supplied', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await renderer.render(job());
		const outcome = await emitRequest(rec, BACKGROUND_IMAGE_URL);
		expect(outcome.aborted).toBe(true);
		expect(outcome.respondedWith).toBeUndefined();
	});

	it('never leaves an unhandled rejection when respond() rejects (puppeteer double-handled)', async () => {
		const seen: unknown[] = [];
		const onUnhandled = (reason: unknown) => seen.push(reason);
		process.on('unhandledRejection', onUnhandled);
		try {
			const recorder = recordingLogger();
			const { browser, rec } = fakeBrowser();
			const renderer = createPdfRenderer(deps(async () => browser, { log: recorder.log }));
			await renderer.render(
				job([DEFAULT_OPTIONS], { bytes: new Uint8Array([1]), type: 'image/jpeg' })
			);
			if (!rec.requestHandler) throw new Error('no request handler registered');
			// Rig `respond()` to reject, as puppeteer's own `verifyInterception()` does when the
			// request was already handled elsewhere — this must not become an unhandled rejection.
			rec.requestHandler({
				url: () => BACKGROUND_IMAGE_URL,
				respond: async () => {
					throw new Error('Request is already handled!');
				},
				abort: async () => {}
			});
			await new Promise((r) => setTimeout(r, 10));
			expect(seen).toEqual([]);
			expect(recorder.lines.filter((l) => l.event === 'pdf.intercept')).toEqual([
				expect.objectContaining({
					event: 'pdf.intercept',
					url: BACKGROUND_IMAGE_URL,
					message: 'Request is already handled!'
				})
			]);
		} finally {
			process.off('unhandledRejection', onUnhandled);
		}
	});
});

describe('browser lifecycle', () => {
	it('launches once across two concurrent renders', async () => {
		const { browser } = fakeBrowser();
		const launch = vi.fn(async () => browser);
		const renderer = createPdfRenderer(deps(launch));
		await Promise.all([renderer.render(job()), renderer.render(job())]);
		expect(launch).toHaveBeenCalledOnce();
	});

	it('maps a failing launch to renderer_unavailable and retries next time', async () => {
		const { browser } = fakeBrowser();
		const launch = vi
			.fn<() => Promise<BrowserLike>>()
			.mockRejectedValueOnce(new Error('no chromium'))
			.mockResolvedValue(browser);
		const renderer = createPdfRenderer(deps(launch));
		await expect(renderer.render(job())).rejects.toMatchObject({ code: 'renderer_unavailable' });
		await expect(renderer.render(job())).resolves.toBeDefined();
		expect(launch).toHaveBeenCalledTimes(2);
	});

	it('relaunches exactly once when the memoised browser is disconnected', async () => {
		const dead = fakeBrowser({ connected: false });
		const live = fakeBrowser();
		const launch = vi
			.fn<() => Promise<BrowserLike>>()
			.mockResolvedValueOnce(dead.browser)
			.mockResolvedValue(live.browser);
		const renderer = createPdfRenderer(deps(launch));
		await expect(renderer.render(job())).resolves.toBeDefined();
		expect(launch).toHaveBeenCalledTimes(2);
		expect(dead.rec.newPageCalls).toBe(0);
		expect(live.rec.pdfCalls).toBe(1);
	});
});

describe('concurrency and timeouts', () => {
	it('serialises renders at concurrency 1', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		let started = 0;
		const { browser } = fakeBrowser({
			pdf: async () => {
				started++;
				await gate;
				return FAKE_PDF;
			}
		});
		const renderer = createPdfRenderer(deps(async () => browser, { concurrency: 1 }));
		const both = Promise.all([renderer.render(job()), renderer.render(job())]);
		await new Promise((r) => setTimeout(r, 10));
		expect(started).toBe(1);
		release();
		await both;
		expect(started).toBe(2);
	});

	it('rejects with renderer_busy when the queue wait expires', async () => {
		const gate = new Promise<Uint8Array>(() => {});
		const { browser } = fakeBrowser({ pdf: () => gate });
		const renderer = createPdfRenderer(
			deps(async () => browser, { concurrency: 1, queueTimeoutMs: 10, timeoutMs: 5000 })
		);
		void renderer.render(job()).catch(() => {});
		await new Promise((r) => setTimeout(r, 5));
		await expect(renderer.render(job())).rejects.toMatchObject({ code: 'renderer_busy' });
	});

	it('logs renderer_busy, which is thrown before the main try-block', async () => {
		const recorder = recordingLogger();
		const gate = new Promise<Uint8Array>(() => {});
		const { browser } = fakeBrowser({ pdf: () => gate });
		const renderer = createPdfRenderer(
			deps(async () => browser, {
				concurrency: 1,
				queueTimeoutMs: 10,
				timeoutMs: 5000,
				log: recorder.log
			})
		);
		void renderer.render(job()).catch(() => {});
		await new Promise((r) => setTimeout(r, 5));
		await renderer.render(job(), { id: 'req-busy', scope: 'month' }).catch(() => {});
		expect(recorder.errors()).toHaveLength(1);
		expect(recorder.errors()[0]).toMatchObject({
			event: 'pdf.error',
			code: 'renderer_busy',
			id: 'req-busy',
			scope: 'month'
		});
		expect(typeof recorder.errors()[0].ms).toBe('number');
		expect(recorder.errors()[0].message).toBeTruthy();
	});

	it('rejects with render_timeout and closes the page when pdf() hangs', async () => {
		const { browser, rec } = fakeBrowser({ pdf: () => new Promise<Uint8Array>(() => {}) });
		const renderer = createPdfRenderer(deps(async () => browser, { timeoutMs: 20 }));
		await expect(renderer.render(job())).rejects.toMatchObject({ code: 'render_timeout' });
		await new Promise((r) => setTimeout(r, 10));
		expect(rec.closedPages).toBe(1);
	});

	it('frees the slot after a timeout', async () => {
		const { browser } = fakeBrowser({ pdf: () => new Promise<Uint8Array>(() => {}) });
		const renderer = createPdfRenderer(
			deps(async () => browser, { concurrency: 1, timeoutMs: 20, queueTimeoutMs: 200 })
		);
		await expect(renderer.render(job())).rejects.toMatchObject({ code: 'render_timeout' });
		await expect(renderer.render(job())).rejects.toMatchObject({ code: 'render_timeout' });
	});
});

describe('shutdown', () => {
	let renderer: ReturnType<typeof createPdfRenderer>;
	let rec: Recorder;

	beforeEach(async () => {
		const fake = fakeBrowser();
		rec = fake.rec;
		renderer = createPdfRenderer(deps(async () => fake.browser));
		await renderer.render(job());
	});

	it('closes the browser', async () => {
		await renderer.shutdown();
		expect(rec.browserCloses).toBe(1);
	});

	it('makes further renders fail with renderer_unavailable', async () => {
		await renderer.shutdown();
		await expect(renderer.render(job())).rejects.toMatchObject({ code: 'renderer_unavailable' });
	});

	it('is idempotent', async () => {
		await renderer.shutdown();
		await renderer.shutdown();
		expect(rec.browserCloses).toBe(1);
	});

	it('is safe before the browser was ever launched', async () => {
		const fresh = createPdfRenderer(deps(async () => fakeBrowser().browser));
		await expect(fresh.shutdown()).resolves.toBeUndefined();
	});

	it('logs the post-shutdown renderer_unavailable, thrown before the main try-block', async () => {
		const recorder = recordingLogger();
		const fake = fakeBrowser();
		const stopped = createPdfRenderer(deps(async () => fake.browser, { log: recorder.log }));
		await stopped.shutdown();
		await stopped.render(job(), { id: 'req-gone', scope: 'year' }).catch(() => {});
		expect(recorder.errors()).toHaveLength(1);
		expect(recorder.errors()[0]).toMatchObject({
			event: 'pdf.error',
			code: 'renderer_unavailable',
			id: 'req-gone',
			scope: 'year'
		});
		expect(recorder.errors()[0].message).toBeTruthy();
	});
});

describe('every failure reaches pdf.error exactly once', () => {
	it('logs a render_timeout once', async () => {
		const recorder = recordingLogger();
		const { browser } = fakeBrowser({ pdf: () => new Promise<Uint8Array>(() => {}) });
		const renderer = createPdfRenderer(
			deps(async () => browser, { timeoutMs: 20, log: recorder.log })
		);
		await renderer.render(job(), { id: 'req-slow', scope: 'month' }).catch(() => {});
		expect(recorder.errors()).toHaveLength(1);
		expect(recorder.errors()[0]).toMatchObject({ code: 'render_timeout', id: 'req-slow' });
	});

	it('logs a failed launch once, as renderer_unavailable with its diagnostic message', async () => {
		const recorder = recordingLogger();
		const renderer = createPdfRenderer(
			deps(
				async () => {
					throw new Error('No Chromium executable found. Searched: /usr/bin/chromium');
				},
				{ log: recorder.log }
			)
		);
		await renderer.render(job(), { id: 'req-nochrome', scope: 'month' }).catch(() => {});
		expect(recorder.errors()).toHaveLength(1);
		expect(recorder.errors()[0].code).toBe('renderer_unavailable');
		expect(recorder.errors()[0].message).toContain('Searched:');
	});

	it('logs a successful render as pdf.render and nothing as pdf.error', async () => {
		const recorder = recordingLogger();
		const { browser } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser, { log: recorder.log }));
		await renderer.render(job(), { id: 'req-ok', scope: 'month' });
		expect(recorder.errors()).toHaveLength(0);
		expect(recorder.lines.filter((l) => l.event === 'pdf.render')).toHaveLength(1);
	});
});

describe('RenderError', () => {
	it('carries its code', () => {
		expect(new RenderError('renderer_busy').code).toBe('renderer_busy');
	});
});

describe('the render budget covers the whole job, not just printing', () => {
	/** Records unhandled rejections for the duration of one test. */
	function watchUnhandled() {
		const seen: unknown[] = [];
		const onUnhandled = (reason: unknown) => seen.push(reason);
		process.on('unhandledRejection', onUnhandled);
		return {
			seen,
			stop: () => process.off('unhandledRejection', onUnhandled)
		};
	}

	it('rejects with render_timeout when a cold launch outlives the budget', async () => {
		const { browser } = fakeBrowser();
		const slowLaunch = () =>
			new Promise<BrowserLike>((resolve) => setTimeout(() => resolve(browser), 120));
		const renderer = createPdfRenderer(deps(slowLaunch, { timeoutMs: 20 }));
		await expect(renderer.render(job())).rejects.toMatchObject({ code: 'render_timeout' });
	});

	it('never leaves the budget rejection unhandled, which would kill the process', async () => {
		const watcher = watchUnhandled();
		try {
			const { browser } = fakeBrowser();
			const slowLaunch = () =>
				new Promise<BrowserLike>((resolve) => setTimeout(() => resolve(browser), 60));
			const renderer = createPdfRenderer(deps(slowLaunch, { timeoutMs: 10 }));
			await expect(renderer.render(job())).rejects.toMatchObject({ code: 'render_timeout' });
			// Let the launch settle and any stray rejection surface.
			await new Promise((r) => setTimeout(r, 120));
			expect(watcher.seen).toEqual([]);
		} finally {
			watcher.stop();
		}
	});

	it('rejects with render_timeout when font loading outlives the budget', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(
			deps(async () => browser, {
				timeoutMs: 20,
				loadFontCss: () => new Promise<string>((resolve) => setTimeout(() => resolve(''), 120))
			})
		);
		await expect(renderer.render(job())).rejects.toMatchObject({ code: 'render_timeout' });
		expect(rec.newPageCalls).toBe(0);
	});

	it('frees the slot so a later render still succeeds after a slow launch', async () => {
		const { browser } = fakeBrowser();
		let calls = 0;
		const launch = () =>
			new Promise<BrowserLike>((resolve) =>
				setTimeout(() => resolve(browser), calls++ === 0 ? 120 : 0)
			);
		const renderer = createPdfRenderer(deps(launch, { timeoutMs: 40, concurrency: 1 }));
		await expect(renderer.render(job())).rejects.toMatchObject({ code: 'render_timeout' });
		await new Promise((r) => setTimeout(r, 140));
		await expect(renderer.render(job())).resolves.toBeDefined();
	});

	it('closes a page opened after the budget already expired', async () => {
		const { browser, rec } = fakeBrowser();
		const slowNewPage: BrowserLike = {
			connected: true,
			newPage: () => new Promise((resolve) => setTimeout(() => resolve(browser.newPage()), 60)),
			close: () => browser.close()
		};
		const renderer = createPdfRenderer(deps(async () => slowNewPage, { timeoutMs: 20 }));
		await expect(renderer.render(job())).rejects.toMatchObject({ code: 'render_timeout' });
		await new Promise((r) => setTimeout(r, 120));
		expect(rec.newPageCalls).toBe(1);
		expect(rec.closedPages).toBe(1);
	});
});

describe('shutdown races', () => {
	it('does not orphan a browser launched after shutdown began', async () => {
		const { browser, rec } = fakeBrowser();
		const slowFont = () => new Promise<string>((resolve) => setTimeout(() => resolve(''), 40));
		const renderer = createPdfRenderer(
			deps(async () => browser, { loadFontCss: slowFont, timeoutMs: 5000 })
		);
		const pending = renderer.render(job()).catch((e) => e);
		await new Promise((r) => setTimeout(r, 10));
		await renderer.shutdown();
		await pending;
		await new Promise((r) => setTimeout(r, 60));
		expect(rec.newPageCalls).toBe(0);
		expect(rec.browserCloses).toBeLessThanOrEqual(1);
	});
});

describe('job validation', () => {
	it('rejects a job with no pages instead of indexing past the end', async () => {
		const { browser } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await expect(renderer.render(job([]))).rejects.toMatchObject({
			code: 'internal_error',
			message: 'Render job carries no pages'
		});
	});
});
