import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterAll, describe, expect, it } from 'vitest';
import { createPdfRenderer } from './renderer';
import { puppeteerBrowserFactory, resolveChromiumPathOrNull } from './puppeteer-browser';
import { parseConfig } from '../config';
import { loadPrintFontCss } from '../fonts';
import { createLogger } from '../log';
import { yearPages } from '$lib/calendar/options';
import { DEFAULT_OPTIONS, type CalendarOptions } from '$lib/calendar/types';
import { asLatin1, isPdf, pageCount } from '../../../../tests/pdf-utils';

const exe = resolveChromiumPathOrNull(process.env.CHROMIUM_PATH);

const config = parseConfig({ ...process.env, CHROMIUM_PATH: exe ?? undefined });
const renderer = createPdfRenderer({
	launch: puppeteerBrowserFactory(config),
	loadFontCss: loadPrintFontCss,
	concurrency: 1,
	timeoutMs: 45_000,
	queueTimeoutMs: 30_000,
	log: createLogger('error', () => {})
});

const tinyJpeg = () => {
	const bytes = readFileSync(path.resolve(process.cwd(), 'tests/fixtures/tiny.jpg'));
	return `data:image/jpeg;base64,${bytes.toString('base64')}`;
};

const month = (over: Partial<CalendarOptions> = {}): CalendarOptions => ({
	...DEFAULT_OPTIONS,
	...over
});

describe.skipIf(!exe)('pdf integration (real Chromium)', () => {
	afterAll(async () => {
		await renderer.shutdown();
	});

	it('renders a single month as a one-page PDF', async () => {
		const bytes = await renderer.render({ pages: [month()], imageDataUrl: null });
		expect(isPdf(bytes)).toBe(true);
		expect(pageCount(bytes)).toBe(1);
		expect(bytes.length).toBeGreaterThan(20_000);
	});

	it('renders a whole year as exactly twelve pages, with no trailing blank', async () => {
		const bytes = await renderer.render({
			pages: yearPages(DEFAULT_OPTIONS),
			imageDataUrl: null
		});
		expect(pageCount(bytes)).toBe(12);
	});

	it('renders a background image without adding pages', async () => {
		const plain = await renderer.render({ pages: [month()], imageDataUrl: null });
		const withImage = await renderer.render({ pages: [month()], imageDataUrl: tinyJpeg() });
		expect(pageCount(withImage)).toBe(1);
		expect(withImage.length).toBeGreaterThan(plain.length);
	});

	it('embeds the heading font as a subset', async () => {
		const bytes = await renderer.render({ pages: [month()], imageDataUrl: null });
		const text = asLatin1(bytes);
		expect(text).toContain('FontFile2');
		expect(text).toMatch(/[A-Z]{6}\+Caprasimo/);
	});

	it('renders a second scheme and font pairing', async () => {
		const bytes = await renderer.render({
			pages: [month({ schemeId: 'natt', fontId: 'klassisk' })],
			imageDataUrl: null
		});
		expect(pageCount(bytes)).toBe(1);
		expect(asLatin1(bytes)).toMatch(/[A-Z]{6}\+PlayfairDisplay/);
	});
});
