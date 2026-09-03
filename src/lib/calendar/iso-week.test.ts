import { describe, expect, it } from 'vitest';
import { isoWeek, isoWeekYear } from './iso-week';
import { weekday, type CivilDate } from './civil';

const d = (year: number, month: number, day: number): CivilDate => ({ year, month, day });

describe('isoWeek', () => {
	it.each([
		[d(2026, 8, 1), 36],
		[d(2026, 7, 31), 36],
		[d(2026, 0, 1), 1],
		[d(2026, 11, 31), 53],
		[d(2027, 0, 1), 53],
		[d(2027, 0, 4), 1],
		[d(2021, 0, 1), 53],
		[d(2020, 11, 28), 53],
		[d(2025, 11, 29), 1]
	])('returns the verified week number for %o', (date, expected) => {
		expect(isoWeek(date)).toBe(expected);
	});

	it('is constant across a Monday-to-Sunday run', () => {
		const weeks = Array.from({ length: 7 }, (_, i) => isoWeek(d(2026, 7, 31 + i)));
		expect(weeks).toEqual([36, 36, 36, 36, 36, 36, 36]);
	});

	it('only ever returns 1..53', () => {
		const seen = new Set<number>();
		for (let day = 1; day <= 366 * 5; day++) {
			const n = isoWeek(d(2020, 0, day));
			seen.add(n);
		}
		expect(Math.min(...seen)).toBe(1);
		expect(Math.max(...seen)).toBe(53);
	});
});

describe('isoWeekYear', () => {
	it('assigns 2026-12-31 to week-year 2026', () => {
		expect(isoWeekYear(d(2026, 11, 31))).toBe(2026);
	});

	it('assigns 2027-01-01 to week-year 2026', () => {
		expect(isoWeekYear(d(2027, 0, 1))).toBe(2026);
	});

	it('assigns 2025-12-29 to week-year 2026', () => {
		expect(isoWeekYear(d(2025, 11, 29))).toBe(2026);
	});
});

describe('53-week years, 2000–2100', () => {
	it('is exactly the verified set (28 December falls in week 53)', () => {
		const years: number[] = [];
		for (let y = 2000; y <= 2100; y++) {
			if (isoWeek(d(y, 11, 28)) === 53) years.push(y);
		}
		expect(years).toEqual([
			2004, 2009, 2015, 2020, 2026, 2032, 2037, 2043, 2048, 2054, 2060, 2065, 2071, 2076, 2082,
			2088, 2093, 2099
		]);
	});

	it('every 4 January is in week 1', () => {
		const bad: number[] = [];
		for (let y = 2000; y <= 2100; y++) if (isoWeek(d(y, 0, 4)) !== 1) bad.push(y);
		expect(bad).toEqual([]);
	});

	it('every Thursday shares its calendar year with its week-year', () => {
		const bad: string[] = [];
		for (let y = 2000; y <= 2100; y++) {
			for (const day of [1, 100, 200, 300, 365]) {
				const date = d(y, 0, day);
				if (weekday(date) === 4 && isoWeekYear(date) !== y) bad.push(`${y}-${day}`);
			}
		}
		expect(bad).toEqual([]);
	});
});
