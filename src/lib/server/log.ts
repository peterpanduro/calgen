import process from 'node:process';
import { config, type LogLevel } from './config';

/** A single structured event. Never put image bytes, data URLs or print HTML in here. */
export type LogFields = Record<string, unknown>;

export interface Logger {
	debug(event: string, fields: LogFields): void;
	info(event: string, fields: LogFields): void;
	warn(event: string, fields: LogFields): void;
	error(event: string, fields: LogFields): void;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const toStdout = (line: string): void => {
	process.stdout.write(line);
};

/**
 * A zero-dependency structured logger writing one JSON object per line.
 *
 * @param level events below this level are dropped.
 * @param write injected for tests; defaults to stdout.
 */
export function createLogger(level: LogLevel, write: (line: string) => void = toStdout): Logger {
	const threshold = ORDER[level];

	const emit = (at: LogLevel, event: string, fields: LogFields): void => {
		if (ORDER[at] < threshold) return;
		// Spread first so the three reserved keys always win.
		const record = { ...fields, ts: new Date().toISOString(), level: at, event };
		let line: string;
		try {
			line = JSON.stringify(record);
		} catch {
			line = JSON.stringify({ ts: record.ts, level: at, event, error: 'unserialisable fields' });
		}
		write(`${line}\n`);
	};

	return {
		debug: (event, fields) => emit('debug', event, fields),
		info: (event, fields) => emit('info', event, fields),
		warn: (event, fields) => emit('warn', event, fields),
		error: (event, fields) => emit('error', event, fields)
	};
}

/** The process-wide logger. Server modules import this rather than creating their own. */
export const log: Logger = createLogger(config.logLevel);
