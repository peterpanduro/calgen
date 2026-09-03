import { addDays, toKey, weekday, type CivilDate } from './civil';
import { easter } from './easter';

/** A Swedish red day or one of the four "afton" days. */
export interface Holiday {
	date: CivilDate;
	name: string;
}

/**
 * The Saturday in `fromDay..toDay` of `month`. Day numbers may overflow the month —
 * `saturdayInRange(y, 9, 31, 37)` spans 31 October to 6 November (SPEC §4.4).
 *
 * @throws when the range contains no Saturday, which never happens for a 7-day range.
 */
function saturdayInRange(year: number, month: number, fromDay: number, toDay: number): CivilDate {
	for (let day = fromDay; day <= toDay; day++) {
		const candidate = { year, month, day };
		// addDays(…, 0) re-expresses an overflowing day number in canonical form.
		if (weekday(candidate) === 6) return addDays(candidate, 0);
	}
	throw new Error(`No Saturday in ${year}-${month + 1} days ${fromDay}..${toDay}`);
}

/**
 * All Swedish red days plus the four "afton" days for one Gregorian year, in the normative
 * order of SPEC §4.4. The order decides collisions: {@link holidayMap} is last-write-wins.
 */
export function holidaysForYear(year: number): Holiday[] {
	const e = easter(year);
	const midsommardagen = saturdayInRange(year, 5, 20, 26);
	return [
		{ date: { year, month: 0, day: 1 }, name: 'Nyårsdagen' },
		{ date: { year, month: 0, day: 6 }, name: 'Trettondedag jul' },
		{ date: addDays(e, -2), name: 'Långfredagen' },
		{ date: e, name: 'Påskdagen' },
		{ date: addDays(e, 1), name: 'Annandag påsk' },
		{ date: { year, month: 4, day: 1 }, name: 'Första maj' },
		{ date: addDays(e, 39), name: 'Kristi himmelsfärdsdag' },
		{ date: addDays(e, 49), name: 'Pingstdagen' },
		{ date: { year, month: 5, day: 6 }, name: 'Nationaldagen' },
		{ date: addDays(midsommardagen, -1), name: 'Midsommarafton' },
		{ date: midsommardagen, name: 'Midsommardagen' },
		{ date: saturdayInRange(year, 9, 31, 37), name: 'Alla helgons dag' },
		{ date: { year, month: 11, day: 24 }, name: 'Julafton' },
		{ date: { year, month: 11, day: 25 }, name: 'Juldagen' },
		{ date: { year, month: 11, day: 26 }, name: 'Annandag jul' },
		{ date: { year, month: 11, day: 31 }, name: 'Nyårsafton' }
	];
}

const cache = new Map<number, ReadonlyMap<string, string>>();

/**
 * `'YYYY-MM-DD'` → holiday name for one year. Memoised (at most ~101 entries in practice).
 *
 * On a date collision the last entry of {@link holidaysForYear} wins, matching the prototype.
 */
export function holidayMap(year: number): ReadonlyMap<string, string> {
	const hit = cache.get(year);
	if (hit) return hit;
	const map = new Map<string, string>();
	for (const { date, name } of holidaysForYear(year)) map.set(toKey(date), name);
	cache.set(year, map);
	return map;
}
