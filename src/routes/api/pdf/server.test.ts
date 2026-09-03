import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderError, type RenderContext, type RenderJob } from '$lib/server/pdf/types';
import { DEFAULT_OPTIONS } from '$lib/calendar/types';

const FAKE_PDF = new Uint8Array(Buffer.from('%PDF-1.4 fake\n%%EOF'));

const render = vi.fn<(job: RenderJob, context?: RenderContext) => Promise<Uint8Array>>();
vi.mock('$lib/server/pdf/instance', () => ({
	getPdfRenderer: () => ({ render, shutdown: async () => {} }),
	shutdownPdfRenderer: async () => {}
}));

const { POST } = await import('./+server');

const jpeg = () =>
	new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'a.jpg', { type: 'image/jpeg' });
const png = () =>
	new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'a.png', {
		type: 'image/png'
	});
const webp = () =>
	new File(
		[new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])],
		'a.webp',
		{
			type: 'image/webp'
		}
	);

function post(body: BodyInit | null, headers?: HeadersInit) {
	const request = new Request('http://localhost/api/pdf', { method: 'POST', body, headers });
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the handler only reads `request`
	return (POST as any)({ request, locals: { id: 'test-id' } });
}

function form(options: unknown, image?: File) {
	const fd = new FormData();
	if (options !== undefined)
		fd.set('options', typeof options === 'string' ? options : JSON.stringify(options));
	if (image) fd.set('image', image);
	return fd;
}

const monthRequest = { ...DEFAULT_OPTIONS, scope: 'month' };
const yearRequest = { ...DEFAULT_OPTIONS, scope: 'year' };

beforeEach(() => {
	render.mockReset();
	render.mockResolvedValue(FAKE_PDF);
});

describe('happy path', () => {
	it('returns the PDF with the month filename', async () => {
		const res = await post(form(monthRequest));
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/pdf');
		expect(res.headers.get('content-disposition')).toBe(
			'attachment; filename="calgen-2026-09.pdf"'
		);
		expect(res.headers.get('content-length')).toBe(String(FAKE_PDF.length));
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
	});

	it('renders a single page for a month scope', async () => {
		await post(form(monthRequest));
		expect(render.mock.calls[0][0].pages).toHaveLength(1);
		expect(render.mock.calls[0][0].imageDataUrl).toBeNull();
	});

	it('renders twelve pages with the year filename for a year scope', async () => {
		const res = await post(form(yearRequest));
		expect(res.headers.get('content-disposition')).toBe('attachment; filename="calgen-2026.pdf"');
		expect(render.mock.calls[0][0].pages).toHaveLength(12);
	});

	it('drops the scope key before handing options to the renderer', async () => {
		await post(form(monthRequest));
		expect('scope' in render.mock.calls[0][0].pages[0]).toBe(false);
	});

	it('passes the request id and scope to the renderer for logging', async () => {
		await post(form(yearRequest));
		expect(render.mock.calls[0][1]).toEqual({ id: 'test-id', scope: 'year' });
	});

	it.each([
		['jpeg', jpeg],
		['png', png],
		['webp', webp]
	])('accepts a %s background and passes a data URL', async (_name, make) => {
		const file = make();
		await post(form(monthRequest, file));
		expect(render.mock.calls[0][0].imageDataUrl).toMatch(new RegExp(`^data:${file.type};base64,`));
	});

	it('ignores an empty image part', async () => {
		const empty = new File([], 'a.jpg', { type: 'image/jpeg' });
		await post(form(monthRequest, empty));
		expect(render.mock.calls[0][0].imageDataUrl).toBeNull();
	});
});

describe('request validation', () => {
	it('rejects a non-multipart request with 415', async () => {
		const res = await post(JSON.stringify(monthRequest), { 'content-type': 'application/json' });
		expect(res.status).toBe(415);
		expect((await res.json()).error).toBe('unsupported_media_type');
	});

	it('rejects a malformed multipart body with 400 invalid_multipart', async () => {
		// A boundary the body never uses: formData() cannot parse this.
		const res = await post('--nope\r\nnot a part\r\n', {
			'content-type': 'multipart/form-data; boundary=----definitelywrong'
		});
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe('invalid_multipart');
	});

	it('rejects a missing options part with 400', async () => {
		const res = await post(form(undefined));
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe('missing_options');
	});

	it('rejects malformed JSON with 400', async () => {
		const res = await post(form('{not json'));
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe('invalid_json');
	});

	it.each([
		[{ year: 1999 }, 'invalid_year'],
		[{ month: 12 }, 'invalid_month'],
		[{ schemeId: 'x' }, 'invalid_scheme'],
		[{ fontId: 'x' }, 'invalid_font'],
		[{ opacity: 5 }, 'invalid_opacity'],
		[{ showHolidays: 'x' }, 'invalid_show_holidays'],
		[{ title: 42 }, 'invalid_title'],
		[{ scope: 'week' }, 'invalid_scope']
	])('rejects %j with 400 %s', async (patch, code) => {
		const res = await post(form({ ...monthRequest, ...patch }));
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe(code);
	});

	it('rejects a non-object payload with 400', async () => {
		const res = await post(form('[]'));
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe('invalid_options');
	});

	it('never renders when validation fails', async () => {
		await post(form({ ...monthRequest, year: 1 }));
		expect(render).not.toHaveBeenCalled();
	});
});

describe('image validation', () => {
	it('rejects an oversized image with 413', async () => {
		const big = new File([new Uint8Array(30 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
		const res = await post(form(monthRequest, big));
		expect(res.status).toBe(413);
		expect((await res.json()).error).toBe('image_too_large');
	});

	it('rejects an unsupported declared type with 415', async () => {
		const gif = new File([new Uint8Array([0x47, 0x49, 0x46, 0x38])], 'a.gif', {
			type: 'image/gif'
		});
		const res = await post(form(monthRequest, gif));
		expect(res.status).toBe(415);
		expect((await res.json()).error).toBe('unsupported_image_type');
	});

	it('rejects content that does not match the declared type with 415', async () => {
		const liar = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'a.png', {
			type: 'image/png'
		});
		const res = await post(form(monthRequest, liar));
		expect(res.status).toBe(415);
		expect((await res.json()).error).toBe('unsupported_image_type');
	});

	it('rejects a renamed SVG with 415', async () => {
		const svg = new File([new TextEncoder().encode('<svg xmlns="x"/>')], 'a.jpg', {
			type: 'image/jpeg'
		});
		const res = await post(form(monthRequest, svg));
		expect(res.status).toBe(415);
	});

	it('rejects a non-file image part with 400', async () => {
		const fd = new FormData();
		fd.set('options', JSON.stringify(monthRequest));
		fd.set('image', 'not-a-file');
		const res = await post(fd);
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe('invalid_image');
	});
});

describe('renderer failures', () => {
	it.each([
		['render_timeout', 504],
		['renderer_busy', 503],
		['renderer_unavailable', 503],
		['internal_error', 500]
	] as const)('maps %s to %i', async (code, status) => {
		render.mockRejectedValue(new RenderError(code));
		const res = await post(form(monthRequest));
		expect(res.status).toBe(status);
		expect((await res.json()).error).toBe(code);
	});

	it('maps an unexpected throw to 500 without leaking the stack', async () => {
		render.mockRejectedValue(new Error('secret path /usr/bin/chromium'));
		const res = await post(form(monthRequest));
		const body = await res.json();
		expect(res.status).toBe(500);
		expect(body.error).toBe('internal_error');
		expect(JSON.stringify(body)).not.toContain('chromium');
	});
});
