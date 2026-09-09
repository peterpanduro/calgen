import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	clearImage,
	createAppState,
	dismissToast,
	measureImage,
	resetImageTransform,
	revokeImageOnUnload,
	setImage,
	showToast,
	toOptions
} from './app-state.svelte';
import { FALLBACK_MESSAGE } from './errors';
import { DEFAULT_OPTIONS } from '$lib/calendar/types';

const jpeg = (name = 'a.jpg') =>
	new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' });

/** A promise whose settlement the test drives, so a measurement can be left in flight. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	// Nothing awaits a rejection until `measureImage` does; keep Node from calling it unhandled.
	promise.catch(() => {});
	return { promise, resolve, reject };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('createAppState', () => {
	it('starts from the default calendar options', () => {
		expect(toOptions(createAppState())).toEqual(DEFAULT_OPTIONS);
	});

	it('starts with no image, no export in flight and no toast', () => {
		const state = createAppState();
		expect(state.imageFile).toBeNull();
		expect(state.imageUrl).toBeNull();
		expect(state.exporting).toBeNull();
		expect(state.toast).toBeNull();
		expect(state.imageSize).toBeNull();
	});
});

describe('toOptions', () => {
	it('projects only the calendar options, never the client-only fields', () => {
		const state = createAppState();
		state.title = 'Vår trädgård';
		state.exporting = 'year';
		const options = toOptions(state);
		expect(options.title).toBe('Vår trädgård');
		expect('exporting' in options).toBe(false);
		expect('imageFile' in options).toBe(false);
	});

	it('carries the image transform but never the measured size', () => {
		const state = createAppState();
		state.imageZoom = 2.5;
		state.imageX = 10;
		state.imageY = 90;
		state.imageSize = { width: 4000, height: 3000 };
		const options = toOptions(state);
		expect(options).toMatchObject({ imageZoom: 2.5, imageX: 10, imageY: 90 });
		expect('imageSize' in options).toBe(false);
	});
});

describe('resetImageTransform', () => {
	it('restores the default zoom and focal point and nothing else', () => {
		const state = createAppState();
		Object.assign(state, { imageZoom: 3, imageX: 0, imageY: 100, opacity: 40 });
		resetImageTransform(state);
		expect(toOptions(state)).toMatchObject({ imageZoom: 1, imageX: 50, imageY: 50, opacity: 40 });
	});
});

describe('measureImage', () => {
	it('stores the decoded pixel size for the current object URL', async () => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one');
		const state = createAppState();
		setImage(state, jpeg());
		const measure = vi.fn(async () => ({ width: 4000, height: 3000 }));
		await measureImage(state, measure);
		expect(measure).toHaveBeenCalledExactlyOnceWith('blob:one');
		expect(state.imageSize).toEqual({ width: 4000, height: 3000 });
	});

	it('does nothing when no image is set', async () => {
		const measure = vi.fn(async () => ({ width: 1, height: 1 }));
		const state = createAppState();
		await measureImage(state, measure);
		expect(measure).not.toHaveBeenCalled();
		expect(state.imageSize).toBeNull();
	});

	it('reports an undecodable photo as a toast instead of throwing at the caller', async () => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one');
		const state = createAppState();
		setImage(state, jpeg());
		await expect(
			measureImage(state, async () => {
				throw new Error('decode failed');
			})
		).resolves.toBeUndefined();
		expect(state.imageSize).toBeNull();
		expect(state.toast).toEqual({ kind: 'error', text: FALLBACK_MESSAGE });
	});

	it('ignores a measurement that resolves after the photo was replaced', async () => {
		const create = vi.spyOn(URL, 'createObjectURL');
		create.mockReturnValueOnce('blob:one').mockReturnValueOnce('blob:two');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const state = createAppState();
		setImage(state, jpeg('one.jpg'));
		const settle = deferred<{ width: number; height: number }>();
		const pending = measureImage(state, () => settle.promise);
		setImage(state, jpeg('two.jpg'));
		settle.resolve({ width: 4000, height: 3000 });
		await pending;
		expect(state.imageSize).toBeNull();
	});

	it('stays silent when a measurement fails after the photo was replaced', async () => {
		const create = vi.spyOn(URL, 'createObjectURL');
		create.mockReturnValueOnce('blob:one').mockReturnValueOnce('blob:two');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const state = createAppState();
		setImage(state, jpeg('one.jpg'));
		const settle = deferred<{ width: number; height: number }>();
		const pending = measureImage(state, () => settle.promise);
		setImage(state, jpeg('two.jpg'));
		settle.reject(new Error('decode failed'));
		await pending;
		expect(state.toast).toBeNull();
	});

	// A 0×0 measurement would make coverSize divide by zero and leak NaN into imageX/imageY.
	it('rejects a degenerate measurement rather than storing a zero dimension', async () => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one');
		const state = createAppState();
		setImage(state, jpeg());
		await measureImage(state, async () => ({ width: 0, height: 0 }));
		expect(state.imageSize).toBeNull();
	});
});

describe('setImage / clearImage', () => {
	it('stores the file and an object URL', () => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one');
		const state = createAppState();
		const file = jpeg();
		setImage(state, file);
		expect(state.imageFile).toBe(file);
		expect(state.imageUrl).toBe('blob:one');
	});

	it('revokes the previous object URL when the image is replaced', () => {
		const create = vi.spyOn(URL, 'createObjectURL');
		create.mockReturnValueOnce('blob:one').mockReturnValueOnce('blob:two');
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const state = createAppState();
		setImage(state, jpeg('one.jpg'));
		setImage(state, jpeg('two.jpg'));
		expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:one');
		expect(state.imageUrl).toBe('blob:two');
	});

	it('revokes the object URL and forgets the file when cleared', () => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one');
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const state = createAppState();
		setImage(state, jpeg());
		clearImage(state);
		expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:one');
		expect(state.imageFile).toBeNull();
		expect(state.imageUrl).toBeNull();
	});

	// A transform is meaningful only against the photo it was chosen for.
	it.each([
		['setImage', (state: ReturnType<typeof createAppState>) => setImage(state, jpeg('two.jpg'))],
		['clearImage', clearImage]
	])('resets the transform and forgets the measured size on %s', (_name, act) => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const state = createAppState();
		setImage(state, jpeg());
		Object.assign(state, {
			imageZoom: 4,
			imageX: 0,
			imageY: 100,
			imageSize: { width: 4000, height: 3000 }
		});
		act(state);
		expect(state.imageSize).toBeNull();
		expect(toOptions(state)).toMatchObject({ imageZoom: 1, imageX: 50, imageY: 50 });
	});

	it('is a no-op when clearing with no image set', () => {
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		clearImage(createAppState());
		expect(revoke).not.toHaveBeenCalled();
	});
});

describe('toasts', () => {
	it('stores kind and text', () => {
		const state = createAppState();
		showToast(state, 'error', 'Bilden är för stor. Max 20 MB.');
		expect(state.toast).toEqual({ kind: 'error', text: 'Bilden är för stor. Max 20 MB.' });
	});

	it('replaces an existing toast', () => {
		const state = createAppState();
		showToast(state, 'error', 'ett');
		showToast(state, 'info', 'två');
		expect(state.toast).toEqual({ kind: 'info', text: 'två' });
	});

	it('clears on dismiss', () => {
		const state = createAppState();
		showToast(state, 'error', 'ett');
		dismissToast(state);
		expect(state.toast).toBeNull();
	});
});

describe('revokeImageOnUnload', () => {
	/** Node 24 has no `window`; a two-method stand-in is all the helper touches. */
	function fakeWindow() {
		const listeners = new Map<string, (event: { persisted: boolean }) => void>();
		const stub = {
			addEventListener: (type: string, fn: (event: { persisted: boolean }) => void) =>
				listeners.set(type, fn),
			removeEventListener: (type: string) => listeners.delete(type)
		};
		vi.stubGlobal('window', stub);
		return listeners;
	}

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('releases the object URL when the page goes away', () => {
		const listeners = fakeWindow();
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one');
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const state = createAppState();
		setImage(state, jpeg());
		revokeImageOnUnload(state);
		listeners.get('pagehide')?.({ persisted: false });
		expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:one');
	});

	it('does nothing when no image is set', () => {
		const listeners = fakeWindow();
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		revokeImageOnUnload(createAppState());
		listeners.get('pagehide')?.({ persisted: false });
		expect(revoke).not.toHaveBeenCalled();
	});

	it('keeps the object URL when the page only goes into the back/forward cache', () => {
		const listeners = fakeWindow();
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one');
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const state = createAppState();
		setImage(state, jpeg());
		revokeImageOnUnload(state);
		listeners.get('pagehide')?.({ persisted: true });
		expect(revoke).not.toHaveBeenCalled();
		expect(state.imageUrl).toBe('blob:one');
	});

	it('removes its listener on teardown', () => {
		const listeners = fakeWindow();
		revokeImageOnUnload(createAppState())();
		expect(listeners.has('pagehide')).toBe(false);
	});
});
