import { pct, rgba } from './css';
import { getFont, type FontPairing } from './fonts';
import { buildGrid } from './grid';
import { getScheme, type Scheme } from './schemes';
import { DAY_NAMES, resolveTaskListTitle, resolveTitle } from './strings';
import type { CalendarOptions } from './types';

export interface ViewCell {
	dayOfMonth: number;
	holiday: string;
	/** Full CSS colour for the box fill, e.g. `'rgba(249,244,237,0.88)'`. */
	background: string;
	/** Full CSS colour for the date number and the holiday name. */
	foreground: string;
}

export interface ViewWeek {
	/** `'v.36'` */
	label: string;
	cells: ViewCell[];
}

/** Geometry of the background-photo layer, pre-serialised as CSS values (SPEC §5.2). */
export interface ViewBackground {
	/** `left` of the enlarged box, e.g. `'-25%'`. */
	left: string;
	/** `top` of the enlarged box, e.g. `'-50%'`. */
	top: string;
	/** `width` and `height` of the enlarged box, e.g. `'200%'`. */
	size: string;
	/** `background-position` inside that box, e.g. `'25% 50%'`. */
	position: string;
}

/** The handwriting task list beside the day grid (SPEC §4.9, §5.2). */
export interface ViewTaskList {
	/** Resolved heading, e.g. `'Att göra'`. */
	title: string;
	/** Grid placement of the list column, e.g. `'grid-row:2;grid-column:1'`. */
	placement: string;
	/** Panel fill — the current-month day-box colour, e.g. `'rgba(249,244,237,0.88)'`. */
	background: string;
	/** Colour of the row rules and the checkbox outlines. */
	line: string;
	/** `border-top` per row: `'none'` for the first, `'1px solid {line}'` after. */
	rowBorders: string[];
}

/** Style suffixes that make room for the task list; every one is `''` when it is off. */
export interface ViewLayout {
	/** Appended to the root `<section>` style. */
	section: string;
	/** Appended to the `<header>` style. */
	header: string;
	/** Appended to the day-grid style. */
	grid: string;
}

export interface CalendarView {
	title: string;
	rows: number;
	/** e.g. `'auto repeat(5,1fr)'` */
	gridTemplateRows: string;
	weeks: ViewWeek[];
	dayNames: readonly string[];
	scheme: Scheme;
	font: FontPairing;
	background: ViewBackground;
	layout: ViewLayout;
	/** `null` when `taskList === 'off'`. */
	taskList: ViewTaskList | null;
}

/**
 * The photo layer as a box `zoom` times the page, offset by a negative percentage, with
 * `background-size:cover` inside it.
 *
 * The image's left edge then lands at `x/100 · (W − zoom·C)` — precisely `background-position:
 * x%` for a rendered width of `zoom·C` — with the photo's aspect ratio cancelling out, which is
 * why layer 1 never needs the photo's natural size (SPEC §4.9).
 */
function backgroundOf(zoom: number, x: number, y: number): ViewBackground {
	return {
		left: pct((1 - zoom) * x),
		top: pct((1 - zoom) * y),
		size: pct(zoom * 100),
		position: `${pct(x)} ${pct(y)}`
	};
}

export const TASK_LIST_ROWS = 14;

/** Width of the task-list column (SPEC §4.9). */
export const TASK_LIST_WIDTH = '50mm';

const NO_LAYOUT: ViewLayout = { section: '', header: '', grid: '' };

/** Column tracks and grid placements per side; the list column is `TASK_LIST_WIDTH` wide. */
const TASK_LIST_SIDES = {
	left: { columns: `${TASK_LIST_WIDTH} 1fr`, grid: 2, list: 1 },
	right: { columns: `1fr ${TASK_LIST_WIDTH}`, grid: 1, list: 2 }
} as const;

/**
 * The task list and the layout that makes room for it. With the list off the layout suffixes
 * are empty, so every style attribute serialises exactly as it did before the feature.
 */
function taskListOf(
	o: CalendarOptions,
	scheme: Scheme,
	op: number
): { layout: ViewLayout; taskList: ViewTaskList | null } {
	if (o.taskList === 'off') return { layout: NO_LAYOUT, taskList: null };
	const side = TASK_LIST_SIDES[o.taskList];
	const line = scheme.otherFg;
	return {
		layout: {
			section: `;grid-template-columns:${side.columns}`,
			header: ';grid-column:1/-1',
			grid: `;grid-row:2;grid-column:${side.grid};min-width:0`
		},
		taskList: {
			title: resolveTaskListTitle(o),
			placement: `grid-row:2;grid-column:${side.list}`,
			background: rgba(scheme.cell, op),
			line,
			rowBorders: Array.from({ length: TASK_LIST_ROWS }, (_, i) =>
				i === 0 ? 'none' : `1px solid ${line}`
			)
		}
	};
}

/** Adjacent-month cells are dimmed to 80 % of the chosen coverage. */
const OTHER_MONTH_FACTOR = 0.8;

function cellBackground(scheme: Scheme, op: number, other: boolean, weekendish: boolean): string {
	if (other) return rgba(scheme.other, op * OTHER_MONTH_FACTOR);
	return rgba(weekendish ? scheme.weekend : scheme.cell, op);
}

function cellForeground(scheme: Scheme, other: boolean, red: boolean, saturday: boolean): string {
	// Evaluated after the other-month branch, so an adjacent-month cell is never red.
	if (other) return scheme.otherFg;
	if (red) return scheme.holiday;
	if (saturday) return scheme.weekendFg;
	return scheme.text;
}

/**
 * Resolves a {@link CalendarOptions} into the fully coloured model the page component renders.
 *
 * Every colour decision lives here rather than in Svelte so that it is unit-testable.
 */
export function buildCalendarView(o: CalendarOptions): CalendarView {
	const scheme = getScheme(o.schemeId);
	const font = getFont(o.fontId);
	const grid = buildGrid(o);
	const op = o.opacity / 100;

	const weeks: ViewWeek[] = grid.weeks.map((week) => ({
		label: `v.${week.isoWeek}`,
		cells: week.days.map((cell, i) => {
			const holiday = cell.holiday !== '';
			return {
				dayOfMonth: cell.dayOfMonth,
				holiday: cell.holiday,
				background: cellBackground(scheme, op, cell.otherMonth, i >= 5 || holiday),
				foreground: cellForeground(scheme, cell.otherMonth, i === 6 || holiday, i === 5)
			};
		})
	}));

	return {
		title: resolveTitle(o),
		rows: grid.rows,
		gridTemplateRows: `auto repeat(${grid.rows},1fr)`,
		weeks,
		dayNames: DAY_NAMES,
		scheme,
		font,
		background: backgroundOf(o.imageZoom, o.imageX, o.imageY),
		...taskListOf(o, scheme, op)
	};
}
