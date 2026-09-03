import { describe, expect, it } from 'vitest';
import { DAY_NAMES, MONTHS, defaultTitle, resolveTitle } from './strings';

describe('MONTHS and DAY_NAMES', () => {
	it('lists the twelve Swedish months', () => {
		expect(MONTHS).toEqual([
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
		]);
	});

	it('lists the seven Swedish day names, Monday first', () => {
		expect(DAY_NAMES).toEqual([
			'Måndag',
			'Tisdag',
			'Onsdag',
			'Torsdag',
			'Fredag',
			'Lördag',
			'Söndag'
		]);
	});
});

describe('defaultTitle', () => {
	it('joins month name and year', () => {
		expect(defaultTitle(2026, 8)).toBe('September 2026');
	});

	it('handles January', () => {
		expect(defaultTitle(2027, 0)).toBe('Januari 2027');
	});
});

describe('resolveTitle', () => {
	it('falls back to the default title for an empty string', () => {
		expect(resolveTitle({ year: 2026, month: 8, title: '' })).toBe('September 2026');
	});

	it('falls back to the default title for whitespace only', () => {
		expect(resolveTitle({ year: 2026, month: 8, title: '   ' })).toBe('September 2026');
	});

	it('uses a custom title verbatim', () => {
		expect(resolveTitle({ year: 2026, month: 8, title: 'Vår trädgård' })).toBe('Vår trädgård');
	});

	it('trims surrounding whitespace from a custom title', () => {
		expect(resolveTitle({ year: 2026, month: 8, title: '  Vår trädgård  ' })).toBe('Vår trädgård');
	});
});
