import { DEFAULT_OPTIONS, type CalendarOptions, type ExportScope } from '$lib/calendar/types';
import { FALLBACK_MESSAGE } from './errors';
import type { ImageSize } from './image-transform';

export type ToastKind = 'error' | 'info';

/** Everything the app screen needs: the calendar options plus purely client-side concerns. */
export interface AppState extends CalendarOptions {
	/** The selected file, kept for upload. */
	imageFile: File | null;
	/** Object URL for the preview; revoked whenever it is replaced or cleared. */
	imageUrl: string | null;
	/**
	 * Natural pixel size of the photo, once measured. Client-only: it is needed to know how far
	 * the photo overflows the page (SPEC §6.9) and for nothing else, so it is never sent.
	 */
	imageSize: ImageSize | null;
	exporting: ExportScope | null;
	toast: { kind: ToastKind; text: string } | null;
}

/** A fresh reactive app state, seeded with the default calendar options. */
export function createAppState(): AppState {
	const state: AppState = $state({
		...DEFAULT_OPTIONS,
		imageFile: null,
		imageUrl: null,
		imageSize: null,
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
		title: state.title,
		imageZoom: state.imageZoom,
		imageX: state.imageX,
		imageY: state.imageY,
		paperSize: state.paperSize,
		taskList: state.taskList,
		taskListTitle: state.taskListTitle
	};
}

/** Restores the default zoom and focal point, touching nothing else. */
export function resetImageTransform(state: AppState): void {
	state.imageZoom = DEFAULT_OPTIONS.imageZoom;
	state.imageX = DEFAULT_OPTIONS.imageX;
	state.imageY = DEFAULT_OPTIONS.imageY;
}

/** Loads a URL and reports the decoded pixel size. Injected so the module is testable. */
export type ImageMeasurer = (url: string) => Promise<ImageSize>;

const decodeImage: ImageMeasurer = (url) =>
	new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
		image.onerror = () => reject(new Error('Could not decode the background image'));
		image.src = url;
	});

/**
 * Measures the current photo into `state.imageSize`.
 *
 * A photo the browser cannot decode is reported as a toast rather than thrown: the preview is
 * already correct without a measurement (the transform is at its default), so there is nothing
 * for a caller to recover from.
 *
 * Both outcomes are dropped when the photo was replaced or removed while the measurement was in
 * flight: a stale size would describe the wrong photo, and a stale failure would blame the new
 * one for the old one's decode error.
 */
export async function measureImage(
	state: AppState,
	measure: ImageMeasurer = decodeImage
): Promise<void> {
	const url = state.imageUrl;
	if (!url) return;
	try {
		const size = await measure(url);
		// A zero dimension is not a measurement: `coverSize` would divide by it and leak NaN into
		// the focal point. Leaving `imageSize` null just means the drag surface is not offered.
		if (state.imageUrl === url && size.width > 0 && size.height > 0) state.imageSize = size;
	} catch {
		if (state.imageUrl === url) showToast(state, 'error', FALLBACK_MESSAGE);
	}
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
	forgetImageGeometry(state);
}

/**
 * Drops the measurement and the transform.
 *
 * A transform belongs to the photo it was chosen for: carrying a 4× zoom on the left edge over
 * to a different photo would show the user a crop they never picked.
 */
function forgetImageGeometry(state: AppState): void {
	state.imageSize = null;
	resetImageTransform(state);
}

/** Removes the background image and releases its object URL. */
export function clearImage(state: AppState): void {
	if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
	state.imageFile = null;
	state.imageUrl = null;
	forgetImageGeometry(state);
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
