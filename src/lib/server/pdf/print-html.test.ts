import { describe, expect, it } from 'vitest';
import { BACKGROUND_IMAGE_URL, buildPrintHtml } from './print-html';

const page = (n: number) => `<section data-page="${n}"></section>`;
const build = (count: number, hasImage = false, pageBg = '#f5ead8') =>
	buildPrintHtml({
		pages: Array.from({ length: count }, (_, i) => page(i)),
		fontCss: '@font-face{font-family:"Figtree"}',
		hasImage,
		pageBg
	});

const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('buildPrintHtml', () => {
	it('emits a full HTML document', () => {
		expect(build(1).startsWith('<!doctype html>')).toBe(true);
	});

	it('declares the A4 landscape page box with no margin', () => {
		expect(build(1).replace(/\s+/g, ' ')).toContain('@page { size: 297mm 210mm; margin: 0 }');
	});

	it.each([1, 12])('wraps each of the %i bodies in a page section', (count) => {
		expect(countOf(build(count), 'class="calgen-page"')).toBe(count);
	});

	it('keeps the page bodies in order', () => {
		const html = build(3);
		expect(html.indexOf(page(0))).toBeLessThan(html.indexOf(page(1)));
		expect(html.indexOf(page(1))).toBeLessThan(html.indexOf(page(2)));
	});

	it('stops the last page from breaking, so a 12-page job is not 13 pages', () => {
		expect(build(12).replace(/\s+/g, ' ')).toContain(
			'.calgen-page:last-child { break-after: auto; page-break-after: auto }'
		);
	});

	it('inlines the supplied font CSS verbatim', () => {
		expect(build(1)).toContain('@font-face{font-family:"Figtree"}');
	});

	it('paints the root with the scheme background, covering the quantised page foot', () => {
		expect(build(1, false, '#2e2b25').replace(/\s+/g, ' ')).toContain('background: #2e2b25');
	});

	it('declares the background image once as a custom property pointing at the fixed URL', () => {
		const html = build(12, true);
		expect(countOf(html, '--calgen-bg')).toBe(1);
		expect(html).toContain(`:root{--calgen-bg:url("${BACKGROUND_IMAGE_URL}")}`);
	});

	it('omits the custom property when there is no image', () => {
		expect(build(12)).not.toContain('--calgen-bg');
	});

	it('enables background printing', () => {
		expect(build(1)).toContain('print-color-adjust: exact');
	});
});
