import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	clearImage,
	createAppState,
	dismissToast,
	revokeImageOnUnload,
	setImage,
	showToast,
	toOptions
} from './app-state.svelte';
import { DEFAULT_OPTIONS } from '$lib/calendar/types';

const jpeg = (name = 'a.jpg') =>
	new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' });

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
