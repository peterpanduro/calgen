import type { FontId } from './types';

/** A heading + body font pairing. */
export interface FontPairing {
	id: FontId;
	name: string;
	/** CSS font-family value, e.g. `"'Caprasimo', serif"`. */
	heading: string;
	body: string;
	/**
	 * The weight the heading face is actually shipped at. Declared explicitly so self-hosted
	 * single-weight `@font-face` families cannot fall back silently (SPEC §5.3).
	 */
	headingWeight: 400 | 500 | 600;
	/** Family names as they appear in `@font-face`, for print-time font selection. */
	headingFamily: string;
	bodyFamily: string;
}

/* prettier-ignore */
export const FONTS = [
	{ id:'organic',  name:'Caprasimo + Figtree',    heading:"'Caprasimo', serif",                body:"'Figtree', sans-serif",         headingWeight:400, headingFamily:'Caprasimo',           bodyFamily:'Figtree' },
	{ id:'klassisk', name:'Playfair + Source Sans', heading:"'Playfair Display', serif",         body:"'Source Sans 3', sans-serif",   headingWeight:500, headingFamily:'Playfair Display',    bodyFamily:'Source Sans 3' },
	{ id:'lekfull',  name:'Fredoka + Nunito',       heading:"'Fredoka', sans-serif",             body:"'Nunito', sans-serif",          headingWeight:500, headingFamily:'Fredoka',             bodyFamily:'Nunito' },
	{ id:'modern',   name:'Bricolage + Instrument', heading:"'Bricolage Grotesque', sans-serif", body:"'Instrument Sans', sans-serif", headingWeight:600, headingFamily:'Bricolage Grotesque', bodyFamily:'Instrument Sans' }
] as const satisfies readonly FontPairing[];

/**
 * Looks up a font pairing by id.
 *
 * @throws when the id is not one of the four.
 */
export function getFont(id: FontId): FontPairing {
	const hit = FONTS.find((f) => f.id === id);
	if (!hit) throw new Error(`Unknown font id: ${id}`);
	return hit;
}
