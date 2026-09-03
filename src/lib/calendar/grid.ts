import { addDays, daysInMonth, toKey, weekday, type CivilDate } from './civil';
import { holidayMap } from './holidays';
import { isoWeek } from './iso-week';
import type { CalendarOptions } from './types';

export interface GridCell {
	date: CivilDate;
	/** Day-of-month number shown in the box. */
	dayOfMonth: number;
	/** True when the cell belongs to the previous or next month. */
	otherMonth: boolean;
	/** ISO weekday 1–7. */
	weekday: number;
	/** Holiday name, or `''` — always `''` for adjacent-month cells. */
	holiday: string;
}

export interface GridWeek {
	isoWeek: number;
	/** Always seven cells, Monday first. */
	days: GridCell[];
}

export interface CalendarGrid {
	rows: number;
	weeks: GridWeek[];
}

/** Minimum week rows per page, so day boxes are the same height on every page (SPEC §14.1). */
const MIN_ROWS = 5;

/**
 * Builds the Monday-first day grid for one month.
 *
 * The row count is clamped to at least five: without it a non-leap February starting on a
 * Monday renders four rows of visibly taller boxes. The clamp only ever adds a row, and that
 * row is entirely next-month cells.
 */
export function buildGrid(
	o: Pick<CalendarOptions, 'year' | 'month' | 'showHolidays'>
): CalendarGrid {
	const first: CivilDate = { year: o.year, month: o.month, day: 1 };
	const offset = weekday(first) - 1;
	const start = addDays(first, -offset);
	const rows = Math.max(MIN_ROWS, Math.ceil((offset + daysInMonth(o.year, o.month)) / 7));

	const weeks: GridWeek[] = [];
	for (let r = 0; r < rows; r++) {
		const monday = addDays(start, r * 7);
		const days: GridCell[] = [];
		for (let i = 0; i < 7; i++) {
			const date = addDays(monday, i);
			const otherMonth = date.month !== o.month || date.year !== o.year;
			// Looked up in the cell's own year, not the option year (SPEC §14.2).
			const name = o.showHolidays ? (holidayMap(date.year).get(toKey(date)) ?? '') : '';
			days.push({
				date,
				dayOfMonth: date.day,
				otherMonth,
				weekday: i + 1,
				holiday: otherMonth ? '' : name
			});
		}
		weeks.push({ isoWeek: isoWeek(monday), days });
	}
	return { rows, weeks };
}
