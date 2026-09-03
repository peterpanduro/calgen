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
}

export const DEFAULT_OPTIONS: CalendarOptions = {
	year: 2026,
	month: 8,
	schemeId: 'organic',
	fontId: 'organic',
	opacity: 88,
	showHolidays: true,
	title: ''
};

export type ExportScope = 'month' | 'year';

/** A {@link CalendarOptions} plus the scope of the export request it belongs to. */
export interface ExportRequest extends CalendarOptions {
	scope: ExportScope;
}
