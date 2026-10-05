import { describe, expect, it } from 'vitest';
import { buildCalendarView } from './view';
import type { CalendarOptions } from './types';

const BASE: CalendarOptions = {
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

const view = (o: Partial<CalendarOptions> = {}) => buildCalendarView({ ...BASE, ...o });

describe('buildCalendarView, September 2026 / organic / 88 %', () => {
	const first = view().weeks[0].cells;

	it.each([
		[0, 'rgba(220,211,196,0.704)', '#a19786'],
		[1, 'rgba(249,244,237,0.88)', '#2e2b25'],
		[4, 'rgba(249,244,237,0.88)', '#2e2b25'],
		[5, 'rgba(238,231,219,0.88)', '#8c491a'],
		[6, 'rgba(238,231,219,0.88)', '#8c491a']
	])('resolves cell %i to %s / %s', (i, background, foreground) => {
		expect(first[i]).toMatchObject({ background, foreground });
	});

	it('labels the first week v.36', () => {
		expect(view().weeks[0].label).toBe('v.36');
	});

	it('emits the five-row grid template', () => {
		expect(view().gridTemplateRows).toBe('auto repeat(5,1fr)');
	});

	it('resolves the default title', () => {
		expect(view().title).toBe('September 2026');
	});

	it('carries the day names, scheme and font', () => {
		const v = view();
		expect(v.dayNames[0]).toBe('Måndag');
		expect(v.scheme.id).toBe('organic');
		expect(v.font.headingWeight).toBe(400);
		expect(v.rows).toBe(5);
	});
});

describe('other option combinations', () => {
	it('emits the six-row template for August 2026', () => {
		expect(view({ month: 7 }).gridTemplateRows).toBe('auto repeat(6,1fr)');
	});

	it('uses a custom title', () => {
		expect(view({ title: 'Vår trädgård' }).title).toBe('Vår trädgård');
	});

	it('applies the natt scheme colours', () => {
		const cells = view({ schemeId: 'natt' }).weeks[0].cells;
		expect(cells[0]).toMatchObject({ background: 'rgba(52,48,42,0.704)', foreground: '#82796a' });
		expect(cells[1]).toMatchObject({ background: 'rgba(71,66,56,0.88)', foreground: '#f9f4ed' });
		expect(cells[6].foreground).toBe('#f6a06b');
	});

	it('applies the lowest opacity', () => {
		const cells = view({ opacity: 30 }).weeks[0].cells;
		expect(cells[0].background).toBe('rgba(220,211,196,0.24)');
		expect(cells[1].background).toBe('rgba(249,244,237,0.3)');
	});

	it('gives a weekday holiday the weekend fill and the holiday colour', () => {
		const cells = view({ month: 5 }).weeks.flatMap((w) => w.cells);
		const midsommarafton = cells.find((c) => c.holiday === 'Midsommarafton');
		expect(midsommarafton).toMatchObject({
			background: 'rgba(238,231,219,0.88)',
			foreground: '#8c491a'
		});
	});

	it('colours Saturday with weekendFg and Sunday with holiday', () => {
		const cells = view().weeks[1].cells;
		expect(cells[5].foreground).toBe('#8c491a');
		expect(cells[6].foreground).toBe('#8c491a');
	});

	it('uses weekendFg for a Saturday in a scheme where it differs from holiday', () => {
		const cells = view({ schemeId: 'natt' }).weeks[1].cells;
		expect(cells[5].foreground).toBe('#ffc6a5');
		expect(cells[6].foreground).toBe('#f6a06b');
	});

	it('never colours an adjacent-month cell red', () => {
		const cells = view().weeks[0].cells;
		expect(cells[0].foreground).toBe('#a19786');
	});

	it('drops holiday names when showHolidays is false', () => {
		const cells = view({ month: 5, showHolidays: false }).weeks.flatMap((w) => w.cells);
		expect(cells.every((c) => c.holiday === '')).toBe(true);
	});
});

describe('background geometry', () => {
	it.each([
		[1, 50, 50, '0%', '0%', '100%', '50% 50%'],
		[2, 25, 50, '-25%', '-50%', '200%', '25% 50%'],
		[4, 0, 100, '0%', '-300%', '400%', '0% 100%'],
		// The last row is the rounding regression: unrounded, left would be -12.210000000000004%.
		[1.37, 33, 66, '-12.21%', '-24.42%', '137%', '33% 66%']
	])(
		'resolves zoom %f at %f/%f to the enlarged box',
		(imageZoom, imageX, imageY, left, top, size, position) => {
			expect(view({ imageZoom, imageX, imageY }).background).toEqual({
				left,
				top,
				size,
				position
			});
		}
	);
});

describe('task list', () => {
	it('is absent, with empty layout suffixes, when off', () => {
		const v = view();
		expect(v.taskList).toBeNull();
		expect(v.layout).toEqual({ section: '', header: '', grid: '' });
	});

	it.each([
		[
			'left',
			';grid-template-columns:50mm 1fr',
			';grid-row:2;grid-column:2;min-width:0',
			'grid-row:2;grid-column:1'
		],
		[
			'right',
			';grid-template-columns:1fr 50mm',
			';grid-row:2;grid-column:1;min-width:0',
			'grid-row:2;grid-column:2'
		]
	] as const)('places a %s list beside the grid', (taskList, section, grid, placement) => {
		const v = view({ taskList });
		expect(v.layout).toEqual({ section, header: ';grid-column:1/-1', grid });
		expect(v.taskList?.placement).toBe(placement);
	});

	it('resolves the heading', () => {
		expect(view({ taskList: 'right' }).taskList?.title).toBe('Att göra');
		expect(view({ taskList: 'right', taskListTitle: ' Inköp ' }).taskList?.title).toBe('Inköp');
	});

	it('fills the panel like a current-month day box', () => {
		expect(view({ taskList: 'left' }).taskList?.background).toBe('rgba(249,244,237,0.88)');
		expect(view({ taskList: 'left', schemeId: 'natt', opacity: 30 }).taskList?.background).toBe(
			'rgba(71,66,56,0.3)'
		);
	});

	it('rules fourteen rows in the muted foreground colour', () => {
		const list = view({ taskList: 'right' }).taskList;
		expect(list?.line).toBe('#a19786');
		expect(list?.rowBorders).toEqual(['none', ...Array(13).fill('1px solid #a19786')]);
	});
});
