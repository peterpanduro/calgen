import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONTS } from '$lib/calendar/fonts';

const DIR = path.resolve(process.cwd(), 'static/fonts');

interface Face {
	family: string;
	weight: number;
	style: string;
	subset: string;
	file: string;
	unicodeRange: string;
}

const manifest: Face[] = JSON.parse(readFileSync(path.join(DIR, 'fonts.json'), 'utf8'));

describe('static/fonts/fonts.json', () => {
	it('covers all eight families', () => {
		const families = new Set(manifest.map((f) => f.family));
		const wanted = FONTS.flatMap((f) => [f.headingFamily, f.bodyFamily]);
		expect([...wanted].filter((f) => !families.has(f))).toEqual([]);
		expect(families.size).toBe(8);
	});

	it('covers the heading weight of every pairing', () => {
		const missing = FONTS.filter(
			(f) => !manifest.some((m) => m.family === f.headingFamily && m.weight === f.headingWeight)
		);
		expect(missing).toEqual([]);
	});

	it('covers body weights 400, 600 and 700 for every body family', () => {
		const missing: string[] = [];
		for (const f of FONTS) {
			for (const weight of [400, 600, 700]) {
				if (!manifest.some((m) => m.family === f.bodyFamily && m.weight === weight))
					missing.push(`${f.bodyFamily} ${weight}`);
			}
		}
		expect(missing).toEqual([]);
	});

	it('holds 32 faces backed by 16 deduplicated files', () => {
		expect(manifest).toHaveLength(32);
		expect(new Set(manifest.map((f) => f.file)).size).toBe(16);
	});

	it('only ships the latin and latin-ext subsets', () => {
		expect([...new Set(manifest.map((f) => f.subset))].sort()).toEqual(['latin', 'latin-ext']);
	});

	it('references only files that exist on disk', () => {
		const missing = [...new Set(manifest.map((f) => f.file))].filter(
			(file) => !existsSync(path.join(DIR, file))
		);
		expect(missing).toEqual([]);
	});

	it('gives every face a non-empty unicode range and a normal style', () => {
		const bad = manifest.filter((f) => f.style !== 'normal' || !f.unicodeRange.startsWith('U+'));
		expect(bad).toEqual([]);
	});
});

describe('static/fonts/fonts.css', () => {
	const css = readFileSync(path.join(DIR, 'fonts.css'), 'utf8');

	it('declares one @font-face per manifest entry', () => {
		expect(css.match(/@font-face/g)).toHaveLength(32);
	});

	it('serves the files from the app origin with font-display: swap', () => {
		expect(css).toContain("src:url('/fonts/");
		expect(css).toContain('font-display:swap');
	});
});

describe('static/fonts/OFL.txt', () => {
	it('records the licence and the source', () => {
		const text = readFileSync(path.join(DIR, 'OFL.txt'), 'utf8');
		expect(text).toContain('SIL Open Font License');
		expect(text).toContain('scripts/fetch-fonts.mjs');
	});
});
