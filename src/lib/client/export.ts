import { pdfFilename } from '$lib/calendar/options';
import type { CalendarOptions, ExportScope } from '$lib/calendar/types';

/** An export failure carrying an API error code for {@link errorMessage}. */
export class ExportError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'ExportError';
	}
}

export interface ExportResult {
	blob: Blob;
	filename: string;
}

/**
 * Status codes adapter-node can produce before our handler runs — it rejects an oversized body
 * itself and SvelteKit serves an HTML error page, so there is no JSON `error` to read.
 */
const STATUS_FALLBACK: Readonly<Record<number, string>> = {
	413: 'image_too_large',
	415: 'unsupported_image_type'
};

const FILENAME = /filename="?([^";]+)"?/;

async function codeOf(response: Response): Promise<string> {
	try {
		const body = await response.json();
		if (body && typeof body.error === 'string') return body.error;
	} catch {
		// Not a JSON body; fall through to the status-code table.
	}
	return STATUS_FALLBACK[response.status] ?? 'internal_error';
}

/**
 * Posts the current options (and the optional background) to `/api/pdf`.
 *
 * @param fetchImpl injected so the module is unit-testable without a DI container.
 * @throws {@link ExportError} with an API error code, or `'network'` when the request failed.
 */
export async function exportPdf(
	opts: CalendarOptions,
	scope: ExportScope,
	image: File | null,
	fetchImpl: typeof fetch = fetch
): Promise<ExportResult> {
	const body = new FormData();
	body.set('options', JSON.stringify({ ...opts, scope }));
	if (image) body.set('image', image);

	let response: Response;
	try {
		response = await fetchImpl('/api/pdf', { method: 'POST', body });
	} catch {
		throw new ExportError('network');
	}

	if (!response.ok) throw new ExportError(await codeOf(response));

	const disposition = response.headers.get('content-disposition') ?? '';
	const filename = FILENAME.exec(disposition)?.[1] ?? pdfFilename({ ...opts, scope });
	return { blob: await response.blob(), filename };
}

/** Hands the blob to the browser as a download, then releases the object URL. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	// Firefox and Safari read the blob asynchronously; revoking in the same tick truncates it.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
