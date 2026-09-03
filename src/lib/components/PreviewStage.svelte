<script lang="ts">
	import CalendarPage from './CalendarPage.svelte';
	import type { CalendarOptions } from '$lib/calendar/types';
	import type { Snippet } from 'svelte';

	interface Props {
		options: CalendarOptions;
		imageCss: string;
		/** Overlay content, e.g. the toast. */
		children?: Snippet;
	}

	let { options, imageCss, children }: Props = $props();

	/** CSS pixels per millimetre at 96 dpi. */
	const MM = 96 / 25.4;

	let frame: HTMLDivElement | undefined = $state();
	let scale = $state(1);

	function fit() {
		if (!frame?.clientWidth) return;
		scale = Math.min(frame.clientWidth / (297 * MM), frame.clientHeight / (210 * MM));
	}

	$effect(() => {
		if (!frame) return;
		const observer = new ResizeObserver(fit);
		observer.observe(frame);
		fit();
		// One deferred recompute so web-font loading cannot leave a stale scale.
		const timer = setTimeout(fit, 300);
		return () => {
			observer.disconnect();
			clearTimeout(timer);
		};
	});
</script>

<main>
	<div bind:this={frame} class="frame">
		<div class="page" style="transform:translate(-50%,-50%) scale({scale})">
			<CalendarPage {options} {imageCss} />
		</div>
	</div>
	{@render children?.()}
</main>

<style>
	main {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px;
		overflow: hidden;
		min-height: 0;
		background: #eee7db;
	}
	.frame {
		position: relative;
		width: 100%;
		height: 100%;
	}
	.page {
		position: absolute;
		left: 50%;
		top: 50%;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 10px 30px rgba(32, 30, 29, 0.14);
	}
</style>
