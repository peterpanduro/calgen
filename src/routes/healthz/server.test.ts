import { describe, expect, it, vi } from 'vitest';

const getPdfRenderer = vi.fn(() => {
	throw new Error('the health check must never start a browser');
});
vi.mock('$lib/server/pdf/instance', () => ({
	getPdfRenderer,
	shutdownPdfRenderer: async () => {}
}));

const { GET } = await import('./+server');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the handler reads no event fields
const call = () => (GET as any)({});

describe('GET /healthz', () => {
	it('answers 200 with a JSON body', async () => {
		const res = await call();
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toMatch(/application\/json/);
	});

	it('reports status ok, an uptime and a version', async () => {
		const body = await (await call()).json();
		expect(body.status).toBe('ok');
		expect(typeof body.uptime).toBe('number');
		expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it('is never cached', async () => {
		expect((await call()).headers.get('cache-control')).toBe('no-store');
	});

	// A liveness probe that launches Chromium turns a slow render into a restart loop (§8.2).
	it('does not touch the renderer singleton', async () => {
		await call();
		expect(getPdfRenderer).not.toHaveBeenCalled();
	});
});
