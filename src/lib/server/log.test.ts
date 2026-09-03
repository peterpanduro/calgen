import { describe, expect, it, vi } from 'vitest';
import { createLogger } from './log';

const capture = () => {
	const lines: string[] = [];
	return { lines, write: (line: string) => lines.push(line) };
};

const parsed = (lines: string[]) => lines.map((l) => JSON.parse(l));

describe('createLogger', () => {
	it('writes one JSON line per event', () => {
		const sink = capture();
		createLogger('info', sink.write).info('pdf.render', { pages: 12, bytes: 42 });
		expect(sink.lines).toHaveLength(1);
		expect(parsed(sink.lines)[0]).toMatchObject({
			level: 'info',
			event: 'pdf.render',
			pages: 12,
			bytes: 42
		});
	});

	it('stamps an ISO timestamp', () => {
		const sink = capture();
		createLogger('info', sink.write).info('server.start', {});
		expect(parsed(sink.lines)[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
	});

	it('suppresses events below the configured level', () => {
		const sink = capture();
		const log = createLogger('warn', sink.write);
		log.debug('a', {});
		log.info('b', {});
		log.warn('c', {});
		log.error('d', {});
		expect(parsed(sink.lines).map((e) => e.event)).toEqual(['c', 'd']);
	});

	it('emits everything at debug level', () => {
		const sink = capture();
		const log = createLogger('debug', sink.write);
		log.debug('a', {});
		log.error('b', {});
		expect(sink.lines).toHaveLength(2);
	});

	it('never lets a field overwrite ts, level or event', () => {
		const sink = capture();
		createLogger('info', sink.write).info('real', { level: 'fake', event: 'fake', ts: 'fake' });
		expect(parsed(sink.lines)[0]).toMatchObject({ level: 'info', event: 'real' });
		expect(parsed(sink.lines)[0].ts).not.toBe('fake');
	});

	it('survives a value that cannot be serialised', () => {
		const sink = capture();
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(() => createLogger('info', sink.write).info('odd', { cyclic })).not.toThrow();
		expect(sink.lines).toHaveLength(1);
	});

	it('defaults to writing to stdout', () => {
		const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
		createLogger('info').info('server.start', { port: 3000 });
		expect(spy).toHaveBeenCalledOnce();
		spy.mockRestore();
	});
});
