import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CalendarPage from './CalendarPage.svelte';
import type { CalendarOptions } from '$lib/calendar/types';

const FIXTURE: CalendarOptions = {
	year: 2026,
	month: 8,
	schemeId: 'organic',
	fontId: 'organic',
	opacity: 88,
	showHolidays: true,
	title: '',
	imageZoom: 1,
	imageX: 50,
	imageY: 50,
	paperSize: 'A4',
	taskList: 'off',
	taskListTitle: ''
};

const body = (options: Partial<CalendarOptions> = {}, imageCss?: string): string =>
	render(CalendarPage, { props: { options: { ...FIXTURE, ...options }, imageCss } }).body;

const DAY_BOX = 'border-radius:16px;border:1.5px solid rgba(255,255,255,0.55)';
const countOf = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe('style guards', () => {
	it('has no <style> block in the source file (primary guard, SPEC §2.5.1)', () => {
		const source = readFileSync(
			path.resolve(process.cwd(), 'src/lib/components/CalendarPage.svelte'),
			'utf8'
		);
		expect(source).not.toMatch(/<style[\s>]/);
	});

	it('emits no scoping class in the rendered body (secondary guard)', () => {
		expect(body()).not.toContain('class="svelte-');
	});

	it('emits nothing into <head>', () => {
		expect(render(CalendarPage, { props: { options: FIXTURE } }).head).toBe('');
	});
});

describe('September 2026, organic, 88 %', () => {
	const html = body();

	it('sizes the page at exactly A4 landscape', () => {
		expect(html).toContain('width:297mm;height:210mm');
	});

	it('renders the resolved default title', () => {
		expect(html).toContain('>September 2026<');
	});

	it('renders all seven day names', () => {
		for (const name of ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'])
			expect(html).toContain(name);
	});

	it('renders week labels 36–40 and no 41', () => {
		for (const label of ['v.36', 'v.37', 'v.38', 'v.39', 'v.40']) expect(html).toContain(label);
		expect(html).not.toContain('v.41');
	});

	it('emits the five-row grid template', () => {
		expect(html).toContain('grid-template-rows:auto repeat(5,1fr)');
	});

	it('paints the 31 August cell with the adjacent-month fill', () => {
		expect(html).toContain('rgba(220,211,196,0.704)');
	});

	it('defaults the background image to none', () => {
		expect(html).toContain('background-image:none');
	});

	it('renders 35 day boxes', () => {
		expect(countOf(html, DAY_BOX)).toBe(35);
	});

	it('renders identically for A3 — the paper size never reaches this component', () => {
		expect(body({ paperSize: 'A3' })).toBe(body({ paperSize: 'A4' }));
	});
});

describe('option variations', () => {
	it('shows midsummer holiday names in June 2026', () => {
		const june = body({ month: 5 });
		expect(june).toContain('Midsommarafton');
		expect(june).toContain('Midsommardagen');
	});

	it('hides holiday names when showHolidays is false', () => {
		const june = body({ month: 5, showHolidays: false });
		expect(june).not.toContain('Midsommarafton');
		expect(june).not.toContain('Midsommardagen');
	});

	it('renders August 2026 as six rows and 42 boxes', () => {
		const august = body({ month: 7 });
		expect(august).toContain('grid-template-rows:auto repeat(6,1fr)');
		expect(countOf(august, DAY_BOX)).toBe(42);
	});

	it('renders the clamped February 2027 as five rows with an all-adjacent last row', () => {
		const feb = body({ year: 2027, month: 1 });
		expect(feb).toContain('grid-template-rows:auto repeat(5,1fr)');
		expect(countOf(feb, DAY_BOX)).toBe(35);
		// The seven trailing cells are the only ones after the 28th; all carry the adjacent fill.
		expect(countOf(feb, 'rgba(220,211,196,0.704)')).toBe(7);
	});

	it('renders a custom title', () => {
		expect(body({ title: 'Vår trädgård' })).toContain('>Vår trädgård<');
	});

	it('paints the natt page background', () => {
		expect(body({ schemeId: 'natt' })).toContain('background:#2e2b25');
	});

	it('uses the print CSS variable when one is supplied', () => {
		expect(body({}, 'var(--calgen-bg)')).toContain('background-image:var(--calgen-bg)');
	});

	it('applies the klassisk heading weight to the title', () => {
		expect(body({ fontId: 'klassisk' })).toContain('font-weight:500;font-size:40px');
	});
});

describe('background layer geometry', () => {
	const LAYERS: [string, Partial<CalendarOptions>, string][] = [
		['the default transform', {}, 'left:0%;top:0%;width:100%;height:100%'],
		[
			'zoom 2 panned left',
			{ imageZoom: 2, imageX: 25 },
			'left:-25%;top:-50%;width:200%;height:200%'
		],
		[
			'zoom 4 in the bottom-left corner',
			{ imageZoom: 4, imageX: 0, imageY: 100 },
			'left:0%;top:-300%;width:400%;height:400%'
		]
	];
	const position = (o: Partial<CalendarOptions>) =>
		`background-size:cover;background-position:${o.imageX ?? 50}% ${o.imageY ?? 50}%`;

	// The transform is a property of the layer, not of the photo: it holds with and without one.
	it.each(LAYERS)('emits %s as an enlarged box, with no photo', (_name, options, box) => {
		expect(body(options)).toContain(`${box};${position(options)}`);
	});

	it.each(LAYERS)('emits %s identically with a photo', (_name, options, box) => {
		expect(body(options, 'var(--calgen-bg)')).toContain(`${box};${position(options)}`);
	});

	it('rounds the offsets rather than leaking the float product', () => {
		const html = body({ imageZoom: 1.37, imageX: 33, imageY: 66 });
		expect(html).toContain('left:-12.21%');
		expect(html).not.toContain(String((1 - 1.37) * 33));
	});

	it('carries no transform on the layer, and keeps the clip that hides its overflow', () => {
		// Not a blanket check: the week pills legitimately carry transform:rotate(180deg).
		const layer = /<div style="(position:absolute[^"]*)"/.exec(body({ imageZoom: 4 }));
		expect(layer?.[1]).not.toContain('transform');
		// Anchored to the root <section>: that is the element whose clip hides the layer at z > 1,
		// and an unanchored match would pass on any nested overflow:hidden.
		const root = /<section[^>]*\sstyle="([^"]*)"/.exec(body());
		expect(root?.[1]).toContain('overflow:hidden');
	});
});

/**
 * What Svelte's server renderer leaves for the task list's `{#if}` when it is false: the
 * whitespace separator before the block, then an empty marker pair (SPEC §5.2).
 */
const EMPTY_IF = ' <!--[-1--><!--]-->';

describe('task list', () => {
	const sectionStyle = (html: string) => /<section[^>]*\sstyle="([^"]*)"/.exec(html)?.[1];
	const headerStyle = (html: string) => /<header[^>]*\sstyle="([^"]*)"/.exec(html)?.[1];
	const right = body({ taskList: 'right' });

	it('leaves only one empty block marker behind when off', () => {
		expect(countOf(body(), EMPTY_IF)).toBe(1);
		expect(body()).not.toContain('Att göra');
	});

	it('adds a 50 mm column on the right, with the header spanning both', () => {
		expect(sectionStyle(right)?.endsWith(';grid-template-columns:1fr 50mm')).toBe(true);
		expect(headerStyle(right)?.endsWith(';grid-column:1/-1')).toBe(true);
		expect(right).toContain('grid-template-rows:auto repeat(5,1fr);grid-row:2;grid-column:1');
		expect(right).toContain('position:relative;grid-row:2;grid-column:2;display:grid');
	});

	it('adds a 50 mm column on the left, with the grid moved to the second column', () => {
		const left = body({ taskList: 'left' });
		expect(sectionStyle(left)?.endsWith(';grid-template-columns:50mm 1fr')).toBe(true);
		expect(left).toContain('grid-template-rows:auto repeat(5,1fr);grid-row:2;grid-column:2');
		expect(left).toContain('position:relative;grid-row:2;grid-column:1;display:grid');
	});

	it('renders the default heading, fourteen ruled rows and fourteen checkboxes', () => {
		expect(right).toContain('>Att göra<');
		expect(right).toContain('grid-template-rows:repeat(14,1fr)');
		expect(right).toContain(
			'border:1.5px solid rgba(255,255,255,0.55);border-radius:16px;background:rgba(249,244,237,0.88)'
		);
		expect(countOf(right, 'border-radius:3px')).toBe(14);
		expect(
			countOf(right, 'display:flex;align-items:flex-end;gap:8px;min-height:0;border-top:')
		).toBe(14);
		expect(countOf(right, 'flex:none;box-sizing:border-box;margin-bottom:4px;border:1.5px')).toBe(
			14
		);
		expect(countOf(right, 'border-top:1px solid #a19786')).toBe(13);
		expect(countOf(right, 'border-top:none')).toBe(1);
	});

	it('keeps all 35 day boxes and puts the list after the grid', () => {
		expect(countOf(right, DAY_BOX)).toBe(35);
		expect(right.indexOf('>Att göra<')).toBeGreaterThan(right.indexOf('Söndag'));
		expect(right).not.toContain(EMPTY_IF);
	});

	it('keeps 14 list rows beside a six-row month', () => {
		const html = body({ year: 2026, month: 7, taskList: 'right' });
		expect(countOf(html, DAY_BOX)).toBe(42);
		expect(html).toContain('grid-template-rows:auto repeat(6,1fr)');
		expect(html).toContain('grid-template-rows:repeat(14,1fr)');
		expect(countOf(html, 'border-radius:3px')).toBe(14);
	});

	it('renders a custom heading as escaped text', () => {
		const html = body({ taskList: 'right', taskListTitle: '<b>Inköp</b>' });
		expect(html).toContain('&lt;b>Inköp&lt;/b>');
		expect(html).not.toContain('<b>');
	});
});

describe('regression snapshot', () => {
	it('matches the reviewed body for the fixture', () => {
		// The task list's {#if} cannot render zero bytes when false (SPEC §5.2); every other byte
		// of the page must be what it was before the feature existed, so the pre-feature snapshot
		// is compared with that one marker removed.
		expect(body().replace(EMPTY_IF, '')).toMatchSnapshot();
	});

	it.each(['left', 'right'] as const)(
		'matches the reviewed body with the list on the %s',
		(taskList) => {
			expect(body({ taskList })).toMatchSnapshot();
		}
	);
});
