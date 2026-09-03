import { randomUUID } from 'node:crypto';
import { config } from '$lib/server/config';
import { log } from '$lib/server/log';
import { shutdownPdfRenderer } from '$lib/server/pdf/instance';
import type { HandleServerError, Handle } from '@sveltejs/kit';

/** Applied to every response (SPEC §8.5). CSP is configured through Kit in `vite.config.ts`. */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'no-referrer',
	'X-Frame-Options': 'DENY',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Resource-Policy': 'same-origin'
};

/** Noise that would otherwise dominate the log. */
const isBoring = (pathname: string): boolean =>
	pathname === '/healthz' || pathname.startsWith('/_app/');

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.id = randomUUID();
	const started = Date.now();

	const response = await resolve(event);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);

	// §8.1: the app document is tiny and always fresh. Hashed assets keep Kit's immutable caching.
	if (response.headers.get('content-type')?.startsWith('text/html'))
		response.headers.set('Cache-Control', 'no-store');

	if (!isBoring(event.url.pathname)) {
		log.info('http.request', {
			id: event.locals.id,
			method: event.request.method,
			path: event.url.pathname,
			status: response.status,
			ms: Date.now() - started
		});
	}
	return response;
};

export const handleError: HandleServerError = ({ error, event }) => {
	const id = event.locals.id ?? randomUUID();
	log.error('unhandled', {
		id,
		message: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined
	});
	return { message: 'Något gick fel.', id };
};

/**
 * Closes Chromium on the way down. adapter-node emits `sveltekit:shutdown` after draining
 * in-flight requests; the signal handlers cover `vite preview` and a bare `node build/index.js`
 * without the adapter's own listeners. Puppeteer's handlers are disabled at launch (SPEC §7.5).
 */
let shuttingDown: Promise<void> | null = null;
const shutdown = (reason: string): Promise<void> => {
	shuttingDown ??= (async () => {
		log.info('server.shutdown', { reason });
		await shutdownPdfRenderer();
	})();
	return shuttingDown;
};

process.on('sveltekit:shutdown', (reason) => void shutdown(String(reason)));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

log.info('server.start', {
	port: config.port,
	host: config.host,
	origin: config.origin,
	pdfConcurrency: config.pdfConcurrency,
	pdfTimeoutMs: config.pdfTimeoutMs,
	maxUploadBytes: config.maxUploadBytes,
	fontsDir: config.fontsDir,
	logLevel: config.logLevel
});
