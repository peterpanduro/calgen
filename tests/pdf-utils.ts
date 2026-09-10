import { inflateSync } from 'node:zlib';

/**
 * Counts `/Type /Page` objects, excluding `/Type /Pages`.
 *
 * A heuristic that holds because Chromium's PDF writer emits uncompressed page objects; it
 * would need replacing with a `/Count N` read if page dictionaries ever moved into object
 * streams (SPEC §12.4).
 */
export function pageCount(bytes: Uint8Array): number {
	const s = Buffer.from(bytes).toString('latin1');
	return (s.match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
}

/** True when the bytes look like a complete PDF document. */
export function isPdf(bytes: Uint8Array): boolean {
	const s = Buffer.from(bytes).toString('latin1');
	return s.startsWith('%PDF-') && /%%EOF\s*$/.test(s);
}

/** Latin-1 view of the bytes, for grepping font names and other PDF structure. */
export function asLatin1(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('latin1');
}

/** Points per millimetre, for comparing a `MediaBox` against a paper size in mm. */
export const PT_PER_MM = 72 / 25.4;

/**
 * Reads the first `/MediaBox [a b c d]` as a width/height in points, or `null` if none is
 * found. Same heuristic caveat as {@link pageCount}: it reads the first match, which holds
 * because every page in one export shares one paper size.
 */
export function mediaBox(bytes: Uint8Array): { widthPt: number; heightPt: number } | null {
	const s = Buffer.from(bytes).toString('latin1');
	const match = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/.exec(s);
	if (!match) return null;
	const [a, b, c, d] = match.slice(1).map(Number);
	return { widthPt: c - a, heightPt: d - b };
}

/** True when the PDF embeds at least one image XObject, whitespace between tokens tolerated. */
export function hasImageXObject(bytes: Uint8Array): boolean {
	return /\/Subtype\s*\/Image\b/.test(asLatin1(bytes));
}

/**
 * Decodes every `stream…endstream` block that inflates as FlateDecode zlib data, and returns
 * each as latin1 text, in document order. Chromium's PDF writer compresses page content streams
 * this way; embedded fonts and images either use a different filter or fail to inflate here and
 * are silently skipped. Same heuristic caveat as {@link pageCount}: holds for Chromium's writer,
 * not for PDFs in general.
 */
export function contentStreams(bytes: Uint8Array): string[] {
	const s = Buffer.from(bytes).toString('latin1');
	const streams: string[] = [];
	const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(s))) {
		try {
			streams.push(inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'));
		} catch {
			// Not a FlateDecode stream (an embedded font or image) — not a content stream.
		}
	}
	return streams;
}
