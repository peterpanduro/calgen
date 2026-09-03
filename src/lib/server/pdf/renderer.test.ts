import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPdfRenderer } from './renderer';
import { RenderError, type BrowserLike, type PageLike, type RenderJob } from './types';
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
}

/** A logger that keeps every line, so a test can assert what was emitted. */
function recordingLogger() {
	const lines: LogLine[] = [];
	const log = createLogger('debug', (line) => lines.push(JSON.parse(line)));
	return { log, lines, errors: () => lines.filter((l) => l.event === 'pdf.error') };
}

interface Recorder {
	setContentCalls: string[];
	pdfCalls: number;
	newPageCalls: number;
	closedPages: number;
	browserCloses: number;
}

function fakeBrowser(options: { pdf?: () => Promise<Uint8Array>; connected?: boolean } = {}) {
	const rec: Recorder = {
		setContentCalls: [],
		pdfCalls: 0,
		newPageCalls: 0,
		closedPages: 0,
		browserCloses: 0
	};
	const browser: BrowserLike = {
		connected: options.connected ?? true,
		async newPage(): Promise<PageLike> {
			rec.newPageCalls++;
			return {
				async setContent(html) {
					rec.setContentCalls.push(html);
				},
				async pdf() {
					rec.pdfCalls++;
					return options.pdf ? await options.pdf() : FAKE_PDF;
				},
				async close() {
					rec.closedPages++;
				}
			};
		},
		async close() {
			rec.browserCloses++;
		}
	};
	return { browser, rec };
}

const job = (pages = [DEFAULT_OPTIONS], imageDataUrl: string | null = null): RenderJob => ({
	pages,
	imageDataUrl
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

	it('switches the page to the CSS variable when an image is supplied', async () => {
		const { browser, rec } = fakeBrowser();
		const renderer = createPdfRenderer(deps(async () => browser));
		await renderer.render(job([DEFAULT_OPTIONS], 'data:image/jpeg;base64,AAAA'));
		expect(rec.setContentCalls[0]).toContain('background-image:var(--calgen-bg)');
		expect(rec.setContentCalls[0]).toContain(
			':root{--calgen-bg:url("data:image/jpeg;base64,AAAA")}'
		);
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
		await expect(renderer.render(job([]))).rejects.toMatchObject({ code: 'internal_error' });
	});
});
