/**
 * Pan and zoom arithmetic for the background photo (SPEC §6.9).
 *
 * Dependency-free and pure — no DOM, no Svelte, no imports — so it runs in the plain `server`
 * vitest project. Nothing here knows about the preview's `scale`, elements or events;
 * `PreviewStage` converts screen deltas into page pixels before calling in.
 */

/** The printed page, in CSS pixels at 96 dpi: 297 mm. */
export const PAGE_WIDTH_PX = (297 * 96) / 25.4;
/** The printed page, in CSS pixels at 96 dpi: 210 mm. */
export const PAGE_HEIGHT_PX = (210 * 96) / 25.4;

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** One wheel notch. Multiplicative: a fixed step feels coarse at 1× and glacial at 4×. */
const ZOOM_STEP = 1.1;

export interface ImageSize {
	width: number;
	height: number;
}

export interface Transform {
	imageZoom: number;
	imageX: number;
	imageY: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Size the photo is rendered at by `cover` on the page, before zoom. */
export function coverSize(image: ImageSize): ImageSize {
	return {
		width: Math.max(PAGE_WIDTH_PX, (PAGE_HEIGHT_PX * image.width) / image.height),
		height: Math.max(PAGE_HEIGHT_PX, (PAGE_WIDTH_PX * image.height) / image.width)
	};
}

/** How far the photo overruns the page on each axis at this zoom. Never negative. */
export function overflow(image: ImageSize, zoom: number): { x: number; y: number } {
	const box = coverSize(image);
	return {
		x: Math.max(0, zoom * box.width - PAGE_WIDTH_PX),
		y: Math.max(0, zoom * box.height - PAGE_HEIGHT_PX)
	};
}

/**
 * Applies a percentage-point delta to a focal-point coordinate, clamped to `[0, 100]`.
 *
 * An axis with no overflow (`span === 0`) has nothing to reveal, so it is returned untouched
 * rather than clamped to an edge — and `delta` is then ignored, non-finite or not.
 */
const move = (value: number, delta: number, span: number): number =>
	span === 0 ? value : clamp(value + delta, 0, 100);

/**
 * New transform after dragging by `(dx, dy)` **page** pixels — not screen pixels and not
 * percent; a caller working in screen space must divide by the preview scale first.
 *
 * The focal point moves against the drag, which is what makes the photo follow the pointer.
 */
export function panBy(t: Transform, image: ImageSize, dx: number, dy: number): Transform {
	const room = overflow(image, t.imageZoom);
	return {
		imageZoom: t.imageZoom,
		imageX: move(t.imageX, (-100 * dx) / room.x, room.x),
		imageY: move(t.imageY, (-100 * dy) / room.y, room.y)
	};
}

/**
 * New transform after moving the focal point by whole percentage points (arrow keys).
 *
 * The keyboard sibling of {@link panBy}: same clamping and same axis lock, but a step that does
 * not depend on the overflow, so one press always moves the same visible amount. Its sign is
 * the focal point's — `ArrowRight` is `+1`.
 */
export function nudge(
	t: Transform,
	image: ImageSize,
	dxPercent: number,
	dyPercent: number
): Transform {
	const room = overflow(image, t.imageZoom);
	return {
		imageZoom: t.imageZoom,
		imageX: move(t.imageX, dxPercent, room.x),
		imageY: move(t.imageY, dyPercent, room.y)
	};
}

/**
 * New transform after one wheel notch. `deltaY < 0` (wheel up) zooms in.
 *
 * Only the sign is read: `deltaMode` differs between mouse wheels, trackpads and browsers, and
 * one notch must mean one step everywhere.
 */
export function zoomBy(t: Transform, deltaY: number): Transform {
	if (deltaY === 0) return t;
	return { ...t, imageZoom: clampZoom(t.imageZoom * (deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)) };
}

/** Clamps a zoom into `[MIN_ZOOM, MAX_ZOOM]`; `NaN` returns `MIN_ZOOM`, ±`Infinity` clamps into the range. */
export function clampZoom(zoom: number): number {
	if (Number.isNaN(zoom)) return MIN_ZOOM;
	return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}
