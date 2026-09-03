import type { SchemeId } from './types';

/** A calendar colour scheme. Values are transcribed verbatim from the prototype. */
export interface Scheme {
	id: SchemeId;
	name: string;
	bg: string;
	text: string;
	title: string;
	titleBg: string;
	day: string;
	dayFg: string;
	week: string;
	weekFg: string;
	/** "R,G,B" triples — alpha is applied at render time. */
	cell: string;
	weekend: string;
	other: string;
	weekendFg: string;
	otherFg: string;
	holiday: string;
}

/* prettier-ignore */
export const SCHEMES = [
	{ id:'organic',    name:'Organic',    bg:'#f5ead8', text:'#2e2b25', title:'#2e2b25', titleBg:'rgba(249,244,237,0.95)', day:'#8c491a', dayFg:'#fff2eb', week:'#56633f', weekFg:'#f0fae1', cell:'249,244,237', weekend:'238,231,219', other:'220,211,196', weekendFg:'#8c491a', otherFg:'#a19786', holiday:'#8c491a' },
	{ id:'skog',       name:'Skog',       bg:'#e1eecc', text:'#272e1b', title:'#3d472b', titleBg:'rgba(251,253,245,0.95)', day:'#3d472b', dayFg:'#f0fae1', week:'#728157', weekFg:'#f0fae1', cell:'251,253,245', weekend:'240,250,225', other:'214,227,191', weekendFg:'#56633f', otherFg:'#8fa073', holiday:'#56633f' },
	{ id:'neutral',    name:'Neutral',    bg:'#eee7db', text:'#2e2b25', title:'#2e2b25', titleBg:'rgba(249,244,237,0.95)', day:'#2e2b25', dayFg:'#f9f4ed', week:'#645c50', weekFg:'#f9f4ed', cell:'249,244,237', weekend:'238,231,219', other:'220,211,196', weekendFg:'#645c50', otherFg:'#a19786', holiday:'#474238' },
	{ id:'terrakotta', name:'Terrakotta', bg:'#ffe1d0', text:'#402310', title:'#8c491a', titleBg:'rgba(255,242,235,0.95)', day:'#b2622d', dayFg:'#fff2eb', week:'#8c491a', weekFg:'#fff2eb', cell:'255,242,235', weekend:'255,225,208', other:'240,206,184', weekendFg:'#8c491a', otherFg:'#c67139', holiday:'#8c491a' },
	{ id:'hav',        name:'Hav',        bg:'#dfe8ee', text:'#1f2b36', title:'#2f4a60', titleBg:'rgba(245,248,250,0.95)', day:'#2f4a60', dayFg:'#eef4f8', week:'#6c8ea3', weekFg:'#eef4f8', cell:'245,248,250', weekend:'230,238,244', other:'204,216,224', weekendFg:'#2f4a60', otherFg:'#8aa3b3', holiday:'#2f4a60' },
	{ id:'natt',       name:'Natt',       bg:'#2e2b25', text:'#f9f4ed', title:'#f9f4ed', titleBg:'rgba(71,66,56,0.92)',   day:'#c67139', dayFg:'#fff2eb', week:'#8fa073', weekFg:'#272e1b', cell:'71,66,56',    weekend:'86,79,68',    other:'52,48,42',    weekendFg:'#ffc6a5', otherFg:'#82796a', holiday:'#f6a06b' }
] as const satisfies readonly Scheme[];

/**
 * Looks up a scheme by id.
 *
 * @throws when the id is not one of the six.
 */
export function getScheme(id: SchemeId): Scheme {
	const hit = SCHEMES.find((s) => s.id === id);
	if (!hit) throw new Error(`Unknown scheme id: ${id}`);
	return hit;
}
