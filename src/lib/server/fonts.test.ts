import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { fontsDir, loadPrintFontCss } from './fonts';
import { getFont } from '$lib/calendar/fonts';

const original = process.env.FONTS_DIR;

afterEach(() => {
	if (original === undefined) delete process.env.FONTS_DIR;
	else process.env.FONTS_DIR = original;
});

describe('fontsDir', () => {
	it('defaults to static/fonts under the working directory', () => {
		delete process.env.FONTS_DIR;
		expect(fontsDir()).toBe(path.resolve(process.cwd(), 'static/fonts'));
	});

	it('honours FONTS_DIR', () => {
		process.env.FONTS_DIR = '/srv/fonts';
		expect(fontsDir()).toBe('/srv/fonts');
	});

	it('prefers an explicit override over the environment', () => {
		process.env.FONTS_DIR = '/srv/fonts';
		expect(fontsDir('/explicit')).toBe('/explicit');
	});
});

describe('loadPrintFontCss', () => {
	it('emits only the requested pairing’s families', async () => {
		const css = await loadPrintFontCss([getFont('organic')]);
		expect(css).toContain("font-family:'Caprasimo'");
		expect(css).toContain("font-family:'Figtree'");
		expect(css).not.toContain('Playfair Display');
		expect(css).not.toContain('Nunito');
	});

	it('emits eight faces per pairing: heading + body 400/600/700, latin and latin-ext', async () => {
		const css = await loadPrintFontCss([getFont('organic')]);
		expect(css.match(/@font-face/g)).toHaveLength(8);
	});

	it('embeds the woff2 payload as a data URI, never a URL', async () => {
		const css = await loadPrintFontCss([getFont('klassisk')]);
		expect(css).toContain('src:url(data:font/woff2;base64,');
		expect(css).not.toContain('/fonts/');
	});

	it('uses font-display: block so no fallback can be baked into the PDF', async () => {
		expect(await loadPrintFontCss([getFont('lekfull')])).toContain('font-display:block');
	});

	it('carries the heading weight declared by the pairing', async () => {
		const css = await loadPrintFontCss([getFont('modern')]);
		expect(css).toContain("font-family:'Bricolage Grotesque';font-style:normal;font-weight:600");
	});

	it('deduplicates nothing but still covers every pairing when asked for all four', async () => {
		const css = await loadPrintFontCss([
			getFont('organic'),
			getFont('klassisk'),
			getFont('lekfull'),
			getFont('modern')
		]);
		expect(css.match(/@font-face/g)).toHaveLength(32);
	});

	it('rejects when the manifest is missing', async () => {
		await expect(
			loadPrintFontCss([getFont('organic')], '/nonexistent-fonts-dir')
		).rejects.toThrow();
	});

	it('reads from an explicitly supplied directory', async () => {
		process.env.FONTS_DIR = '/nonexistent-fonts-dir';
		const css = await loadPrintFontCss(
			[getFont('organic')],
			path.resolve(process.cwd(), 'static/fonts')
		);
		expect(css).toContain("font-family:'Caprasimo'");
	});
});
