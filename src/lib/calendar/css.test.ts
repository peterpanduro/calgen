import { describe, expect, it } from 'vitest';
import { alpha, imageCss, rgba } from './css';

describe('alpha', () => {
	it('rounds to three decimals instead of leaking float noise', () => {
		expect(alpha(0.88 * 0.8)).toBe('0.704');
	});

	it('strips trailing zeros', () => {
		expect(alpha(1)).toBe('1');
		expect(alpha(0.3)).toBe('0.3');
		expect(alpha(0.5)).toBe('0.5');
	});

	it('handles the lowest supported coverage', () => {
		expect(alpha((30 / 100) * 0.8)).toBe('0.24');
	});

	it('handles zero', () => {
		expect(alpha(0)).toBe('0');
	});
});

describe('rgba', () => {
	it('builds a CSS colour from a triple and an alpha', () => {
		expect(rgba('249,244,237', 0.88)).toBe('rgba(249,244,237,0.88)');
	});

	it('rounds the alpha the same way as alpha()', () => {
		expect(rgba('220,211,196', 0.88 * 0.8)).toBe('rgba(220,211,196,0.704)');
	});
});

describe('imageCss', () => {
	it('returns none for null', () => {
		expect(imageCss(null)).toBe('none');
	});

	it('wraps a URL in double quotes', () => {
		expect(imageCss('blob:x')).toBe('url("blob:x")');
	});

	it('accepts a realistic object URL', () => {
		expect(imageCss('blob:http://localhost:5173/abc-123')).toBe(
			'url("blob:http://localhost:5173/abc-123")'
		);
	});

	// Control characters are written as escapes deliberately — never paste literal bytes.
	it.each(['a")b', 'a"b', 'a)b', 'a\\b', 'a<b', 'a\u0000b', 'a\u0009b', 'a\u007Fb'])(
		'throws for the unsafe URL %j',
		(url) => {
			expect(() => imageCss(url)).toThrow();
		}
	);

	it('accepts a data URL unchanged', () => {
		expect(imageCss('data:image/jpeg;base64,AAAA')).toBe('url("data:image/jpeg;base64,AAAA")');
	});
});
