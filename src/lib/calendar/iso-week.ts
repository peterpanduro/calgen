import { addDays, toDayNumber, weekday, type CivilDate } from './civil';

/**
 * The Thursday of the ISO week containing `d`. That Thursday's calendar year is, by
 * definition, the ISO week-numbering year.
 */
function isoThursday(d: CivilDate): CivilDate {
	return addDays(d, 4 - weekday(d));
}

/** ISO-8601 week number, 1–53. Weeks start on Monday. */
export function isoWeek(d: CivilDate): number {
	const thursday = isoThursday(d);
	const jan1 = toDayNumber({ year: thursday.year, month: 0, day: 1 });
	return Math.floor((toDayNumber(thursday) - jan1) / 7) + 1;
}

/** ISO week-numbering year, which differs from the calendar year around New Year. */
export function isoWeekYear(d: CivilDate): number {
	return isoThursday(d).year;
}
