import process from 'node:process';
import { json } from '@sveltejs/kit';
import { version } from '$lib/server/version';
import type { RequestHandler } from './$types';

/**
 * Liveness probe.
 *
 * It deliberately does not touch Chromium: a health check that launches a browser turns a slow
 * render into a restart loop. Readiness of the PDF path is observable through the
 * `renderer_unavailable` rate in the logs (SPEC §8.2).
 */
export const GET: RequestHandler = () =>
	json(
		{ status: 'ok', uptime: process.uptime(), version },
		{ headers: { 'Cache-Control': 'no-store' } }
	);
