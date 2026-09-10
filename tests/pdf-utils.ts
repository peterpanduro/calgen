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

/** True when the PDF embeds at least one image XObject, whitespace between tokens tolerated. */
export function hasImageXObject(bytes: Uint8Array): boolean {
	return /\/Subtype\s*\/Image\b/.test(asLatin1(bytes));
}
