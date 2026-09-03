import { describe, expect, it } from 'vitest';
import { createSemaphore } from './semaphore';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createSemaphore', () => {
	it('lets callers through up to the limit without waiting', async () => {
		const sem = createSemaphore(2);
		await sem.acquire(1000);
		await sem.acquire(1000);
		expect(sem.inFlight).toBe(2);
		expect(sem.queued).toBe(0);
	});

	it('queues callers beyond the limit', async () => {
		const sem = createSemaphore(1);
		const release = await sem.acquire(1000);
		let entered = false;
		const waiter = sem.acquire(1000).then((r) => {
			entered = true;
			return r;
		});
		await tick();
		expect(entered).toBe(false);
		expect(sem.queued).toBe(1);
		release();
		await waiter;
		expect(entered).toBe(true);
		expect(sem.queued).toBe(0);
	});

	it('hands slots out in FIFO order', async () => {
		const sem = createSemaphore(1);
		const first = await sem.acquire(1000);
		const order: number[] = [];
		const a = sem.acquire(1000).then((r) => {
			order.push(1);
			return r;
		});
		const b = sem.acquire(1000).then((r) => {
			order.push(2);
			return r;
		});
		const c = sem.acquire(1000).then((r) => {
			order.push(3);
			return r;
		});
		first();
		(await a)();
		(await b)();
		(await c)();
		expect(order).toEqual([1, 2, 3]);
	});

	it('rejects a waiter that exceeds the queue timeout', async () => {
		const sem = createSemaphore(1);
		await sem.acquire(1000);
		await expect(sem.acquire(10)).rejects.toThrow(/timed out/i);
	});

	it('does not consume a slot for a waiter that timed out', async () => {
		const sem = createSemaphore(1);
		const release = await sem.acquire(1000);
		await expect(sem.acquire(10)).rejects.toThrow();
		expect(sem.queued).toBe(0);
		release();
		expect(sem.inFlight).toBe(0);
		await expect(sem.acquire(10)).resolves.toBeTypeOf('function');
	});

	it('is idempotent when release is called twice', async () => {
		const sem = createSemaphore(1);
		const release = await sem.acquire(1000);
		release();
		release();
		expect(sem.inFlight).toBe(0);
		await sem.acquire(1000);
		expect(sem.inFlight).toBe(1);
	});

	it('resolves immediately when a timeout of 0 finds a free slot', async () => {
		const sem = createSemaphore(1);
		await expect(sem.acquire(0)).resolves.toBeTypeOf('function');
	});
});
