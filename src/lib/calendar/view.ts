import { rgba } from './css';
import { getFont, type FontPairing } from './fonts';
import { buildGrid } from './grid';
import { getScheme, type Scheme } from './schemes';
import { DAY_NAMES, resolveTitle } from './strings';
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

export interface CalendarView {
	title: string;
	rows: number;
	/** e.g. `'auto repeat(5,1fr)'` */
	gridTemplateRows: string;
	weeks: ViewWeek[];
	dayNames: readonly string[];
	scheme: Scheme;
	font: FontPairing;
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
		font
	};
}
