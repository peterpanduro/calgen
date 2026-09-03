import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig, parseSizeLimit, type Env } from './config';

const PROD: Env = {
	NODE_ENV: 'production',
	ORIGIN: 'https://calgen.example.se',
	BODY_SIZE_LIMIT: '24M'
};

describe('defaults', () => {
	const cfg = parseConfig({});

	it('uses the documented default values', () => {
		expect(cfg).toMatchObject({
			port: 3000,
			host: '0.0.0.0',
			origin: null,
			bodySizeLimit: null,
			shutdownTimeout: 30,
			chromiumPath: null,
			chromiumNoSandbox: false,
			pdfConcurrency: 2,
			pdfTimeoutMs: 30_000,
			pdfQueueTimeoutMs: 15_000,
			maxUploadBytes: 20_971_520,
			logLevel: 'info',
			isProduction: false
		});
	});

	it('resolves the fonts directory under the working directory', () => {
		expect(cfg.fontsDir).toBe(path.resolve(process.cwd(), 'static/fonts'));
	});
});

describe('overrides', () => {
	it('reads every documented variable', () => {
		const cfg = parseConfig({
			...PROD,
			PORT: '8080',
			HOST: '127.0.0.1',
			SHUTDOWN_TIMEOUT: '5',
			FONTS_DIR: '/srv/fonts',
			CHROMIUM_PATH: '/usr/bin/chromium',
			CHROMIUM_NO_SANDBOX: 'true',
			PDF_CONCURRENCY: '4',
			PDF_TIMEOUT_MS: '45000',
			PDF_QUEUE_TIMEOUT_MS: '9000',
			MAX_UPLOAD_BYTES: '1048576',
			LOG_LEVEL: 'debug'
		});
		expect(cfg).toMatchObject({
			port: 8080,
			host: '127.0.0.1',
			origin: 'https://calgen.example.se',
			bodySizeLimit: 24 * 1024 * 1024,
			shutdownTimeout: 5,
			fontsDir: '/srv/fonts',
			chromiumPath: '/usr/bin/chromium',
			chromiumNoSandbox: true,
			pdfConcurrency: 4,
			pdfTimeoutMs: 45_000,
			pdfQueueTimeoutMs: 9_000,
			maxUploadBytes: 1_048_576,
			logLevel: 'debug',
			isProduction: true
		});
	});

	it('accepts CHROMIUM_NO_SANDBOX=false explicitly', () => {
		expect(parseConfig({ CHROMIUM_NO_SANDBOX: 'false' }).chromiumNoSandbox).toBe(false);
	});
});

describe('fail-fast validation', () => {
	it('rejects a production deployment with no ORIGIN', () => {
		expect(() => parseConfig({ NODE_ENV: 'production', BODY_SIZE_LIMIT: '24M' })).toThrow(/ORIGIN/);
	});

	it('allows development with no ORIGIN', () => {
		expect(() => parseConfig({})).not.toThrow();
	});

	it('rejects a production deployment with no BODY_SIZE_LIMIT', () => {
		expect(() => parseConfig({ NODE_ENV: 'production', ORIGIN: 'https://x' })).toThrow(
			/BODY_SIZE_LIMIT/
		);
	});

	it('rejects a BODY_SIZE_LIMIT below MAX_UPLOAD_BYTES + 1 MiB', () => {
		expect(() => parseConfig({ ...PROD, BODY_SIZE_LIMIT: '20M' })).toThrow(/at least/);
	});

	it('accepts a BODY_SIZE_LIMIT exactly at the threshold', () => {
		expect(() =>
			parseConfig({ ...PROD, BODY_SIZE_LIMIT: '21M', MAX_UPLOAD_BYTES: String(20 * 1024 * 1024) })
		).not.toThrow();
	});

	it.each(['abc', '-1', '2.5', '0x10', '1e3', ' 4 ', '+4'])(
		'rejects PDF_CONCURRENCY=%j as a non-decimal integer',
		(value) => {
			expect(() => parseConfig({ PDF_CONCURRENCY: value })).toThrow(/PDF_CONCURRENCY/);
		}
	);

	it('rejects PDF_CONCURRENCY=0', () => {
		expect(() => parseConfig({ PDF_CONCURRENCY: '0' })).toThrow(/at least 1/);
	});

	it.each(['PDF_TIMEOUT_MS', 'PDF_QUEUE_TIMEOUT_MS', 'MAX_UPLOAD_BYTES', 'PORT'])(
		'rejects %s=0, which would make every request fail instantly',
		(key) => {
			expect(() => parseConfig({ [key]: '0' })).toThrow(/at least 1/);
		}
	);

	it('still allows SHUTDOWN_TIMEOUT=0', () => {
		expect(parseConfig({ SHUTDOWN_TIMEOUT: '0' }).shutdownTimeout).toBe(0);
	});

	it('rejects an unknown LOG_LEVEL', () => {
		expect(() => parseConfig({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
	});

	it('rejects a non-boolean CHROMIUM_NO_SANDBOX', () => {
		expect(() => parseConfig({ CHROMIUM_NO_SANDBOX: 'yes' })).toThrow(/CHROMIUM_NO_SANDBOX/);
	});
});

describe('parseSizeLimit', () => {
	it.each([
		['512K', 512 * 1024],
		['24M', 24 * 1024 * 1024],
		['1G', 1024 * 1024 * 1024],
		['1024', 1024],
		['Infinity', Infinity]
	])('parses %s', (raw, expected) => {
		expect(parseSizeLimit(raw)).toBe(expected);
	});

	it('lets Infinity pass the minimum-size comparison', () => {
		expect(parseConfig({ ...PROD, BODY_SIZE_LIMIT: 'Infinity' }).bodySizeLimit).toBe(Infinity);
	});

	it.each(['24MB', '', 'lots', '-5M'])('rejects %j', (raw) => {
		expect(() => parseSizeLimit(raw)).toThrow(/BODY_SIZE_LIMIT/);
	});
});
