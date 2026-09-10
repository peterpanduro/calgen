import { describe, expect, it } from 'vitest';
import { getPaperSize, PAPER_SIZES } from './paper';

describe('PAPER_SIZES', () => {
	it('has exactly two entries', () => {
		expect(PAPER_SIZES).toHaveLength(2);
		expect(PAPER_SIZES.map((p) => p.id)).toEqual(['A4', 'A3']);
	});

	it('sizes A4 at 297 × 210 mm with the literal scale 1', () => {
		const a4 = PAPER_SIZES.find((p) => p.id === 'A4')!;
		expect(a4.widthMm).toBe(297);
		expect(a4.heightMm).toBe(210);
		expect(a4.scale).toBe(1);
	});

	it('sizes A3 at 420 × 297 mm', () => {
		const a3 = PAPER_SIZES.find((p) => p.id === 'A3')!;
		expect(a3.widthMm).toBe(420);
		expect(a3.heightMm).toBe(297);
	});
});

describe('getPaperSize', () => {
	it('round-trips both ids', () => {
		expect(getPaperSize('A4').id).toBe('A4');
		expect(getPaperSize('A3').id).toBe('A3');
	});

	it('throws on an unknown id', () => {
		// @ts-expect-error deliberately invalid id
		expect(() => getPaperSize('A5')).toThrow();
	});
});

describe('the A3 scale factor', () => {
	const a3 = getPaperSize('A3');

	it('keeps scaled content strictly inside the sheet on both axes', () => {
		expect(297 * a3.scale).toBeLessThan(420);
		expect(210 * a3.scale).toBeLessThan(297);
	});

	it('leaves slack under 0.1 mm on both axes', () => {
		expect(420 - 297 * a3.scale).toBeLessThan(0.1);
		expect(297 - 210 * a3.scale).toBeLessThan(0.1);
	});

	it("is within puppeteer's [0.1, 2] scale clamp", () => {
		expect(a3.scale).toBeGreaterThanOrEqual(0.1);
		expect(a3.scale).toBeLessThanOrEqual(2);
	});

	it('is within 0.1 % of √2', () => {
		expect(Math.abs(a3.scale - Math.SQRT2) / Math.SQRT2).toBeLessThan(0.001);
	});
});
