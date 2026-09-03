/**
 * Timezone-free calendar arithmetic.
 *
 * No `Date` object appears anywhere in this layer: the service runs in containers where `TZ`
 * is not guaranteed, and `new Date(y, m, d)` lands on the previous day in zones whose local
 * midnight does not exist (SPEC §4.1).
 */

/** A timezone-free calendar date. `month` is 0-based (0 = January). */
export interface CivilDate {
	year: number;
	month: number;
	day: number;
}

/**
 * Days since 1970-01-01 (Howard Hinnant's `days_from_civil`). Pure integer math.
 *
 * Out-of-range `month` and `day` values normalise, e.g. `{2026, 9, 32}` is 2026-11-01. Several
 * callers rely on that (SPEC §4.1, §4.4).
 */
export function toDayNumber({ year, month, day }: CivilDate): number {
	const y = year + Math.floor(month / 12);
	const m = ((month % 12) + 12) % 12; // 0..11
	const yy = m <= 1 ? y - 1 : y; // shift so March = month 0
	const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
	const yoe = yy - era * 400; // 0..399
	const mp = (m + 10) % 12; // Mar=0 … Feb=11
	const doy = Math.floor((153 * mp + 2) / 5) + day - 1; // 0..365
	const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
	return era * 146097 + doe - 719468;
}

/** Inverse of {@link toDayNumber}. Always returns a normalised date. */
export function fromDayNumber(n: number): CivilDate {
	const z = n + 719468;
	const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
	const doe = z - era * 146097; // 0..146096
	const yoe = Math.floor(
		(doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365
	);
	const y = yoe + era * 400;
	const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // 0..365
	const mp = Math.floor((5 * doy + 2) / 153); // 0..11, March = 0
	const day = doy - Math.floor((153 * mp + 2) / 5) + 1; // 1..31
	const m = mp < 10 ? mp + 2 : mp - 10; // 0..11, January = 0
	return { year: m <= 1 ? y + 1 : y, month: m, day };
}

/** Adds `n` days (negative moves backwards) and returns a normalised date. */
export function addDays(d: CivilDate, n: number): CivilDate {
	return fromDayNumber(toDayNumber(d) + n);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function weekday(d: CivilDate): number {
	const n = toDayNumber(d);
	// 1970-01-01 was a Thursday (ISO 4).
	return ((((n + 3) % 7) + 7) % 7) + 1;
}

/** Proleptic Gregorian leap-year rule. */
export function isLeapYear(year: number): boolean {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Number of days in the given 0-based month. */
export function daysInMonth(year: number, month: number): number {
	return month === 1 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month];
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `'YYYY-MM-DD'` — used as map keys and in tests. */
export function toKey({ year, month, day }: CivilDate): string {
	return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/** True when both dates carry the same year, month and day. */
export function sameYmd(a: CivilDate, b: CivilDate): boolean {
	return a.year === b.year && a.month === b.month && a.day === b.day;
}
