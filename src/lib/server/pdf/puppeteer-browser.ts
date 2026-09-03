import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import type { Config } from '../config';
import { RenderError, type BrowserFactory, type BrowserLike } from './types';

/** Where a system Chromium usually lives, in the order we try. */
const CANDIDATE_PATHS = [
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
	'/usr/bin/google-chrome',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

/** The configured executable, or the first system Chromium that exists. `null` when none does. */
export function resolveChromiumPathOrNull(chromiumPath?: string | null): string | null {
	if (chromiumPath) return existsSync(chromiumPath) ? chromiumPath : null;
	return CANDIDATE_PATHS.find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * Resolves the Chromium executable.
 *
 * @throws `RenderError('renderer_unavailable')` when nothing was found. The searched paths go
 *   in the message, which is logged but never returned to the client.
 */
export function resolveChromiumPath(cfg: Pick<Config, 'chromiumPath'>): string {
	const found = resolveChromiumPathOrNull(cfg.chromiumPath);
	if (found) return found;
	throw new RenderError(
		'renderer_unavailable',
		`No Chromium executable found. Searched: ${[cfg.chromiumPath, ...CANDIDATE_PATHS].filter(Boolean).join(', ')}`
	);
}

/**
 * The real {@link BrowserFactory}. This is the only module allowed to import `puppeteer-core`.
 *
 * `pipe: true` removes the localhost DevTools WebSocket entirely, and the three `handleSIG*`
 * flags hand signal handling to adapter-node and tini — puppeteer's own `SIGINT` handler calls
 * `process.exit(130)`, which would defeat graceful shutdown (SPEC §7.5).
 */
export const puppeteerBrowserFactory =
	(cfg: Config): BrowserFactory =>
	async () =>
		(await puppeteer.launch({
			executablePath: resolveChromiumPath(cfg),
			headless: true,
			protocolTimeout: cfg.pdfTimeoutMs + 15_000,
			timeout: 30_000,
			dumpio: cfg.logLevel === 'debug',
			pipe: true,
			handleSIGINT: false,
			handleSIGTERM: false,
			handleSIGHUP: false,
			args: [
				'--disable-dev-shm-usage',
				'--disable-gpu',
				'--hide-scrollbars',
				'--font-render-hinting=none',
				'--disable-extensions',
				'--disable-background-networking',
				'--disable-features=Translate,BackForwardCache,AcceptCHFrame',
				'--no-first-run',
				'--no-default-browser-check',
				// Hard network kill-switch: the render can never reach out.
				'--host-resolver-rules=MAP * ~NOTFOUND',
				...(cfg.chromiumNoSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : [])
			]
		})) as unknown as BrowserLike;
