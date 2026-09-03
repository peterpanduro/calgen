import { afterAll, describe, expect, it } from 'vitest';
import {
	addDays,
	daysInMonth,
	fromDayNumber,
	isLeapYear,
	sameYmd,
	toDayNumber,
	toKey,
	weekday,
	type CivilDate
} from './civil';

const d = (year: number, month: number, day: number): CivilDate => ({ year, month, day });

describe('toDayNumber', () => {
	it('anchors the epoch at 1970-01-01', () => {
		expect(toDayNumber(d(1970, 0, 1))).toBe(0);
	});

	it('matches the verified vector for 2026-09-01', () => {
		expect(toDayNumber(d(2026, 8, 1))).toBe(20697);
	});

	it('normalises day overflow', () => {
		expect(toDayNumber(d(2026, 9, 32))).toBe(toDayNumber(d(2026, 10, 1)));
	});

	it('normalises month overflow', () => {
		expect(toDayNumber(d(2026, 12, 1))).toBe(toDayNumber(d(2027, 0, 1)));
	});

	it('normalises negative months', () => {
		expect(toDayNumber(d(2026, -1, 1))).toBe(toDayNumber(d(2025, 11, 1)));
	});
});

describe('fromDayNumber', () => {
	it('maps 0 back to the epoch', () => {
		expect(fromDayNumber(0)).toEqual(d(1970, 0, 1));
	});

	it('round-trips every day from 2000-01-01 to 2100-12-31', () => {
		const first = toDayNumber(d(2000, 0, 1));
		const last = toDayNumber(d(2100, 11, 31));
		let mismatches = 0;
		for (let n = first; n <= last; n++) {
			if (toDayNumber(fromDayNumber(n)) !== n) mismatches++;
		}
		expect(mismatches).toBe(0);
		expect(last - first + 1).toBe(36890);
	});
});

describe('weekday', () => {
	it('returns 2 for Tuesday 2026-09-01', () => {
		expect(weekday(d(2026, 8, 1))).toBe(2);
	});

	it('returns 6 for Saturday 2026-08-01', () => {
		expect(weekday(d(2026, 7, 1))).toBe(6);
	});

	it('returns 7 for Sunday and never 0', () => {
		expect(weekday(d(2026, 8, 6))).toBe(7);
	});

	it('stays in 1..7 across a long sweep', () => {
		const values = new Set<number>();
		for (let n = 0; n < 4000; n++) values.add(weekday(fromDayNumber(n)));
		expect([...values].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});
});

describe('addDays', () => {
	it('crosses a non-leap February end', () => {
		expect(addDays(d(2026, 1, 28), 1)).toEqual(d(2026, 2, 1));
	});

	it('lands on 29 February in a leap year', () => {
		expect(addDays(d(2024, 1, 28), 1)).toEqual(d(2024, 1, 29));
	});

	it('steps backwards across a year boundary', () => {
		expect(addDays(d(2026, 0, 1), -1)).toEqual(d(2025, 11, 31));
	});

	it('is the identity for n = 0', () => {
		expect(addDays(d(2026, 8, 1), 0)).toEqual(d(2026, 8, 1));
	});
});

describe('daysInMonth', () => {
	it('gives 28 for February 2100 (not a leap year)', () => {
		expect(daysInMonth(2100, 1)).toBe(28);
	});

	it('gives 29 for February 2000 (a leap year)', () => {
		expect(daysInMonth(2000, 1)).toBe(29);
	});

	it('gives the standard lengths for 2026', () => {
		const lengths = Array.from({ length: 12 }, (_, m) => daysInMonth(2026, m));
		expect(lengths).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
	});
});

describe('isLeapYear', () => {
	it('applies the full Gregorian rule', () => {
		expect([1900, 2000, 2023, 2024, 2100].map(isLeapYear)).toEqual([
			false,
			true,
			false,
			true,
			false
		]);
	});
});

describe('toKey', () => {
	it('zero-pads month and day', () => {
		expect(toKey(d(2026, 8, 1))).toBe('2026-09-01');
	});

	it('renders December correctly', () => {
		expect(toKey(d(2026, 11, 31))).toBe('2026-12-31');
	});
});

describe('sameYmd', () => {
	it('compares all three fields', () => {
		expect(sameYmd(d(2026, 8, 1), d(2026, 8, 1))).toBe(true);
		expect(sameYmd(d(2026, 8, 1), d(2026, 8, 2))).toBe(false);
	});
});

describe('timezone invariance', () => {
	const original = process.env.TZ;
	afterAll(() => {
		process.env.TZ = original;
	});

	it.each(['UTC', 'Europe/Stockholm', 'Pacific/Kiritimati', 'America/Santiago'])(
		'produces identical results under TZ=%s',
		(tz) => {
			process.env.TZ = tz;
			expect(toDayNumber(d(2026, 8, 1))).toBe(20697);
			expect(fromDayNumber(20697)).toEqual(d(2026, 8, 1));
			expect(weekday(d(2026, 8, 1))).toBe(2);
			expect(addDays(d(2026, 0, 1), -1)).toEqual(d(2025, 11, 31));
			expect(toKey(fromDayNumber(0))).toBe('1970-01-01');
		}
	);
});
