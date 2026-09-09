import { describe, expect, it } from 'vitest';
import { parseCalendarOptions, pdfFilename, stripScope, yearPages } from './options';
import { DEFAULT_OPTIONS, type ExportRequest } from './types';

const VALID: ExportRequest = { ...DEFAULT_OPTIONS, scope: 'month' };

const parse = (patch: Record<string, unknown>) => parseCalendarOptions({ ...VALID, ...patch });

describe('parseCalendarOptions — accepted input', () => {
	it('round-trips a valid request', () => {
		const result = parseCalendarOptions(VALID);
		expect(result).toEqual({ ok: true, value: VALID });
	});

	it('accepts a custom title with Swedish characters', () => {
		const result = parse({ title: 'Vår trädgård' });
		expect(result.ok && result.value.title).toBe('Vår trädgård');
	});

	it('accepts an empty title', () => {
		expect(parse({ title: '' }).ok).toBe(true);
	});

	it('accepts the range boundaries', () => {
		expect(parse({ year: 2000, month: 0, opacity: 30 }).ok).toBe(true);
		expect(parse({ year: 2100, month: 11, opacity: 100 }).ok).toBe(true);
	});

	it('accepts the image-transform boundaries', () => {
		expect(parse({ imageZoom: 1, imageX: 0, imageY: 0 }).ok).toBe(true);
		expect(parse({ imageZoom: 4, imageX: 100, imageY: 100 }).ok).toBe(true);
	});

	it('round-trips a fractional transform unrounded and unclamped', () => {
		const result = parse({ imageZoom: 1.5, imageX: 33.33, imageY: 66.67 });
		expect(result.ok && result.value).toMatchObject({
			imageZoom: 1.5,
			imageX: 33.33,
			imageY: 66.67
		});
	});

	it('accepts the year scope', () => {
		const result = parse({ scope: 'year' });
		expect(result.ok && result.value.scope).toBe('year');
	});

	it('ignores unknown extra keys', () => {
		const result = parse({ nonsense: 1 });
		expect(result.ok && 'nonsense' in result.value).toBe(false);
	});
});

describe('parseCalendarOptions — rejected input', () => {
	it.each([null, [], 'string', 42, undefined])('rejects %j as invalid_options', (input) => {
		const result = parseCalendarOptions(input);
		expect(result).toMatchObject({ ok: false, code: 'invalid_options' });
	});

	it.each([
		[{ year: 1999 }, 'invalid_year'],
		[{ year: 2101 }, 'invalid_year'],
		[{ year: 2026.5 }, 'invalid_year'],
		[{ year: '2026' }, 'invalid_year'],
		[{ month: -1 }, 'invalid_month'],
		[{ month: 12 }, 'invalid_month'],
		[{ month: 1.5 }, 'invalid_month'],
		[{ schemeId: 'regnbåge' }, 'invalid_scheme'],
		[{ schemeId: 3 }, 'invalid_scheme'],
		[{ fontId: 'gotisk' }, 'invalid_font'],
		[{ opacity: 29 }, 'invalid_opacity'],
		[{ opacity: 101 }, 'invalid_opacity'],
		[{ opacity: 88.5 }, 'invalid_opacity'],
		[{ showHolidays: 'yes' }, 'invalid_show_holidays'],
		[{ showHolidays: 1 }, 'invalid_show_holidays'],
		[{ title: 42 }, 'invalid_title'],
		[{ title: 'x'.repeat(121) }, 'invalid_title'],
		[{ imageZoom: 0.99 }, 'invalid_image_zoom'],
		[{ imageZoom: 4.01 }, 'invalid_image_zoom'],
		[{ imageZoom: '2' }, 'invalid_image_zoom'],
		[{ imageZoom: Number.NaN }, 'invalid_image_zoom'],
		[{ imageZoom: Number.POSITIVE_INFINITY }, 'invalid_image_zoom'],
		[{ imageX: -0.01 }, 'invalid_image_x'],
		[{ imageX: 100.01 }, 'invalid_image_x'],
		[{ imageX: Number.NaN }, 'invalid_image_x'],
		[{ imageX: '50' }, 'invalid_image_x'],
		[{ imageY: -0.01 }, 'invalid_image_y'],
		[{ imageY: 100.01 }, 'invalid_image_y'],
		[{ imageY: Number.NaN }, 'invalid_image_y'],
		[{ imageY: Number.NEGATIVE_INFINITY }, 'invalid_image_y'],
		[{ scope: 'week' }, 'invalid_scope'],
		[{ scope: undefined }, 'invalid_scope']
	])('rejects %j with %s', (patch, code) => {
		expect(parse(patch)).toMatchObject({ ok: false, code });
	});

	it('rejects a title containing a control character', () => {
		// Escape written deliberately — never paste a literal control byte.
		expect(parse({ title: 'a\u0009b' })).toMatchObject({ ok: false, code: 'invalid_title' });
		expect(parse({ title: 'a\u007Fb' })).toMatchObject({ ok: false, code: 'invalid_title' });
	});

	it('accepts a 120-character title', () => {
		expect(parse({ title: 'x'.repeat(120) }).ok).toBe(true);
	});

	it('carries an English developer-facing message', () => {
		const result = parse({ year: 1999 });
		expect(result.ok).toBe(false);
		expect(!result.ok && result.message).toMatch(/year/i);
	});
});

describe('stripScope', () => {
	it('drops the scope key entirely', () => {
		const stripped = stripScope(VALID);
		expect('scope' in stripped).toBe(false);
		expect(stripped).toEqual(DEFAULT_OPTIONS);
	});
});

describe('yearPages', () => {
	const pages = yearPages({
		...VALID,
		title: 'Vår trädgård',
		imageZoom: 2.5,
		imageX: 10,
		imageY: 90
	});

	it('produces twelve pages, January to December', () => {
		expect(pages).toHaveLength(12);
		expect(pages.map((p) => p.month)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
	});

	it('drops the custom title from every page', () => {
		expect(pages.every((p) => p.title === '')).toBe(true);
	});

	it('carries scheme, font, opacity and holidays across every page', () => {
		expect(pages.every((p) => p.schemeId === 'organic' && p.opacity === 88)).toBe(true);
		expect(pages.every((p) => !('scope' in p))).toBe(true);
	});

	it('carries one image transform across every page', () => {
		expect(pages.every((p) => p.imageZoom === 2.5 && p.imageX === 10 && p.imageY === 90)).toBe(
			true
		);
	});
});

describe('pdfFilename', () => {
	it('names a month export', () => {
		expect(pdfFilename({ ...VALID, scope: 'month' })).toBe('calgen-2026-09.pdf');
	});

	it('zero-pads a single-digit month', () => {
		expect(pdfFilename({ ...VALID, month: 0, scope: 'month' })).toBe('calgen-2026-01.pdf');
	});

	it('names a year export', () => {
		expect(pdfFilename({ ...VALID, scope: 'year' })).toBe('calgen-2026.pdf');
	});
});
