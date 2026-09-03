import process from 'node:process';
import { building } from '$app/environment';
import { fontsDir } from './fonts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Config {
	port: number;
	host: string;
	/** Public origin. Required in production, or SvelteKit's CSRF check rejects POSTs with 403. */
	origin: string | null;
	/** adapter-node's request cap, in bytes. `null` when the variable is unset. */
	bodySizeLimit: number | null;
	shutdownTimeout: number;
	fontsDir: string;
	chromiumPath: string | null;
	chromiumNoSandbox: boolean;
	pdfConcurrency: number;
	pdfTimeoutMs: number;
	pdfQueueTimeoutMs: number;
	maxUploadBytes: number;
	logLevel: LogLevel;
	isProduction: boolean;
}

export type Env = Record<string, string | undefined>;

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];
const MIB = 1024 * 1024;
const SIZE_SUFFIXES: Record<string, number> = { K: 1024, M: MIB, G: 1024 * MIB };

class ConfigError extends Error {}

const fail = (message: string): never => {
	throw new ConfigError(`Invalid configuration: ${message}`);
};

/**
 * A plain decimal integer, at least `min`.
 *
 * `Number()` alone accepts `0x10`, `1e3` and `  7 `; an env var that means a byte count or a
 * millisecond budget should not quietly parse as hex.
 */
function integer(env: Env, key: string, fallback: number, min = 0): number {
	const raw = env[key];
	if (raw === undefined || raw === '') return fallback;
	if (!/^\d+$/.test(raw)) fail(`${key} must be a decimal integer, got "${raw}"`);
	const value = Number(raw);
	if (value < min) fail(`${key} must be at least ${min}, got "${raw}"`);
	return value;
}

function boolean(env: Env, key: string, fallback: boolean): boolean {
	const raw = env[key];
	if (raw === undefined || raw === '') return fallback;
	if (raw === 'true' || raw === '1') return true;
	if (raw === 'false' || raw === '0') return false;
	return fail(`${key} must be true or false, got "${raw}"`);
}

/**
 * Parses adapter-node's own `BODY_SIZE_LIMIT` syntax: a byte count, a `K`/`M`/`G` suffix, or
 * the literal `Infinity`.
 */
export function parseSizeLimit(raw: string): number {
	if (raw === 'Infinity') return Infinity;
	const match = /^(\d+)([KMG])?$/.exec(raw);
	if (!match) return fail(`BODY_SIZE_LIMIT must be a byte count, e.g. 24M, got "${raw}"`);
	return Number(match[1]) * (match[2] ? SIZE_SUFFIXES[match[2]] : 1);
}

/**
 * Validates the environment into a typed {@link Config}.
 *
 * Pure, so it can be tested without touching `process.env`.
 *
 * @throws when a value is malformed, or when a production deployment is missing something that
 *   would only fail later at request time.
 */
export function parseConfig(env: Env, deploying = true): Config {
	// `deploying` is false while SvelteKit prerenders and analyses the build: those steps import
	// every server module with NODE_ENV=production but supply none of the deployment variables,
	// so the runtime checks below must not fire (SPEC §9, docs/DEVIATIONS.md).
	const isProduction = env.NODE_ENV === 'production' && deploying;

	const origin = env.ORIGIN ?? null;
	if (isProduction && !origin)
		fail('ORIGIN must be set in production, or POST /api/pdf fails the CSRF origin check');

	const maxUploadBytes = integer(env, 'MAX_UPLOAD_BYTES', 20 * MIB, 1);
	const rawLimit = env.BODY_SIZE_LIMIT;
	const bodySizeLimit = rawLimit === undefined || rawLimit === '' ? null : parseSizeLimit(rawLimit);

	// adapter-node reads BODY_SIZE_LIMIT itself, before this module loads, so all we can do is
	// refuse to start on a combination that would reject every real upload.
	if (isProduction) {
		if (bodySizeLimit === null)
			fail('BODY_SIZE_LIMIT must be set explicitly; its 512K default rejects every upload');
		else if (bodySizeLimit < maxUploadBytes + MIB)
			fail(
				`BODY_SIZE_LIMIT (${bodySizeLimit}) must be at least MAX_UPLOAD_BYTES + 1 MiB (${maxUploadBytes + MIB})`
			);
	}

	const logLevel = (env.LOG_LEVEL ?? 'info') as LogLevel;
	if (!LOG_LEVELS.includes(logLevel)) fail(`LOG_LEVEL must be one of ${LOG_LEVELS.join('|')}`);

	const pdfConcurrency = integer(env, 'PDF_CONCURRENCY', 2, 1);

	return {
		port: integer(env, 'PORT', 3000, 1),
		host: env.HOST || '0.0.0.0',
		origin,
		bodySizeLimit,
		shutdownTimeout: integer(env, 'SHUTDOWN_TIMEOUT', 30),
		fontsDir: fontsDir(env.FONTS_DIR),
		chromiumPath: env.CHROMIUM_PATH || null,
		chromiumNoSandbox: boolean(env, 'CHROMIUM_NO_SANDBOX', false),
		pdfConcurrency,
		pdfTimeoutMs: integer(env, 'PDF_TIMEOUT_MS', 30_000, 1),
		pdfQueueTimeoutMs: integer(env, 'PDF_QUEUE_TIMEOUT_MS', 15_000, 1),
		maxUploadBytes,
		logLevel,
		isProduction
	};
}

/** The effective configuration for this process, parsed once at module load. */
export const config: Config = parseConfig(process.env, !building);
