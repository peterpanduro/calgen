import { describe, expect, it } from 'vitest';
import { easter } from './easter';
import { toKey, weekday } from './civil';

describe('easter', () => {
	it.each([
		[2000, '2000-04-23'],
		[2020, '2020-04-12'],
		[2024, '2024-03-31'],
		[2025, '2025-04-20'],
		[2026, '2026-04-05'],
		[2027, '2027-03-28'],
		[2030, '2030-04-21'],
		[2038, '2038-04-25'],
		[2100, '2100-03-28']
	])('returns the verified Easter Sunday for %i', (year, expected) => {
		expect(toKey(easter(year))).toBe(expected);
	});

	it('returns a 0-based month', () => {
		expect(easter(2026)).toEqual({ year: 2026, month: 3, day: 5 });
	});

	it('always falls on a Sunday between 22 March and 25 April, 2000–2100', () => {
		const bad: string[] = [];
		for (let y = 2000; y <= 2100; y++) {
			const e = easter(y);
			const inRange = (e.month === 2 && e.day >= 22) || (e.month === 3 && e.day <= 25);
			if (weekday(e) !== 7 || !inRange || e.year !== y) bad.push(toKey(e));
		}
		expect(bad).toEqual([]);
	});
});
