// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** Correlation id for this request, echoed in every log line and in error bodies. */
			id: string;
		}
		interface Error {
			/** Correlation id, so a user-reported failure can be found in the logs. */
			id?: string;
		}
	}
}

export {};
