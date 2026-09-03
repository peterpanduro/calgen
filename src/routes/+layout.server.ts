import { config } from '$lib/server/config';
import type { LayoutServerLoad } from './$types';

/** Hands the client the upload cap so it can reject a file before spending a request on it. */
export const load: LayoutServerLoad = () => ({ maxUploadBytes: config.maxUploadBytes });
