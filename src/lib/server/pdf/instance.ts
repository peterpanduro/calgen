import { config } from '../config';
import { loadPrintFontCss } from '../fonts';
import { log } from '../log';
import { puppeteerBrowserFactory, resolveChromiumPathOrNull } from './puppeteer-browser';
import { createPdfRenderer } from './renderer';
import type { PdfRenderer } from './types';

let instance: PdfRenderer | null = null;

/** The process-wide renderer, created on first use. */
export function getPdfRenderer(): PdfRenderer {
	instance ??= createPdfRenderer({
		launch: puppeteerBrowserFactory(config),
		loadFontCss: (fonts) => loadPrintFontCss(fonts, config.fontsDir),
		concurrency: config.pdfConcurrency,
		timeoutMs: config.pdfTimeoutMs,
		queueTimeoutMs: config.pdfQueueTimeoutMs,
		executablePath: () => resolveChromiumPathOrNull(config.chromiumPath),
		log
	});
	return instance;
}

/** Shuts the renderer down, but only if one was ever created. */
export async function shutdownPdfRenderer(): Promise<void> {
	const current = instance;
	instance = null;
	await current?.shutdown();
}
