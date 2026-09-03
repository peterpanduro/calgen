import { DEFAULT_OPTIONS, type CalendarOptions, type ExportScope } from '$lib/calendar/types';

export type ToastKind = 'error' | 'info';

/** Everything the app screen needs: the calendar options plus purely client-side concerns. */
export interface AppState extends CalendarOptions {
	/** The selected file, kept for upload. */
	imageFile: File | null;
	/** Object URL for the preview; revoked whenever it is replaced or cleared. */
	imageUrl: string | null;
	exporting: ExportScope | null;
	toast: { kind: ToastKind; text: string } | null;
}

/** A fresh reactive app state, seeded with the default calendar options. */
export function createAppState(): AppState {
	const state: AppState = $state({
		...DEFAULT_OPTIONS,
		imageFile: null,
		imageUrl: null,
		exporting: null,
		toast: null
	});
	return state;
}

/** Projects the calendar options out of the state, dropping every client-only field. */
export function toOptions(state: AppState): CalendarOptions {
	return {
		year: state.year,
		month: state.month,
		schemeId: state.schemeId,
		fontId: state.fontId,
		opacity: state.opacity,
		showHolidays: state.showHolidays,
		title: state.title
	};
}

/**
 * Selects a background image, revoking any previous object URL.
 *
 * Object URLs rather than data URLs: a 20 MB photo would otherwise sit in memory as a ~27 MB
 * base64 string for the whole session.
 */
export function setImage(state: AppState, file: File): void {
	if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
	state.imageFile = file;
	state.imageUrl = URL.createObjectURL(file);
}

/** Removes the background image and releases its object URL. */
export function clearImage(state: AppState): void {
	if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
	state.imageFile = null;
	state.imageUrl = null;
}

/** Replaces the current toast. */
export function showToast(state: AppState, kind: ToastKind, text: string): void {
	state.toast = { kind, text };
}

/** Hides the current toast. */
export function dismissToast(state: AppState): void {
	state.toast = null;
}

/**
 * Releases the preview object URL when the page goes away (SPEC §6.5).
 *
 * @returns a teardown function, so a component `$effect` can remove the listener.
 */
export function revokeImageOnUnload(state: AppState): () => void {
	const release = (event: PageTransitionEvent) => {
		// `persisted` means the page went into the back/forward cache and can be restored as-is.
		// Revoking then would bring the user back to a preview pointing at a dead blob URL.
		if (event.persisted) return;
		if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
	};
	window.addEventListener('pagehide', release);
	return () => window.removeEventListener('pagehide', release);
}
