import { FONTS } from './fonts';
import { PAPER_SIZES } from './paper';
import { SCHEMES } from './schemes';
import {
	DEFAULT_OPTIONS,
	TASK_LIST_POSITIONS,
	type CalendarOptions,
	type ExportRequest,
	type ExportScope,
	type FontId,
	type PaperSizeId,
	type SchemeId,
	type TaskListPosition
} from './types';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

const fail = (code: string, message: string): ParseResult<never> => ({ ok: false, code, message });

const MAX_TITLE_LENGTH = 120;
/** Shared with the sidebar input's `maxlength`, so the UI cannot send what the API rejects. */
export const MAX_TASK_LIST_TITLE_LENGTH = 20;
// Escapes written deliberately — never paste literal control bytes into this file.
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const SCHEME_IDS: ReadonlySet<string> = new Set(SCHEMES.map((s) => s.id));
const FONT_IDS: ReadonlySet<string> = new Set(FONTS.map((f) => f.id));
const PAPER_SIZE_IDS: ReadonlySet<string> = new Set(PAPER_SIZES.map((p) => p.id));
const TASK_LIST_IDS: ReadonlySet<unknown> = new Set(TASK_LIST_POSITIONS);

const isIntBetween = (v: unknown, lo: number, hi: number): v is number =>
	typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

// The three image-transform fields are the only non-integer numbers in the payload: a drag
// produces fractions. `Number.isFinite` still rejects NaN and ±Infinity, which would otherwise
// serialise into the style string as `left:NaN%` and be dropped silently by the browser.
const isFiniteBetween = (v: unknown, lo: number, hi: number): v is number =>
	typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

const isPlainText = (v: unknown, max: number): v is string =>
	typeof v === 'string' && v.length <= max && !CONTROL_CHARS.test(v);

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
	if (!isPlainText(o.title, MAX_TITLE_LENGTH))
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
	// Same carve-out as the three image-transform fields above: an old client never sent this
	// field, and omitting it must keep rendering A4 rather than fail.
	const paperSize = o.paperSize === undefined ? DEFAULT_OPTIONS.paperSize : o.paperSize;
	if (typeof paperSize !== 'string' || !PAPER_SIZE_IDS.has(paperSize))
		return fail('invalid_paper_size', 'Field "paperSize" must be "A4" or "A3".');
	// Optional for the same reason: an old client never sent these, and must keep its page.
	const taskList = o.taskList === undefined ? DEFAULT_OPTIONS.taskList : o.taskList;
	const taskListTitle =
		o.taskListTitle === undefined ? DEFAULT_OPTIONS.taskListTitle : o.taskListTitle;
	if (!TASK_LIST_IDS.has(taskList))
		return fail('invalid_task_list', 'Field "taskList" must be "off", "left" or "right".');
	if (!isPlainText(taskListTitle, MAX_TASK_LIST_TITLE_LENGTH))
		return fail(
			'invalid_task_list_title',
			`Field "taskListTitle" must be a string of at most ${MAX_TASK_LIST_TITLE_LENGTH} characters with no control characters.`
		);
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
			paperSize: paperSize as PaperSizeId,
			taskList: taskList as TaskListPosition,
			taskListTitle,
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
 * keeps its month label (SPEC §14.3); the task list and its heading are not month-specific and
 * carry across.
 */
export function yearPages(o: CalendarOptions | ExportRequest): CalendarOptions[] {
	const base = stripScope({ ...o, scope: 'month', title: '' });
	return Array.from({ length: 12 }, (_, month) => ({ ...base, month }));
}

/**
 * Download filename: `calgen-2026-09.pdf` for a month, `calgen-2026.pdf` for a year, with
 * `-a3` appended before `.pdf` when `paperSize === 'A3'`. A4 filenames are unchanged.
 */
export function pdfFilename(o: ExportRequest): string {
	const suffix = o.paperSize === 'A3' ? '-a3' : '';
	return o.scope === 'year'
		? `calgen-${o.year}${suffix}.pdf`
		: `calgen-${o.year}-${String(o.month + 1).padStart(2, '0')}${suffix}.pdf`;
}
