/** The image types the service accepts. */
export const ALLOWED_IMAGE_TYPES: ReadonlySet<string> = new Set([
	'image/jpeg',
	'image/png',
	'image/webp'
]);

const startsWith = (bytes: Uint8Array, prefix: readonly number[]): boolean =>
	bytes.length >= prefix.length && prefix.every((byte, i) => bytes[i] === byte);

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46];
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50];

/**
 * The image type the bytes actually are, or `null`.
 *
 * Sniffing the content rather than trusting `Content-Type` is what keeps a renamed `.svg` or
 * `.html` out of Chromium's parser (SPEC §8.4).
 */
export function sniffImageType(bytes: Uint8Array): string | null {
	if (startsWith(bytes, JPEG_MAGIC)) return 'image/jpeg';
	if (startsWith(bytes, PNG_MAGIC)) return 'image/png';
	if (startsWith(bytes, RIFF_MAGIC) && startsWith(bytes.subarray(8), WEBP_MAGIC))
		return 'image/webp';
	return null;
}
