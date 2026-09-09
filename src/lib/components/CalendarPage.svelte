<script lang="ts">
	import { buildCalendarView } from '$lib/calendar/view';
	import type { CalendarOptions } from '$lib/calendar/types';

	interface Props {
		/** Everything needed to render the page, except the background image. */
		options: CalendarOptions;
		/** Full CSS `background-image` value: `'none'`, `'url("blob:…")'` or `'var(--calgen-bg)'`. */
		imageCss?: string;
	}

	// This component MUST stay free of style blocks, $state, $effect, onMount and browser
	// globals: it renders both in the browser and through render() from svelte/server, which
	// does not emit extracted component CSS. All styling is inline attributes (SPEC §2.5).
	let { options, imageCss = 'none' }: Props = $props();

	const view = $derived(buildCalendarView(options));
</script>

<section
	style="width:297mm;height:210mm;overflow:hidden;position:relative;box-sizing:border-box;display:grid;grid-template-rows:auto 1fr;gap:5mm;padding:30mm 10mm 10mm;background:{view
		.scheme.bg};color:{view.scheme.text};font-family:{view.font.body}"
>
	<!-- Always rendered; with no photo the geometry is simply invisible (SPEC §5.2). Pure layout
	     rather than a transform, so preview and print agree by construction. -->
	<div
		style="position:absolute;left:{view.background.left};top:{view.background.top};width:{view
			.background.size};height:{view.background
			.size};background-size:cover;background-position:{view.background
			.position};background-image:{imageCss}"
	></div>
	<header style="position:relative;display:flex;align-items:flex-end;padding-left:36px">
		<h1
			style="margin:0;display:inline-block;padding:10px 22px;border-radius:999px;font-weight:{view
				.font.headingWeight};font-size:40px;line-height:1;background:{view.scheme
				.titleBg};color:{view.scheme.title};font-family:{view.font.heading}"
		>
			{view.title}
		</h1>
	</header>
	<div
		style="position:relative;display:grid;grid-template-columns:30px repeat(7,1fr);gap:6px;min-height:0;grid-template-rows:{view.gridTemplateRows}"
	>
		<div></div>
		{#each view.dayNames as dayName (dayName)}
			<div
				style="display:flex;align-items:center;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:{view
					.scheme.day};color:{view.scheme.dayFg}"
			>
				{dayName}
			</div>
		{/each}
		{#each view.weeks as week (week.label)}
			<div
				style="display:flex;align-items:center;justify-content:center;border-radius:999px;font-size:13px;writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;letter-spacing:.04em;background:{view
					.scheme.week};color:{view.scheme.weekFg};font-family:{view.font.heading};font-weight:{view
					.font.headingWeight}"
			>
				{week.label}
			</div>
			{#each week.cells as cell, i (i)}
				<div
					style="position:relative;border-radius:16px;border:1.5px solid rgba(255,255,255,0.55);min-height:0;padding:8px 10px;box-sizing:border-box;display:flex;flex-direction:column;gap:4px;background:{cell.background}"
				>
					<span
						style="font-size:20px;line-height:1;color:{cell.foreground};font-family:{view.font
							.heading};font-weight:{view.font.headingWeight}"
					>
						{cell.dayOfMonth}
					</span>
					<span style="font-size:10px;font-weight:600;line-height:1.2;color:{cell.foreground}"
						>{cell.holiday}</span
					>
				</div>
			{/each}
		{/each}
	</div>
</section>
