import { describe, expect, it, vi } from 'vitest';
import { ExportError, exportPdf } from './export';
import { DEFAULT_OPTIONS } from '$lib/calendar/types';

const pdfBlob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });

type FetchSpy = ReturnType<typeof vi.fn<typeof fetch>>;

const ok = (headers: Record<string, string> = {}): FetchSpy =>
	vi.fn<typeof fetch>(async () => new Response(pdfBlob(), { status: 200, headers }));

const failing = (status: number, body: BodyInit, headers: Record<string, string> = {}): FetchSpy =>
	vi.fn<typeof fetch>(async () => new Response(body, { status, headers }));

const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], 'a.jpg', { type: 'image/jpeg' });

const bodyOf = (fetchImpl: FetchSpy): FormData => fetchImpl.mock.calls[0][1]?.body as FormData;

describe('request shape', () => {
	it('POSTs multipart form data to /api/pdf', async () => {
		const fetchImpl = ok();
		await exportPdf(DEFAULT_OPTIONS, 'month', null, fetchImpl);
		expect(fetchImpl.mock.calls[0][0]).toBe('/api/pdf');
		expect(fetchImpl.mock.calls[0][1]?.method).toBe('POST');
		expect(bodyOf(fetchImpl)).toBeInstanceOf(FormData);
	});

	it('sends the options with the requested scope', async () => {
		const fetchImpl = ok();
		await exportPdf(DEFAULT_OPTIONS, 'year', null, fetchImpl);
		const parsed = JSON.parse(bodyOf(fetchImpl).get('options') as string);
		expect(parsed).toEqual({ ...DEFAULT_OPTIONS, scope: 'year' });
	});

	it('omits the image part when there is no image', async () => {
		const fetchImpl = ok();
		await exportPdf(DEFAULT_OPTIONS, 'month', null, fetchImpl);
		expect(bodyOf(fetchImpl).has('image')).toBe(false);
	});

	it('attaches the image when there is one', async () => {
		const fetchImpl = ok();
		const file = jpeg();
		await exportPdf(DEFAULT_OPTIONS, 'month', file, fetchImpl);
		expect(bodyOf(fetchImpl).get('image')).toBe(file);
	});
});

describe('successful response', () => {
	it('returns the blob and the server filename', async () => {
		const result = await exportPdf(
			DEFAULT_OPTIONS,
			'month',
			null,
			ok({ 'content-disposition': 'attachment; filename="calgen-2026-09.pdf"' })
		);
		expect(result.filename).toBe('calgen-2026-09.pdf');
		expect(result.blob.size).toBe(3);
	});

	it('accepts an unquoted filename', async () => {
		const result = await exportPdf(
			DEFAULT_OPTIONS,
			'year',
			null,
			ok({ 'content-disposition': 'attachment; filename=calgen-2026.pdf' })
		);
		expect(result.filename).toBe('calgen-2026.pdf');
	});

	it('computes the filename when the header is missing', async () => {
		const result = await exportPdf(DEFAULT_OPTIONS, 'month', null, ok());
		expect(result.filename).toBe('calgen-2026-09.pdf');
	});

	it('computes the year filename when the header is missing', async () => {
		const result = await exportPdf(DEFAULT_OPTIONS, 'year', null, ok());
		expect(result.filename).toBe('calgen-2026.pdf');
	});
});

describe('error responses', () => {
	it('throws the code from a JSON error body', async () => {
		const fetchImpl = failing(413, JSON.stringify({ error: 'image_too_large' }), {
			'content-type': 'application/json'
		});
		await expect(exportPdf(DEFAULT_OPTIONS, 'month', null, fetchImpl)).rejects.toMatchObject({
			code: 'image_too_large'
		});
	});

	it.each([
		[413, 'image_too_large'],
		[415, 'unsupported_image_type'],
		[403, 'internal_error'],
		[500, 'internal_error']
	])('falls back on status %i when the body is not JSON', async (status, code) => {
		const fetchImpl = failing(status, '<html>Request entity too large</html>', {
			'content-type': 'text/html'
		});
		await expect(exportPdf(DEFAULT_OPTIONS, 'month', null, fetchImpl)).rejects.toMatchObject({
			code
		});
	});

	it('maps a network failure to the network code', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => {
			throw new TypeError('Failed to fetch');
		});
		await expect(exportPdf(DEFAULT_OPTIONS, 'month', null, fetchImpl)).rejects.toMatchObject({
			code: 'network'
		});
	});

	it('exposes the code on the error instance', () => {
		expect(new ExportError('renderer_busy')).toBeInstanceOf(Error);
		expect(new ExportError('renderer_busy').code).toBe('renderer_busy');
	});
});
