<script lang="ts">
	import PreviewStage from '$lib/components/PreviewStage.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import { imageCss as imageCssOf } from '$lib/calendar/css';
	import type { ExportScope } from '$lib/calendar/types';
	import {
		createAppState,
		dismissToast,
		measureImage,
		revokeImageOnUnload,
		showToast,
		toOptions
	} from '$lib/client/app-state.svelte';
	import type { Transform } from '$lib/client/image-transform';
	import { errorMessage } from '$lib/client/errors';
	import { ExportError, downloadBlob, exportPdf } from '$lib/client/export';
	import type { LayoutServerData } from './$types';

	let { data }: { data: LayoutServerData } = $props();

	const state = createAppState();

	const options = $derived(toOptions(state));
	const imageCss = $derived(imageCssOf(state.imageUrl));

	$effect(() => revokeImageOnUnload(state));

	/** The transform lives on the state object like every other control — no second copy. */
	function applyTransform(t: Transform) {
		state.imageZoom = t.imageZoom;
		state.imageX = t.imageX;
		state.imageY = t.imageY;
	}

	async function runExport(scope: ExportScope) {
		if (state.exporting) return;
		state.exporting = scope;
		try {
			const { blob, filename } = await exportPdf(options, scope, state.imageFile);
			downloadBlob(blob, filename);
		} catch (cause) {
			const code = cause instanceof ExportError ? cause.code : '';
			showToast(state, 'error', errorMessage(code, data.maxUploadBytes));
		} finally {
			state.exporting = null;
		}
	}
</script>

<svelte:head>
	<title>CalGen — väggkalender att skriva ut</title>
</svelte:head>

<div class="app">
	<TopBar exporting={state.exporting} onExport={runExport} />
	<Sidebar
		app={state}
		maxUploadBytes={data.maxUploadBytes}
		onReject={(message) => showToast(state, 'error', message)}
		onImage={() => void measureImage(state)}
	/>
	<PreviewStage {options} {imageCss} imageSize={state.imageSize} onTransform={applyTransform}>
		{#if state.toast}
			<Toast text={state.toast.text} onDismiss={() => dismissToast(state)} />
		{/if}
	</PreviewStage>
</div>

<style>
	.app {
		display: grid;
		grid-template-columns: 340px 1fr;
		grid-template-rows: 64px 1fr;
		height: 100vh;
		min-height: 0;
	}
</style>
