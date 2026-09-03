import { describe, expect, it } from 'vitest';
import { buildGrid } from './grid';
import { daysInMonth, toKey, weekday } from './civil';

const g = (year: number, month: number, showHolidays = false) =>
	buildGrid({ year, month, showHolidays });

describe('buildGrid geometry', () => {
	it.each([
		// year, month, rows, first cell, week numbers
		[2026, 8, 5, '2026-08-31', [36, 37, 38, 39, 40]],
		[2026, 7, 6, '2026-07-27', [31, 32, 33, 34, 35, 36]],
		[2026, 10, 6, '2026-10-26', [44, 45, 46, 47, 48, 49]],
		[2027, 1, 5, '2027-02-01', [5, 6, 7, 8, 9]],
		[2021, 1, 5, '2021-02-01', [5, 6, 7, 8, 9]],
		[2026, 11, 5, '2026-11-30', [49, 50, 51, 52, 53]],
		[2026, 0, 5, '2025-12-29', [1, 2, 3, 4, 5]]
	])('lays out %i-%i as %i rows starting %s', (year, month, rows, start, weeks) => {
		const grid = g(year, month);
		expect(grid.rows).toBe(rows);
		expect(grid.weeks).toHaveLength(rows);
		expect(toKey(grid.weeks[0].days[0].date)).toBe(start);
		expect(grid.weeks.map((w) => w.isoWeek)).toEqual(weeks);
	});

	it('gives March 2026 six rows', () => {
		expect(g(2026, 2).rows).toBe(6);
	});

	it('always has seven days per week', () => {
		const bad: string[] = [];
		for (let y = 2000; y <= 2100; y++) {
			for (let m = 0; m < 12; m++) {
				for (const week of g(y, m).weeks) if (week.days.length !== 7) bad.push(`${y}-${m}`);
			}
		}
		expect(bad).toEqual([]);
	});

	it('starts every row on a Monday', () => {
		const bad: string[] = [];
		for (let m = 0; m < 12; m++) {
			for (const week of g(2026, m).weeks) if (weekday(week.days[0].date) !== 1) bad.push(`${m}`);
		}
		expect(bad).toEqual([]);
	});
});

describe('the five-row clamp', () => {
	it('yields 952 five-row and 260 six-row months across 2000–2100, and no four-row month', () => {
		const counts: Record<number, number> = {};
		for (let y = 2000; y <= 2100; y++) {
			for (let m = 0; m < 12; m++) {
				const rows = g(y, m).rows;
				counts[rows] = (counts[rows] ?? 0) + 1;
			}
		}
		expect(counts).toEqual({ 5: 952, 6: 260 });
	});

	it('only ever adds rows, never removes them', () => {
		const diffs = new Set<number>();
		for (let y = 2000; y <= 2100; y++) {
			for (let m = 0; m < 12; m++) {
				const offset = weekday({ year: y, month: m, day: 1 }) - 1;
				const natural = Math.ceil((offset + daysInMonth(y, m)) / 7);
				diffs.add(g(y, m).rows - natural);
			}
		}
		expect([...diffs].sort()).toEqual([0, 1]);
	});

	it('fills the clamped trailing row of February 2027 with next-month cells', () => {
		const grid = g(2027, 1, true);
		expect(grid.rows).toBe(5);
		const last = grid.weeks[4].days;
		expect(last.map((c) => toKey(c.date))).toEqual([
			'2027-03-01',
			'2027-03-02',
			'2027-03-03',
			'2027-03-04',
			'2027-03-05',
			'2027-03-06',
			'2027-03-07'
		]);
		expect(last.every((c) => c.otherMonth)).toBe(true);
		expect(last.every((c) => c.holiday === '')).toBe(true);
	});
});

describe('cell contents', () => {
	it('marks the leading 31 August cell of September 2026 as another month', () => {
		const first = g(2026, 8).weeks[0].days[0];
		expect(first).toMatchObject({ dayOfMonth: 31, otherMonth: true, weekday: 1 });
	});

	it('marks 1 September 2026 as in-month on a Tuesday', () => {
		const second = g(2026, 8).weeks[0].days[1];
		expect(second).toMatchObject({ dayOfMonth: 1, otherMonth: false, weekday: 2 });
	});

	it('labels the June 2026 midsummer cells', () => {
		const cells = g(2026, 5, true).weeks.flatMap((w) => w.days);
		const byKey = new Map(cells.map((c) => [toKey(c.date), c.holiday]));
		expect(byKey.get('2026-06-19')).toBe('Midsommarafton');
		expect(byKey.get('2026-06-20')).toBe('Midsommardagen');
	});

	it('blanks holidays on adjacent-month cells, looking them up in the cell year', () => {
		const first = g(2026, 0, true).weeks[0].days[0];
		expect(toKey(first.date)).toBe('2025-12-29');
		expect(first.holiday).toBe('');
		// 2025-12-31 is Nyårsafton and is also an adjacent-month cell.
		const newYearsEve = g(2026, 0, true).weeks[0].days[2];
		expect(toKey(newYearsEve.date)).toBe('2025-12-31');
		expect(newYearsEve.holiday).toBe('');
		expect(newYearsEve.otherMonth).toBe(true);
	});

	it('blanks every holiday when showHolidays is false', () => {
		const cells = g(2026, 5, false).weeks.flatMap((w) => w.days);
		expect(cells.every((c) => c.holiday === '')).toBe(true);
	});

	it('labels in-month holidays that belong to the cell year, not the option year', () => {
		// December 2026's grid ends inside January 2027; those cells are adjacent-month and blank,
		// but the in-month Christmas days must still be labelled.
		const cells = g(2026, 11, true).weeks.flatMap((w) => w.days);
		const byKey = new Map(cells.map((c) => [toKey(c.date), c.holiday]));
		expect(byKey.get('2026-12-24')).toBe('Julafton');
		expect(byKey.get('2026-12-25')).toBe('Juldagen');
		expect(byKey.get('2027-01-03')).toBe('');
	});
});
