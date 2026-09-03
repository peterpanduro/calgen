export interface Semaphore {
	/**
	 * Waits for a free slot and resolves to the release function.
	 *
	 * @throws when no slot becomes free within `timeoutMs`.
	 */
	acquire(timeoutMs: number): Promise<() => void>;
	readonly inFlight: number;
	readonly queued: number;
}

interface Waiter {
	resolve: (release: () => void) => void;
	reject: (reason: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

/** Bounds how many renders may run at once, with a bounded wait for a slot. */
export function createSemaphore(limit: number): Semaphore {
	let inFlight = 0;
	const waiters: Waiter[] = [];

	function releaseOnce(): () => void {
		let released = false;
		return () => {
			if (released) return;
			released = true;
			const next = waiters.shift();
			if (next) {
				clearTimeout(next.timer);
				next.resolve(releaseOnce());
				return;
			}
			inFlight--;
		};
	}

	return {
		acquire(timeoutMs: number): Promise<() => void> {
			if (inFlight < limit) {
				inFlight++;
				return Promise.resolve(releaseOnce());
			}
			return new Promise((resolve, reject) => {
				const waiter: Waiter = {
					resolve,
					reject,
					timer: setTimeout(() => {
						const index = waiters.indexOf(waiter);
						if (index >= 0) waiters.splice(index, 1);
						reject(new Error(`Semaphore acquire timed out after ${timeoutMs} ms`));
					}, timeoutMs)
				};
				waiters.push(waiter);
			});
		},
		get inFlight() {
			return inFlight;
		},
		get queued() {
			return waiters.length;
		}
	};
}
