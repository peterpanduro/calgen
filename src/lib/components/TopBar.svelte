<script lang="ts">
	import type { ExportScope } from '$lib/calendar/types';

	interface Props {
		/** Which export is in flight, if any. */
		exporting: null | ExportScope;
		/** Wired in by the app page; without it the buttons render but do nothing. */
		onExport?: (scope: ExportScope) => void;
	}

	let { exporting, onExport }: Props = $props();

	const busy = $derived(exporting !== null);
</script>

<header>
	<div class="brand">
		<span class="mark"></span>
		<span class="wordmark">CalGen</span>
	</div>
	<div class="actions">
		<button
			type="button"
			class="secondary"
			disabled={busy}
			aria-busy={exporting === 'year'}
			onclick={() => onExport?.('year')}
		>
			{exporting === 'year' ? 'Exporterar året…' : 'Exportera hela året'}
		</button>
		<button
			type="button"
			class="primary"
			disabled={busy}
			aria-busy={exporting === 'month'}
			onclick={() => onExport?.('month')}
		>
			{exporting === 'month' ? 'Exporterar…' : 'Exportera PDF'}
		</button>
	</div>
</header>

<style>
	header {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 28px;
		border-bottom: 1.5px solid #dcd3c4;
		background: #f5ead8;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.mark {
		width: 28px;
		height: 28px;
		border-radius: 999px;
		background: #c67139;
		display: inline-block;
	}
	.wordmark {
		font-family: 'Caprasimo', serif;
		font-size: 22px;
		color: #201e1d;
	}
	.actions {
		display: flex;
		gap: 10px;
	}
	button {
		cursor: pointer;
		border-radius: 999px;
		font:
			600 15px 'Figtree',
			sans-serif;
	}
	.secondary {
		padding: 12px 20px;
		border: 1.5px solid #c67139;
		background: #fff2eb;
		color: #8c491a;
	}
	.secondary:hover:not(:disabled) {
		background: #ffe1d0;
	}
	.primary {
		padding: 12px 22px;
		border: 0;
		background: #c67139;
		color: #fff2eb;
	}
	.primary:hover:not(:disabled) {
		background: #b2622d;
	}
	button:disabled {
		cursor: progress;
		opacity: 0.7;
	}
</style>
