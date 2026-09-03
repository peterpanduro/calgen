import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import type { FontPairing } from '$lib/calendar/fonts';

interface ManifestFace {
	family: string;
	weight: number;
	style: string;
	subset: string;
	file: string;
	unicodeRange: string;
}

/** Weights every body family ships at. */
const BODY_WEIGHTS = [400, 600, 700];

/**
 * Absolute path of the directory holding `fonts.json` and the woff2 files.
 *
 * The single resolver (SPEC §7.3): the given override when set, otherwise `FONTS_DIR`,
 * otherwise `<cwd>/static/fonts` — correct both in the repo and in the container. Nothing else
 * in the codebase resolves a font path; `config.fontsDir` is this function's output.
 */
export function fontsDir(override?: string): string {
	return override || process.env.FONTS_DIR || path.resolve(process.cwd(), 'static/fonts');
}

const base64Cache = new Map<string, string>();

async function base64Of(dir: string, file: string): Promise<string> {
	const key = path.join(dir, file);
	const hit = base64Cache.get(key);
	if (hit) return hit;
	const encoded = (await readFile(key)).toString('base64');
	base64Cache.set(key, encoded);
	return encoded;
}

/** True when this face belongs to one of the requested pairings. */
function isNeeded(face: ManifestFace, pairings: FontPairing[]): boolean {
	return pairings.some(
		(p) =>
			(face.family === p.headingFamily && face.weight === p.headingWeight) ||
			(face.family === p.bodyFamily && BODY_WEIGHTS.includes(face.weight))
	);
}

/**
 * `@font-face` CSS with `data:` URIs for exactly the families these pairings need.
 *
 * `font-display: block` rather than `swap`: a swap fallback would be baked into the PDF if a
 * face were slow to decode.
 */
export async function loadPrintFontCss(
	pairings: FontPairing[],
	dir: string = fontsDir()
): Promise<string> {
	const manifest: ManifestFace[] = JSON.parse(await readFile(path.join(dir, 'fonts.json'), 'utf8'));
	const faces = manifest.filter((face) => isNeeded(face, pairings));

	const blocks = await Promise.all(
		faces.map(async (face) => {
			const data = await base64Of(dir, face.file);
			return (
				`@font-face{font-family:'${face.family}';font-style:${face.style};` +
				`font-weight:${face.weight};font-display:block;` +
				`src:url(data:font/woff2;base64,${data}) format('woff2');` +
				`unicode-range:${face.unicodeRange}}`
			);
		})
	);
	return blocks.join('');
}
