import { describe, expect, it } from 'vitest';
import { holidayMap, holidaysForYear } from './holidays';
import { toKey, weekday } from './civil';

const dateOf = (year: number, name: string): string => {
	const hit = holidaysForYear(year).find((h) => h.name === name);
	if (!hit) throw new Error(`${name} not found in ${year}`);
	return toKey(hit.date);
};

describe('holidaysForYear', () => {
	it.each([
		[2026, 'Nyårsdagen', '2026-01-01'],
		[2026, 'Trettondedag jul', '2026-01-06'],
		[2026, 'Långfredagen', '2026-04-03'],
		[2026, 'Påskdagen', '2026-04-05'],
		[2026, 'Annandag påsk', '2026-04-06'],
		[2026, 'Första maj', '2026-05-01'],
		[2026, 'Kristi himmelsfärdsdag', '2026-05-14'],
		[2026, 'Pingstdagen', '2026-05-24'],
		[2026, 'Nationaldagen', '2026-06-06'],
		[2026, 'Midsommarafton', '2026-06-19'],
		[2026, 'Midsommardagen', '2026-06-20'],
		[2026, 'Alla helgons dag', '2026-10-31'],
		[2026, 'Julafton', '2026-12-24'],
		[2026, 'Juldagen', '2026-12-25'],
		[2026, 'Annandag jul', '2026-12-26'],
		[2026, 'Nyårsafton', '2026-12-31'],
		[2027, 'Midsommardagen', '2027-06-26'],
		[2027, 'Alla helgons dag', '2027-11-06'],
		[2025, 'Midsommardagen', '2025-06-21'],
		[2025, 'Alla helgons dag', '2025-11-01'],
		[2024, 'Midsommardagen', '2024-06-22'],
		[2024, 'Alla helgons dag', '2024-11-02'],
		[2030, 'Midsommardagen', '2030-06-22'],
		[2030, 'Alla helgons dag', '2030-11-02']
	])('places %i %s on %s', (year, name, expected) => {
		expect(dateOf(year, name)).toBe(expected);
	});

	it('lists the sixteen entries in the normative order', () => {
		expect(holidaysForYear(2026).map((h) => h.name)).toEqual([
			'Nyårsdagen',
			'Trettondedag jul',
			'Långfredagen',
			'Påskdagen',
			'Annandag påsk',
			'Första maj',
			'Kristi himmelsfärdsdag',
			'Pingstdagen',
			'Nationaldagen',
			'Midsommarafton',
			'Midsommardagen',
			'Alla helgons dag',
			'Julafton',
			'Juldagen',
			'Annandag jul',
			'Nyårsafton'
		]);
	});

	it('always returns exactly 16 entries, 2000–2100', () => {
		const bad: number[] = [];
		for (let y = 2000; y <= 2100; y++) if (holidaysForYear(y).length !== 16) bad.push(y);
		expect(bad).toEqual([]);
	});

	it('always puts Midsommardagen and Alla helgons dag on a Saturday, 2000–2100', () => {
		const bad: string[] = [];
		for (let y = 2000; y <= 2100; y++) {
			for (const name of ['Midsommardagen', 'Alla helgons dag']) {
				const hit = holidaysForYear(y).find((h) => h.name === name);
				if (!hit || weekday(hit.date) !== 6) bad.push(`${y} ${name}`);
			}
		}
		expect(bad).toEqual([]);
	});

	it('keeps Midsommardagen in 20–26 June and Alla helgons dag in 31 Oct – 6 Nov', () => {
		const bad: string[] = [];
		for (let y = 2000; y <= 2100; y++) {
			const mid = holidaysForYear(y)[10].date;
			const alla = holidaysForYear(y)[11].date;
			if (mid.month !== 5 || mid.day < 20 || mid.day > 26) bad.push(toKey(mid));
			const allaOk = (alla.month === 9 && alla.day === 31) || (alla.month === 10 && alla.day <= 6);
			if (!allaOk) bad.push(toKey(alla));
		}
		expect(bad).toEqual([]);
	});
});

describe('holidayMap', () => {
	it('maps YYYY-MM-DD to the holiday name', () => {
		expect(holidayMap(2026).get('2026-06-20')).toBe('Midsommardagen');
		expect(holidayMap(2026).get('2026-03-17')).toBeUndefined();
	});

	it('returns the same memoised instance for a repeated year', () => {
		expect(holidayMap(2026)).toBe(holidayMap(2026));
	});

	it('resolves the 2008 Första maj / Kristi himmelsfärdsdag collision last-write-wins', () => {
		expect(holidaysForYear(2008)).toHaveLength(16);
		expect(holidayMap(2008).size).toBe(15);
		expect(holidayMap(2008).get('2008-05-01')).toBe('Kristi himmelsfärdsdag');
	});

	it.each([2049, 2055, 2060])(
		'resolves the %i Pingstdagen / Nationaldagen collision to Nationaldagen',
		(year) => {
			expect(holidayMap(year).size).toBe(15);
			expect(holidayMap(year).get(`${year}-06-06`)).toBe('Nationaldagen');
		}
	);

	it('collides in exactly {2008, 2049, 2055, 2060} across 2000–2100', () => {
		const colliding: number[] = [];
		for (let y = 2000; y <= 2100; y++) if (holidayMap(y).size !== 16) colliding.push(y);
		expect(colliding).toEqual([2008, 2049, 2055, 2060]);
	});
});
