import { FONTS } from './fonts';
import { SCHEMES } from './schemes';
import {
	DEFAULT_OPTIONS,
	type CalendarOptions,
	type ExportRequest,
	type ExportScope,
	type FontId,
	type SchemeId
} from './types';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

const fail = (code: string, message: string): ParseResult<never> => ({ ok: false, code, message });

const MAX_TITLE_LENGTH = 120;
// Escapes written deliberately — never paste literal control bytes into this file.
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const SCHEME_IDS: ReadonlySet<string> = new Set(SCHEMES.map((s) => s.id));
const FONT_IDS: ReadonlySet<string> = new Set(FONTS.map((f) => f.id));

const isIntBetween = (v: unknown, lo: number, hi: number): v is number =>
	typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

// The three image-transform fields are the only non-integer numbers in the payload: a drag
// produces fractions. `Number.isFinite` still rejects NaN and ±Infinity, which would otherwise
// serialise into the style string as `left:NaN%` and be dropped silently by the browser.
const isFiniteBetween = (v: unknown, lo: number, hi: number): v is number =>
	typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/**
 * Validates an untrusted payload into an {@link ExportRequest}.
 *
 * Pure and total: it never throws and it clamps nothing — out-of-range values are rejected so
 * the API cannot silently render something the caller did not ask for.
 */
export function parseCalendarOptions(input: unknown): ParseResult<ExportRequest> {
	if (typeof input !== 'object' || input === null || Array.isArray(input))
		return fail('invalid_options', 'Options payload must be a JSON object.');

	const o = input as Record<string, unknown>;

	if (!isIntBetween(o.year, 2000, 2100))
		return fail('invalid_year', 'Field "year" must be an integer between 2000 and 2100.');
	if (!isIntBetween(o.month, 0, 11))
		return fail('invalid_month', 'Field "month" must be an integer between 0 and 11.');
	if (typeof o.schemeId !== 'string' || !SCHEME_IDS.has(o.schemeId))
		return fail('invalid_scheme', 'Field "schemeId" must be a known colour scheme id.');
	if (typeof o.fontId !== 'string' || !FONT_IDS.has(o.fontId))
		return fail('invalid_font', 'Field "fontId" must be a known font pairing id.');
	if (!isIntBetween(o.opacity, 30, 100))
		return fail('invalid_opacity', 'Field "opacity" must be an integer between 30 and 100.');
	if (typeof o.showHolidays !== 'boolean')
		return fail('invalid_show_holidays', 'Field "showHolidays" must be a boolean.');
	if (
		typeof o.title !== 'string' ||
		o.title.length > MAX_TITLE_LENGTH ||
		CONTROL_CHARS.test(o.title)
	)
		return fail(
			'invalid_title',
			`Field "title" must be a string of at most ${MAX_TITLE_LENGTH} characters with no control characters.`
		);
	// The three image-transform fields are optional for backward compatibility: a request built
	// before this feature existed never sends them, and omitting them must keep rendering the
	// pre-feature `cover`/`center` geometry rather than fail. Only a genuinely missing key
	// defaults — `null` is present and invalid, so `=== undefined`, never `??`.
	const imageZoom = o.imageZoom === undefined ? DEFAULT_OPTIONS.imageZoom : o.imageZoom;
	const imageX = o.imageX === undefined ? DEFAULT_OPTIONS.imageX : o.imageX;
	const imageY = o.imageY === undefined ? DEFAULT_OPTIONS.imageY : o.imageY;

	if (!isFiniteBetween(imageZoom, 1, 4))
		return fail('invalid_image_zoom', 'Field "imageZoom" must be a finite number between 1 and 4.');
	if (!isFiniteBetween(imageX, 0, 100))
		return fail('invalid_image_x', 'Field "imageX" must be a finite number between 0 and 100.');
	if (!isFiniteBetween(imageY, 0, 100))
		return fail('invalid_image_y', 'Field "imageY" must be a finite number between 0 and 100.');
	if (o.scope !== 'month' && o.scope !== 'year')
		return fail('invalid_scope', 'Field "scope" must be "month" or "year".');

	return {
		ok: true,
		value: {
			year: o.year,
			month: o.month,
			schemeId: o.schemeId as SchemeId,
			fontId: o.fontId as FontId,
			opacity: o.opacity,
			showHolidays: o.showHolidays,
			title: o.title,
			imageZoom,
			imageX,
			imageY,
			scope: o.scope as ExportScope
		}
	};
}

/** Drops `scope`, leaving a plain {@link CalendarOptions}. */
export function stripScope(o: ExportRequest): CalendarOptions {
	const { scope: _scope, ...rest } = o;
	return rest;
}

/**
 * The twelve pages of a year export. The custom title is dropped from every page so each one
 * keeps its month label (SPEC §14.3).
 */
export function yearPages(o: CalendarOptions | ExportRequest): CalendarOptions[] {
	const base = stripScope({ ...o, scope: 'month', title: '' });
	return Array.from({ length: 12 }, (_, month) => ({ ...base, month }));
}

/** Download filename: `calgen-2026-09.pdf` for a month, `calgen-2026.pdf` for a year. */
export function pdfFilename(o: ExportRequest): string {
	return o.scope === 'year'
		? `calgen-${o.year}.pdf`
		: `calgen-${o.year}-${String(o.month + 1).padStart(2, '0')}.pdf`;
}
