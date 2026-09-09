import { describe, expect, it } from 'vitest';
import {
	MAX_ZOOM,
	MIN_ZOOM,
	PAGE_HEIGHT_PX,
	PAGE_WIDTH_PX,
	clampZoom,
	coverSize,
	nudge,
	overflow,
	panBy,
	zoomBy,
	type ImageSize,
	type Transform
} from './image-transform';

const W = PAGE_WIDTH_PX;
const H = PAGE_HEIGHT_PX;

const TALL: ImageSize = { width: 1000, height: 1000 };
const WIDE: ImageSize = { width: 4000, height: 2000 };
const NARROW: ImageSize = { width: 4000, height: 3000 };
const EXACT: ImageSize = { width: 2970, height: 2100 };

const at = (over: Partial<Transform> = {}): Transform => ({
	imageZoom: 1,
	imageX: 50,
	imageY: 50,
	...over
});

describe('page constants', () => {
	it('is A4 landscape in CSS pixels at 96 dpi', () => {
		expect(PAGE_WIDTH_PX).toBe((297 * 96) / 25.4);
		expect(PAGE_HEIGHT_PX).toBe((210 * 96) / 25.4);
	});
});

describe('coverSize', () => {
	it('binds on width for a square photo, overrunning in height', () => {
		const box = coverSize(TALL);
		expect(box.width).toBeCloseTo(W, 6);
		expect(box.height).toBeCloseTo(W, 6);
	});

	it('binds on width for a 4:3 photo, narrower than the page', () => {
		const box = coverSize(NARROW);
		expect(box.width).toBeCloseTo(W, 6);
		expect(box.height).toBeCloseTo(841.89, 2);
	});

	it('binds on height for a 2:1 photo, wider than the page', () => {
		const box = coverSize(WIDE);
		expect(box.height).toBeCloseTo(H, 6);
		expect(box.width).toBeCloseTo(1587.4, 1);
	});

	it.each([TALL, WIDE, NARROW, EXACT, { width: 100, height: 3000 }])(
		'covers the page for %j',
		(image) => {
			const box = coverSize(image);
			expect(box.width).toBeGreaterThanOrEqual(W - 1e-9);
			expect(box.height).toBeGreaterThanOrEqual(H - 1e-9);
		}
	);
});

describe('overflow', () => {
	it('is zero on both axes for a photo of exactly the page ratio', () => {
		const box = coverSize(EXACT);
		expect(box.width).toBeCloseTo(W, 6);
		expect(box.height).toBeCloseTo(H, 6);
		expect(overflow(EXACT, 1)).toEqual({ x: 0, y: 0 });
	});

	it('scales linearly in zoom', () => {
		expect(overflow(NARROW, 2).x).toBeCloseTo(2 * coverSize(NARROW).width - W, 6);
		expect(overflow(NARROW, 2).y).toBeCloseTo(2 * coverSize(NARROW).height - H, 6);
	});
});

describe('panBy', () => {
	it('leaves an axis without overflow untouched', () => {
		expect(panBy(at(), EXACT, 400, 0).imageX).toBe(50);
		expect(panBy(at(), EXACT, -400, 0).imageX).toBe(50);
	});

	it('moves the focal point against the drag, so the photo follows the pointer', () => {
		const moved = panBy(at({ imageZoom: 2 }), TALL, 40, 25);
		expect(moved.imageX).toBeLessThan(50);
		expect(moved.imageY).toBeLessThan(50);
	});

	it('clamps to the edges instead of running past them', () => {
		expect(panBy(at({ imageX: 0 }), WIDE, 5000, 0).imageX).toBe(0);
		expect(panBy(at({ imageX: 100 }), WIDE, -5000, 0).imageX).toBe(100);
	});

	it('is invertible inside the clamped range', () => {
		const start = at({ imageZoom: 2 });
		const back = panBy(panBy(start, TALL, 40, 25), TALL, -40, -25);
		expect(back.imageX).toBeCloseTo(start.imageX, 9);
		expect(back.imageY).toBeCloseTo(start.imageY, 9);
	});

	it('is calibrated in page pixels: a tenth of the overflow is ten points', () => {
		const start = at({ imageZoom: 2 });
		const dx = overflow(TALL, start.imageZoom).x / 10;
		expect(panBy(start, TALL, dx, 0).imageX).toBeCloseTo(40, 9);
	});
});

describe('zoomBy', () => {
	it('zooms in on wheel up and out on wheel down', () => {
		expect(zoomBy(at({ imageZoom: 2 }), -1).imageZoom).toBeGreaterThan(2);
		expect(zoomBy(at({ imageZoom: 2 }), 1).imageZoom).toBeLessThan(2);
	});

	it('returns the transform unchanged for a zero delta', () => {
		expect(zoomBy(at({ imageZoom: 2 }), 0)).toEqual(at({ imageZoom: 2 }));
	});

	it('reads only the sign, never the magnitude', () => {
		// deltaMode differs between wheels, trackpads and browsers; one notch is one step.
		expect(zoomBy(at(), -1)).toEqual(zoomBy(at(), -240));
	});

	it('clamps at both ends and never leaves the range', () => {
		expect(zoomBy(at({ imageZoom: MAX_ZOOM }), -1).imageZoom).toBe(MAX_ZOOM);
		expect(zoomBy(at({ imageZoom: MIN_ZOOM }), 1).imageZoom).toBe(MIN_ZOOM);
		let t = at();
		for (let i = 0; i < 40; i++) t = zoomBy(t, -1);
		for (let i = 0; i < 80; i++) t = zoomBy(t, 1);
		expect(t.imageZoom).toBeGreaterThanOrEqual(MIN_ZOOM);
		expect(t.imageZoom).toBeLessThanOrEqual(MAX_ZOOM);
	});

	it('never moves the focal point', () => {
		const start = at({ imageX: 20, imageY: 80 });
		expect(zoomBy(start, -1)).toMatchObject({ imageX: 20, imageY: 80 });
	});
});

describe('clampZoom', () => {
	it.each([
		[Number.NaN, MIN_ZOOM],
		[Number.POSITIVE_INFINITY, MAX_ZOOM],
		[0.5, MIN_ZOOM],
		[2.5, 2.5]
	])('clamps %f to %f', (input, expected) => {
		expect(clampZoom(input)).toBe(expected);
	});
});

describe('nudge', () => {
	// Unlike panBy the step is independent of how far the photo overflows.
	it.each([1, 4])('adds exactly one point per step at zoom %f', (imageZoom) => {
		expect(nudge(at({ imageZoom }), WIDE, 1, 0).imageX).toBeCloseTo(51, 9);
	});

	it('clamps to the range and leaves a non-overflowing axis alone', () => {
		expect(nudge(at({ imageX: 100 }), WIDE, 10, 0).imageX).toBe(100);
		expect(nudge(at({ imageX: 0 }), WIDE, -10, 0).imageX).toBe(0);
		expect(nudge(at(), EXACT, 1, 0).imageX).toBe(50);
	});

	it('agrees with a leftward drag on the direction the user experiences', () => {
		expect(nudge(at(), WIDE, 1, 0).imageX).toBeGreaterThan(50);
		expect(panBy(at(), WIDE, -40, 0).imageX).toBeGreaterThan(50);
	});
});
