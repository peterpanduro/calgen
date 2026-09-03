import { describe, expect, it } from 'vitest';
import { FONTS, getFont } from './fonts';

describe('FONTS', () => {
	it('holds the four pairings', () => {
		expect(FONTS).toHaveLength(4);
	});

	it('has unique ids in the design order', () => {
		expect(FONTS.map((f) => f.id)).toEqual(['organic', 'klassisk', 'lekfull', 'modern']);
	});

	it('declares the shipped heading weight for every pairing', () => {
		expect(FONTS.map((f) => f.headingWeight)).toEqual([400, 500, 500, 600]);
	});

	it('quotes the family name in every CSS font stack', () => {
		const bad = FONTS.filter((f) => !f.heading.startsWith("'") || !f.body.startsWith("'"));
		expect(bad).toEqual([]);
	});

	it('names families that match the CSS stacks', () => {
		const bad = FONTS.filter(
			(f) => !f.heading.includes(f.headingFamily) || !f.body.includes(f.bodyFamily)
		);
		expect(bad).toEqual([]);
	});
});

describe('getFont', () => {
	it('returns the pairing with the given id', () => {
		expect(getFont('klassisk').headingWeight).toBe(500);
		expect(getFont('klassisk').headingFamily).toBe('Playfair Display');
	});

	it('throws on an unknown id', () => {
		// @ts-expect-error deliberately invalid id
		expect(() => getFont('gotisk')).toThrow();
	});
});
