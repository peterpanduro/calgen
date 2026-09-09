<script lang="ts">
	import { FONTS } from '$lib/calendar/fonts';
	import { SCHEMES } from '$lib/calendar/schemes';
	import { MONTHS, defaultTitle } from '$lib/calendar/strings';
	import { DEFAULT_OPTIONS, type FontId, type SchemeId } from '$lib/calendar/types';
	import {
		clearImage,
		resetImageTransform,
		setImage,
		type AppState
	} from '$lib/client/app-state.svelte';
	import { UNSUPPORTED_IMAGE_TYPE, imageTooLarge } from '$lib/client/errors';
	import { MAX_ZOOM, MIN_ZOOM } from '$lib/client/image-transform';

	interface Props {
		app: AppState;
		/** Server-supplied upload cap, so the client rejects an oversized file before the request. */
		maxUploadBytes: number;
		/** Called with a Swedish message when a chosen file is rejected. */
		onReject: (message: string) => void;
		/** Called after a file is accepted, so the page can measure it (SPEC §6.5). */
		onImage?: () => void;
	}

	let { app, maxUploadBytes, onReject, onImage }: Props = $props();

	const isDefaultTransform = $derived(
		app.imageZoom === DEFAULT_OPTIONS.imageZoom &&
			app.imageX === DEFAULT_OPTIONS.imageX &&
			app.imageY === DEFAULT_OPTIONS.imageY
	);

	const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

	function pickImage(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!ACCEPTED.includes(file.type)) {
			onReject(UNSUPPORTED_IMAGE_TYPE);
			return;
		}
		if (file.size > maxUploadBytes) {
			onReject(imageTooLarge(maxUploadBytes));
			return;
		}
		setImage(app, file);
		onImage?.();
	}

	function clampYear(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const clamped = Math.min(2100, Math.max(2000, Number(input.value) || 2026));
		app.year = clamped;
		// Svelte patches the DOM only when the bound value changes. Clearing the field, or
		// re-entering an out-of-range year, clamps to the value already in state — so the input
		// would keep showing the rejected text. Write it back explicitly.
		input.value = String(clamped);
	}

	const border = (selected: boolean) => (selected ? '#c67139' : '#dcd3c4');
</script>

<aside>
	<section>
		<h2>Månad</h2>
		<div class="month-row">
			<select bind:value={app.month} aria-label="Månad">
				{#each MONTHS as label, value (value)}
					<option {value}>{label}</option>
				{/each}
			</select>
			<input
				type="number"
				min="2000"
				max="2100"
				aria-label="År"
				value={app.year}
				onchange={clampYear}
			/>
		</div>
		<input
			type="text"
			aria-label="Egen rubrik"
			aria-describedby={app.title.trim() !== '' ? 'title-hint' : undefined}
			bind:value={app.title}
			placeholder={defaultTitle(app.year, app.month)}
		/>
		{#if app.title.trim() !== ''}
			<p class="hint" id="title-hint">Egen rubrik används inte vid årsexport.</p>
		{/if}
		<label class="checkbox">
			<input type="checkbox" bind:checked={app.showHolidays} />
			Visa svenska helgdagar
		</label>
	</section>

	<section>
		<h2>Bakgrundsbild</h2>
		<label class="file-pill">
			{app.imageUrl ? 'Byt bild' : 'Välj bild…'}
			<input type="file" accept="image/jpeg,image/png,image/webp" onchange={pickImage} />
		</label>
		{#if app.imageUrl}
			<button type="button" class="text-button" onclick={() => clearImage(app)}>
				Ta bort bild
			</button>
			<label class="slider">
				<span>Zooma: {Math.round(app.imageZoom * 100)} %</span>
				<!-- The DOM value is percent, so the native keyboard step is a sane 1 %; state holds
				     the ratio. min/max come from the same constants the pan/zoom math clamps to, so
				     this control cannot produce a zoom the API would reject (SPEC §3.3). -->
				<input
					type="range"
					min={MIN_ZOOM * 100}
					max={MAX_ZOOM * 100}
					step="1"
					value={Math.round(app.imageZoom * 100)}
					oninput={(event) => (app.imageZoom = Number(event.currentTarget.value) / 100)}
				/>
			</label>
			<p class="hint">Dra i förhandsvisningen för att flytta bilden.</p>
			<button
				type="button"
				class="text-button"
				disabled={isDefaultTransform}
				onclick={() => resetImageTransform(app)}
			>
				Återställ bildens läge
			</button>
		{/if}
		<label class="slider">
			<span>Rutornas täckning: {app.opacity} %</span>
			<input type="range" min="30" max="100" step="2" bind:value={app.opacity} />
		</label>
	</section>

	<section>
		<h2>Färgskala</h2>
		<div class="scheme-grid">
			{#each SCHEMES as scheme (scheme.id)}
				<button
					type="button"
					class="scheme"
					aria-pressed={app.schemeId === scheme.id}
					style="border-color:{border(app.schemeId === scheme.id)}"
					onclick={() => (app.schemeId = scheme.id as SchemeId)}
				>
					<span class="dots">
						<span style="background:{scheme.bg}"></span>
						<span style="background:{scheme.day}"></span>
						<span style="background:{scheme.week}"></span>
					</span>
					{scheme.name}
				</button>
			{/each}
		</div>
	</section>

	<section>
		<h2>Typsnitt</h2>
		<div class="font-list">
			{#each FONTS as font (font.id)}
				<button
					type="button"
					class="font"
					aria-pressed={app.fontId === font.id}
					style="border-color:{border(app.fontId === font.id)}"
					onclick={() => (app.fontId = font.id as FontId)}
				>
					<span
						style="font-size:20px;line-height:1;font-family:{font.heading};font-weight:{font.headingWeight}"
						>Aa</span
					>
					<span style="font-size:13px;color:#645c50;font-family:{font.body}">{font.name}</span>
				</button>
			{/each}
		</div>
	</section>
</aside>

<style>
	aside {
		display: flex;
		flex-direction: column;
		gap: 22px;
		padding: 24px 24px 32px;
		overflow: auto;
		background: #f5ead8;
		border-right: 1.5px solid #dcd3c4;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-family: 'Caprasimo', serif;
		font-size: 17px;
		color: #201e1d;
	}
	input[type='text'],
	input[type='number'],
	select {
		height: 44px;
		padding: 0 14px;
		border-radius: 999px;
		border: 1.5px solid #c0b6a5;
		background: #f9f4ed;
		font:
			15px 'Figtree',
			sans-serif;
		color: #201e1d;
		box-sizing: border-box;
	}
	.month-row {
		display: grid;
		grid-template-columns: 1fr 110px;
		gap: 8px;
	}
	.hint {
		margin: 0;
		font-size: 12px;
		color: #645c50;
	}
	.checkbox {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		color: #474238;
		cursor: pointer;
	}
	.checkbox input {
		width: 18px;
		height: 18px;
		accent-color: #c67139;
	}
	.file-pill {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 44px;
		border-radius: 999px;
		border: 1.5px solid #c67139;
		color: #8c491a;
		font:
			600 15px 'Figtree',
			sans-serif;
		cursor: pointer;
		background: #fff2eb;
	}
	.file-pill:hover {
		background: #ffe1d0;
	}
	/* Visually hidden, NOT display:none — the input must stay focusable and in the tab order. */
	.file-pill input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.file-pill:has(input:focus-visible) {
		outline: 2px solid #c67139;
		outline-offset: 2px;
	}
	.text-button {
		border: 0;
		background: none;
		cursor: pointer;
		color: #645c50;
		font:
			600 13px 'Figtree',
			sans-serif;
		text-align: left;
		padding: 0 14px;
	}
	/* So the reset never reads as a control that does nothing. */
	.text-button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.slider {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		color: #645c50;
	}
	.slider input {
		accent-color: #c67139;
	}
	.scheme-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.scheme {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: 999px;
		cursor: pointer;
		background: #f9f4ed;
		font:
			600 13px 'Figtree',
			sans-serif;
		color: #201e1d;
		border: 2px solid #dcd3c4;
	}
	.dots {
		display: flex;
	}
	.dots span {
		width: 16px;
		height: 16px;
		border-radius: 999px;
	}
	/* The prototype's `gap:-4px` is invalid CSS; the overlap comes from these margins. */
	.dots span + span {
		margin-left: -6px;
	}
	.font-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.font {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 10px 16px;
		border-radius: 16px;
		cursor: pointer;
		background: #f9f4ed;
		color: #201e1d;
		text-align: left;
		border: 2px solid #dcd3c4;
	}
</style>
