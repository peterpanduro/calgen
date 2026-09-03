import { describe, expect, it } from 'vitest';
import { SCHEMES, getScheme } from './schemes';

const COLOUR = /^(#[0-9a-f]{6}|rgba\(.+\)|\d{1,3},\d{1,3},\d{1,3})$/;

describe('SCHEMES', () => {
	it('holds the six schemes', () => {
		expect(SCHEMES).toHaveLength(6);
	});

	it('has unique ids in the design order', () => {
		expect(SCHEMES.map((s) => s.id)).toEqual([
			'organic',
			'skog',
			'neutral',
			'terrakotta',
			'hav',
			'natt'
		]);
	});

	it('uses only well-formed colour values', () => {
		const bad: string[] = [];
		for (const scheme of SCHEMES) {
			for (const [key, value] of Object.entries(scheme)) {
				if (key === 'id' || key === 'name') continue;
				if (!COLOUR.test(value)) bad.push(`${scheme.id}.${key}=${value}`);
			}
		}
		expect(bad).toEqual([]);
	});

	it('carries the verified Organic values', () => {
		expect(getScheme('organic').bg).toBe('#f5ead8');
		expect(getScheme('organic').cell).toBe('249,244,237');
		expect(getScheme('organic').holiday).toBe('#8c491a');
	});

	it('carries the verified Natt values', () => {
		expect(getScheme('natt').bg).toBe('#2e2b25');
		expect(getScheme('natt').other).toBe('52,48,42');
		expect(getScheme('natt').weekFg).toBe('#272e1b');
	});
});

describe('getScheme', () => {
	it('returns the scheme with the given id', () => {
		expect(getScheme('hav').name).toBe('Hav');
	});

	it('throws on an unknown id', () => {
		// @ts-expect-error deliberately invalid id
		expect(() => getScheme('regnbåge')).toThrow();
	});
});
