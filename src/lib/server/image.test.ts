import { describe, expect, it } from 'vitest';
import { ALLOWED_IMAGE_TYPES, sniffImageType } from './image';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe('sniffImageType', () => {
	it('recognises a JPEG', () => {
		expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
	});

	it('recognises a PNG', () => {
		expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
			'image/png'
		);
	});

	it('recognises a WebP by RIFF at 0 and WEBP at 8', () => {
		expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe(
			'image/webp'
		);
	});

	it('rejects a RIFF container that is not WebP', () => {
		expect(
			sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20))
		).toBeNull();
	});

	it('rejects an SVG', () => {
		expect(sniffImageType(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
	});

	it('rejects HTML', () => {
		expect(sniffImageType(ascii('<!doctype html>'))).toBeNull();
	});

	it('rejects an empty buffer', () => {
		expect(sniffImageType(bytes())).toBeNull();
	});

	it('rejects a truncated JPEG magic', () => {
		expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
	});
});

describe('ALLOWED_IMAGE_TYPES', () => {
	it('holds exactly the three supported types', () => {
		expect([...ALLOWED_IMAGE_TYPES].sort()).toEqual(['image/jpeg', 'image/png', 'image/webp']);
	});
});
