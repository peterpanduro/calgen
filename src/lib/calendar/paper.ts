export type PaperSizeId = 'A4' | 'A3';

/** A printable sheet size. The A4 layout page (§2.5.3, SPEC §4.11) is scaled onto it. */
export interface PaperSize {
	id: PaperSizeId;
	name: string;
	widthMm: number;
	heightMm: number;
	/** Multiplied into `page.pdf({ scale })`; A4's is the literal `1`, so A4 output is
	 *  object-identical to the pre-A3 `PdfOptions` (SPEC §4.11). */
	scale: number;
}

/**
 * `1.414`, truncated rather than rounded to the nearest thousandth. `Math.SQRT2` and the exact
 * ratio `420/297` both land the scaled content on or past the sheet edge — see SPEC §4.11 for
 * the full derivation and the measured slack.
 */
const A3_SCALE = 1.414;

/* prettier-ignore */
export const PAPER_SIZES: readonly PaperSize[] = [
	{ id:'A4', name:'A4', widthMm:297, heightMm:210, scale:1 },
	{ id:'A3', name:'A3', widthMm:420, heightMm:297, scale:A3_SCALE }
] as const satisfies readonly PaperSize[];

/**
 * Looks up a paper size by id.
 *
 * @throws when the id is not one of the two.
 */
export function getPaperSize(id: PaperSizeId): PaperSize {
	const hit = PAPER_SIZES.find((p) => p.id === id);
	if (!hit) throw new Error(`Unknown paper size id: ${id}`);
	return hit;
}
