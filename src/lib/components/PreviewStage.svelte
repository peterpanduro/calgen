<script lang="ts">
	import CalendarPage from './CalendarPage.svelte';
	import type { CalendarOptions } from '$lib/calendar/types';
	import {
		nudge,
		panBy,
		zoomBy,
		type ImageSize,
		type Transform
	} from '$lib/client/image-transform';
	import type { Snippet } from 'svelte';

	interface Props {
		options: CalendarOptions;
		imageCss: string;
		/** Overlay content, e.g. the toast. */
		children?: Snippet;
		/** Natural pixel size of the background photo; null when there is none, or not measured yet. */
		imageSize?: ImageSize | null;
		/** New, already-clamped transform. Called on drag, wheel and arrow keys. */
		onTransform?: (t: Transform) => void;
	}

	let { options, imageCss, children, imageSize = null, onTransform }: Props = $props();

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

	/** Percentage points per arrow press, ten with Shift. */
	const NUDGE_STEP = 1;
	const ARROWS: Record<string, [number, number]> = {
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		ArrowUp: [0, -1],
		ArrowDown: [0, 1]
	};

	let dragging = $state(false);
	let last = { x: 0, y: 0 };
	/** The pointer that started the drag; every other one is ignored until it ends. */
	let activePointer: number | null = null;

	const transform = $derived({
		imageZoom: options.imageZoom,
		imageX: options.imageX,
		imageY: options.imageY
	});

	function startDrag(event: PointerEvent) {
		// Primary button only: a right-click drag belongs to the context menu, not to the photo.
		if (event.button !== 0 || dragging) return;
		activePointer = event.pointerId;
		last = { x: event.clientX, y: event.clientY };
		dragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function drag(event: PointerEvent) {
		// A second finger reports its own moves through the same handler; following both would
		// make the photo jitter between two positions.
		if (!dragging || event.pointerId !== activePointer || !imageSize) return;
		// Screen pixels into page pixels: the surface is inside the scaled .page element, and
		// image-transform.ts is calibrated in page pixels.
		const dx = (event.clientX - last.x) / scale;
		const dy = (event.clientY - last.y) / scale;
		last = { x: event.clientX, y: event.clientY };
		onTransform?.(panBy(transform, imageSize, dx, dy));
	}

	/** Ends the drag, but only for the pointer that started it. */
	function endDrag(event: PointerEvent) {
		if (event.pointerId !== activePointer) return;
		dragging = false;
		activePointer = null;
	}

	function wheel(event: WheelEvent) {
		// Ctrl/Cmd + wheel is the browser's own page-zoom gesture — and the pinch gesture a
		// trackpad reports as one. Leaving it alone (no preventDefault, no zoom) keeps page zoom
		// working for anyone who relies on it.
		if (event.ctrlKey || event.metaKey) return;
		// Nothing scrolls behind the preview: the shell is 100vh and the stage is overflow:hidden.
		event.preventDefault();
		onTransform?.(zoomBy(transform, event.deltaY));
	}

	function key(event: KeyboardEvent) {
		const arrow = ARROWS[event.key];
		if (!arrow || !imageSize) return;
		event.preventDefault();
		const step = event.shiftKey ? NUDGE_STEP * 10 : NUDGE_STEP;
		onTransform?.(nudge(transform, imageSize, arrow[0] * step, arrow[1] * step));
	}
</script>

<main>
	<div bind:this={frame} class="frame">
		<div class="page" style="transform:translate(-50%,-50%) scale({scale})">
			<CalendarPage {options} {imageCss} />
			{#if imageSize && onTransform}
				<!-- A real <button>, so it is focusable and arrow-operable without a pointer, and so
				     Svelte's a11y rules hold without a role that lies. It has no onclick, so there
				     is nothing for Enter/Space to activate (SPEC §6.4.1). -->
				<button
					type="button"
					class="pan"
					class:dragging
					aria-label="Flytta bakgrundsbilden. Dra med musen eller använd piltangenterna."
					style="position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:none;touch-action:none;border-radius:8px;outline-offset:-3px"
					onpointerdown={startDrag}
					onpointermove={drag}
					onpointerup={endDrag}
					onpointercancel={endDrag}
					onlostpointercapture={endDrag}
					onwheel={wheel}
					onkeydown={key}
				></button>
			{/if}
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
	/* The two cursor states are the only reason this needs a rule rather than the inline style. */
	.pan {
		cursor: grab;
	}
	.pan.dragging {
		cursor: grabbing;
	}
</style>
