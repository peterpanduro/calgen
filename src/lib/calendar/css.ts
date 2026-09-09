/**
 * CSS value helpers. The only place a user-influenced string reaches a CSS value is
 * {@link imageCss}, which is why it validates instead of escaping.
 */

/**
 * Serialises an alpha with three decimals and no trailing zeros.
 *
 * Without the rounding, `0.88 * 0.8` serialises as `0.7040000000000001` and every snapshot
 * becomes platform lore.
 */
export function alpha(value: number): string {
	return String(Math.round(value * 1000) / 1000);
}

/**
 * Serialises a CSS percentage with two decimals.
 *
 * The background-layer offsets (SPEC §4.9) are products of two user-controlled floats, so
 * `(1 - 1.37) * 33` would otherwise serialise as `-12.210000000000004`. Two decimals of a
 * 297 mm page is 0.03 mm — below what any printer resolves. Interpolating `-0` yields `"0"`,
 * so a negative zero needs no special handling.
 */
export function pct(value: number): string {
	return `${Math.round(value * 100) / 100}%`;
}

/** `rgba(249,244,237,0.88)` from an `"R,G,B"` triple and an alpha. */
export function rgba(triple: string, a: number): string {
	return `rgba(${triple},${alpha(a)})`;
}

/** Characters that would let a URL break out of `url("…")`. Control characters included. */
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const UNSAFE_URL = /["()\\<\u0000-\u001F\u007F]/;

/**
 * Wraps a URL for use as a `background-image` value. Returns `'none'` for `null`.
 *
 * @throws when the URL contains a character that could escape the `url("…")` wrapper.
 */
export function imageCss(url: string | null): string {
	if (url === null) return 'none';
	if (UNSAFE_URL.test(url)) throw new Error('Unsafe characters in background image URL');
	return `url("${url}")`;
}
