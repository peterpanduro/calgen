import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomBytes } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { createPdfRenderer } from './renderer';
import { puppeteerBrowserFactory, resolveChromiumPathOrNull } from './puppeteer-browser';
import { parseConfig } from '../config';
import { loadPrintFontCss } from '../fonts';
import { createLogger } from '../log';
import { yearPages } from '$lib/calendar/options';
import { DEFAULT_OPTIONS, type CalendarOptions } from '$lib/calendar/types';
import { asLatin1, hasImageXObject, isPdf, pageCount } from '../../../../tests/pdf-utils';

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
	return { bytes: new Uint8Array(bytes), type: 'image/jpeg' };
};

/** One PNG chunk: 4-byte length, type, data, CRC-32 over type+data. */
function pngChunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(typeAndData) >>> 0, 0);
	return Buffer.concat([length, typeAndData, crc]);
}

/**
 * A valid PNG built from random pixel data, with no fixture on disk. Random bytes barely
 * compress, so `deflateSync(..., { level: 0 })` (store, not compress) keeps the encoded size
 * close to the raw size — large enough that its base64 form comfortably exceeds Chromium's
 * 2,097,152-char URL limit (verified threshold: 2,097,091 renders, 2,097,223 does not).
 */
function randomPng(width: number, height: number): Uint8Array {
	const rowBytes = width * 3;
	const raw = Buffer.alloc((rowBytes + 1) * height);
	for (let y = 0; y < height; y++) {
		const rowStart = y * (rowBytes + 1);
		raw[rowStart] = 0; // filter type: None
		randomBytes(rowBytes).copy(raw, rowStart + 1);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // colour type: truecolor (RGB)
	// bytes 10-12 (compression, filter, interlace) default to 0
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	return new Uint8Array(
		Buffer.concat([
			signature,
			pngChunk('IHDR', ihdr),
			pngChunk('IDAT', deflateSync(raw, { level: 0 })),
			pngChunk('IEND', Buffer.alloc(0))
		])
	);
}

const month = (over: Partial<CalendarOptions> = {}): CalendarOptions => ({
	...DEFAULT_OPTIONS,
	...over
});

describe.skipIf(!exe)('pdf integration (real Chromium)', () => {
	afterAll(async () => {
		await renderer.shutdown();
	});

	it('renders a single month as a one-page PDF', async () => {
		const bytes = await renderer.render({ pages: [month()], image: null });
		expect(isPdf(bytes)).toBe(true);
		expect(pageCount(bytes)).toBe(1);
		expect(bytes.length).toBeGreaterThan(20_000);
	});

	it('renders a whole year as exactly twelve pages, with no trailing blank', async () => {
		const bytes = await renderer.render({
			pages: yearPages(DEFAULT_OPTIONS),
			image: null
		});
		expect(pageCount(bytes)).toBe(12);
	});

	it('renders a background image without adding pages', async () => {
		const plain = await renderer.render({ pages: [month()], image: null });
		const withImage = await renderer.render({ pages: [month()], image: tinyJpeg() });
		expect(pageCount(withImage)).toBe(1);
		expect(withImage.length).toBeGreaterThan(plain.length);
		expect(hasImageXObject(plain)).toBe(false);
		expect(hasImageXObject(withImage)).toBe(true);
	});

	it('renders a zoomed and panned background as one page', async () => {
		const bytes = await renderer.render({
			pages: [month({ imageZoom: 2, imageX: 25, imageY: 50 })],
			image: tinyJpeg()
		});
		expect(isPdf(bytes)).toBe(true);
		expect(pageCount(bytes)).toBe(1);
	});

	it('embeds the heading font as a subset', async () => {
		const bytes = await renderer.render({ pages: [month()], image: null });
		const text = asLatin1(bytes);
		expect(text).toContain('FontFile2');
		expect(text).toMatch(/[A-Z]{6}\+Caprasimo/);
	});

	it('renders a second scheme and font pairing', async () => {
		const bytes = await renderer.render({
			pages: [month({ schemeId: 'natt', fontId: 'klassisk' })],
			image: null
		});
		expect(pageCount(bytes)).toBe(1);
		expect(asLatin1(bytes)).toMatch(/[A-Z]{6}\+PlayfairDisplay/);
	});

	it("renders a background photo whose data-URL form exceeds Chromium's 2 MiB URL limit", async () => {
		const image = { bytes: randomPng(800, 800), type: 'image/png' };
		const dataUrlLength =
			'data:image/png;base64,'.length + Buffer.from(image.bytes).toString('base64').length;
		expect(dataUrlLength).toBeGreaterThan(2_097_152);

		const plain = await renderer.render({ pages: [month()], image: null });
		const bytes = await renderer.render({ pages: [month()], image });
		expect(isPdf(bytes)).toBe(true);
		expect(pageCount(bytes)).toBe(1);
		expect(hasImageXObject(plain)).toBe(false);
		expect(hasImageXObject(bytes)).toBe(true);
		expect(bytes.length).toBeGreaterThan(plain.length);
	});
});
