import type { PaperSizeId } from './paper';

export type { PaperSizeId } from './paper';
export type SchemeId = 'organic' | 'skog' | 'neutral' | 'terrakotta' | 'hav' | 'natt';
export type FontId = 'organic' | 'klassisk' | 'lekfull' | 'modern';

/** Everything needed to render one calendar page, except the background image. */
export interface CalendarOptions {
	/** Gregorian year, integer, 2000–2100 inclusive. */
	year: number;
	/** Month index, integer, 0 = Januari … 11 = December. */
	month: number;
	schemeId: SchemeId;
	fontId: FontId;
	/** Day-box coverage in percent, integer, 30–100 inclusive. */
	opacity: number;
	showHolidays: boolean;
	/** Custom title. Empty string means "use the default `<Månad> <År>`". */
	title: string;
	/** Background-photo zoom. Finite, 1–4. 1 = plain `cover`. */
	imageZoom: number;
	/** Horizontal focal point of the photo, in `background-position` percent. Finite, 0–100. */
	imageX: number;
	/** Vertical focal point of the photo, in `background-position` percent. Finite, 0–100. */
	imageY: number;
	/** Paper size. `'A4'` (default) or `'A3'`; A3 is the same layout scaled (SPEC §4.11). */
	paperSize: PaperSizeId;
}

export const DEFAULT_OPTIONS: CalendarOptions = {
	year: 2026,
	month: 8,
	schemeId: 'organic',
	fontId: 'organic',
	opacity: 88,
	showHolidays: true,
	title: '',
	imageZoom: 1,
	imageX: 50,
	imageY: 50,
	paperSize: 'A4'
};

export type ExportScope = 'month' | 'year';

/** A {@link CalendarOptions} plus the scope of the export request it belongs to. */
export interface ExportRequest extends CalendarOptions {
	scope: ExportScope;
}
