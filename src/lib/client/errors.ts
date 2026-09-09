/** Default upload cap, used when no server-supplied cap is available. */
const DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** `Bilden är för stor. Max 20 MB.` — shared so the sidebar and the toast cannot disagree. */
export function imageTooLarge(maxBytes: number = DEFAULT_MAX_UPLOAD_BYTES): string {
	return `Bilden är för stor. Max ${Math.round(maxBytes / 1024 / 1024)} MB.`;
}

/** `Bildformatet stöds inte…` — shared between the client-side check and the API error map. */
export const UNSUPPORTED_IMAGE_TYPE = 'Bildformatet stöds inte. Använd JPEG, PNG eller WebP.';

/** Swedish toast text for an API error code (SPEC §6.6). */
const MESSAGES: Readonly<Record<string, string>> = {
	unsupported_image_type: UNSUPPORTED_IMAGE_TYPE,
	renderer_busy: 'Servern är upptagen. Försök igen om en stund.',
	render_timeout: 'Exporten tog för lång tid. Försök igen.',
	renderer_unavailable: 'PDF-tjänsten är inte tillgänglig just nu.',
	network: 'Kunde inte nå servern. Kontrollera din anslutning.'
};

const INVALID_SETTINGS = 'Ogiltiga inställningar. Kontrollera år och månad.';

/**
 * `Något gick fel. Försök igen.` — the generic message, exported so a caller with no API error
 * code to map (a failed image decode, say) can show it without going through `errorMessage`.
 */
export const FALLBACK_MESSAGE = 'Något gick fel. Försök igen.';

/**
 * Maps an API error code to the Swedish message shown in the toast. Unknown codes fall back to
 * a generic message — the API is developer-facing, the UI is not.
 */
export function errorMessage(code: string, maxUploadBytes?: number): string {
	// Object.hasOwn, not `in`: `in` also finds 'constructor', 'toString' and friends.
	if (code === 'image_too_large') return imageTooLarge(maxUploadBytes);
	if (Object.hasOwn(MESSAGES, code)) return MESSAGES[code];
	if (code.startsWith('invalid_')) return INVALID_SETTINGS;
	return FALLBACK_MESSAGE;
}
