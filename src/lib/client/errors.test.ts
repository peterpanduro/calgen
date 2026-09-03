import { describe, expect, it } from 'vitest';
import { UNSUPPORTED_IMAGE_TYPE, errorMessage, imageTooLarge } from './errors';

describe('errorMessage', () => {
	it.each([
		['image_too_large', 'Bilden är för stor. Max 20 MB.'],
		['unsupported_image_type', UNSUPPORTED_IMAGE_TYPE],
		['renderer_busy', 'Servern är upptagen. Försök igen om en stund.'],
		['render_timeout', 'Exporten tog för lång tid. Försök igen.'],
		['renderer_unavailable', 'PDF-tjänsten är inte tillgänglig just nu.'],
		['network', 'Kunde inte nå servern. Kontrollera din anslutning.']
	])('maps %s to its Swedish message', (code, expected) => {
		expect(errorMessage(code)).toBe(expected);
	});

	it.each([
		'invalid_year',
		'invalid_month',
		'invalid_scheme',
		'invalid_font',
		'invalid_opacity',
		'invalid_show_holidays',
		'invalid_title',
		'invalid_scope',
		'invalid_options',
		'invalid_json',
		'invalid_image'
	])('maps %s to the settings message', (code) => {
		expect(errorMessage(code)).toBe('Ogiltiga inställningar. Kontrollera år och månad.');
	});

	it.each(['internal_error', 'unsupported_media_type', 'missing_options', 'nonsense', ''])(
		'falls back for %j',
		(code) => {
			expect(errorMessage(code)).toBe('Något gick fel. Försök igen.');
		}
	);

	// `code in MESSAGES` would resolve these to inherited Object.prototype members.
	it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf'])(
		'falls back for the prototype member %j instead of leaking it',
		(code) => {
			expect(errorMessage(code)).toBe('Något gick fel. Försök igen.');
		}
	);

	it('reports the server-supplied cap for image_too_large', () => {
		expect(errorMessage('image_too_large', 5 * 1024 * 1024)).toBe('Bilden är för stor. Max 5 MB.');
	});
});

describe('imageTooLarge', () => {
	it('defaults to the 20 MB cap', () => {
		expect(imageTooLarge()).toBe('Bilden är för stor. Max 20 MB.');
	});

	it('renders the supplied cap in whole megabytes', () => {
		expect(imageTooLarge(31_457_280)).toBe('Bilden är för stor. Max 30 MB.');
	});
});
