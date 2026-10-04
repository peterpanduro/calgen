import type { CalendarOptions } from './types';

export const MONTHS = [
	'Januari',
	'Februari',
	'Mars',
	'April',
	'Maj',
	'Juni',
	'Juli',
	'Augusti',
	'September',
	'Oktober',
	'November',
	'December'
] as const;

export const DAY_NAMES = [
	'Måndag',
	'Tisdag',
	'Onsdag',
	'Torsdag',
	'Fredag',
	'Lördag',
	'Söndag'
] as const;

/** `"<Månad> <År>"`, e.g. `'September 2026'`. */
export function defaultTitle(year: number, month: number): string {
	return `${MONTHS[month]} ${year}`;
}

/** The custom title when it holds anything but whitespace, otherwise {@link defaultTitle}. */
export function resolveTitle(o: Pick<CalendarOptions, 'year' | 'month' | 'title'>): string {
	return o.title.trim() || defaultTitle(o.year, o.month);
}

export const DEFAULT_TASK_LIST_TITLE = 'Att göra';

/** The custom task-list heading when it holds anything but whitespace, otherwise `Att göra`. */
export function resolveTaskListTitle(o: Pick<CalendarOptions, 'taskListTitle'>): string {
	return o.taskListTitle.trim() || DEFAULT_TASK_LIST_TITLE;
}
