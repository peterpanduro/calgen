import { parseCalendarOptions, pdfFilename, stripScope, yearPages } from '$lib/calendar/options';
import type { ExportRequest } from '$lib/calendar/types';
import { config } from '$lib/server/config';
import { ALLOWED_IMAGE_TYPES, sniffImageType } from '$lib/server/image';
import { log } from '$lib/server/log';
import { getPdfRenderer } from '$lib/server/pdf/instance';
import { RenderError, type RenderErrorCode } from '$lib/server/pdf/types';
import type { RequestHandler } from './$types';

const STATUS_FOR: Record<RenderErrorCode, number> = {
	render_timeout: 504,
	renderer_busy: 503,
	renderer_unavailable: 503,
	internal_error: 500
};

/** JSON error body. `message` is English on purpose: this is a developer-facing API. */
const err = (status: number, error: string, message: string): Response =>
	new Response(JSON.stringify({ error, message }), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
	});

interface ImageResult {
	value: { bytes: Uint8Array; type: string } | null;
	error?: Response;
}

/** Validates the optional image part: declared type, size, and actual content. */
async function readImage(part: FormDataEntryValue | null): Promise<ImageResult> {
	if (part === null) return { value: null };
	if (!(part instanceof File))
		return { value: null, error: err(400, 'invalid_image', 'Part "image" must be a file.') };
	if (part.size === 0) return { value: null };
	if (part.size > config.maxUploadBytes)
		return {
			value: null,
			error: err(413, 'image_too_large', `Image exceeds the ${config.maxUploadBytes} byte limit.`)
		};
	if (!ALLOWED_IMAGE_TYPES.has(part.type))
		return {
			value: null,
			error: err(415, 'unsupported_image_type', 'Use image/jpeg, image/png or image/webp.')
		};

	const bytes = new Uint8Array(await part.arrayBuffer());
	if (sniffImageType(bytes) !== part.type)
		return {
			value: null,
			error: err(415, 'unsupported_image_type', 'Declared type does not match content.')
		};

	return { value: { bytes, type: part.type } };
}

/**
 * Renders a calendar PDF.
 *
 * `multipart/form-data` with an `options` JSON part and an optional `image` file part.
 * Cross-origin protection is SvelteKit's built-in CSRF check, which needs `ORIGIN` set in
 * production (SPEC §8.3).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!request.headers.get('content-type')?.startsWith('multipart/form-data'))
		return err(415, 'unsupported_media_type', 'Expected multipart/form-data.');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		// A truncated or malformed body would otherwise escape as SvelteKit's HTML error page.
		return err(400, 'invalid_multipart', 'Request body is not valid multipart/form-data.');
	}

	const raw = form.get('options');
	if (typeof raw !== 'string')
		return err(400, 'missing_options', 'Part "options" is required and must be a string.');

	let payload: unknown;
	try {
		payload = JSON.parse(raw);
	} catch {
		return err(400, 'invalid_json', 'Part "options" is not valid JSON.');
	}

	const parsed = parseCalendarOptions(payload);
	if (!parsed.ok) return err(400, parsed.code, parsed.message);

	const image = await readImage(form.get('image'));
	if (image.error) return image.error;

	const options: ExportRequest = parsed.value;
	const pages = options.scope === 'year' ? yearPages(options) : [stripScope(options)];

	try {
		const pdf = await getPdfRenderer().render(
			{ pages, image: image.value },
			{ id: locals.id, scope: options.scope }
		);
		// Copy into a plain ArrayBuffer view: puppeteer's Uint8Array is not a structural BodyInit.
		return new Response(new Blob([pdf as BlobPart], { type: 'application/pdf' }), {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="${pdfFilename(options)}"`,
				'Content-Length': String(pdf.length),
				'Cache-Control': 'no-store',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (cause) {
		if (cause instanceof RenderError) {
			// Logged only by the renderer (which owns the diagnostic message); see SPEC §8.6.
			return err(STATUS_FOR[cause.code], cause.code, 'PDF rendering failed.');
		}
		log.error('pdf.error', {
			id: locals.id,
			scope: options.scope,
			code: 'internal_error',
			message: cause instanceof Error ? cause.message : String(cause)
		});
		return err(500, 'internal_error', 'Unexpected error while rendering the PDF.');
	}
};
