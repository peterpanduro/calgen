<script lang="ts">
	interface Props {
		text: string;
		onDismiss: () => void;
		/** Milliseconds before the toast disappears on its own. */
		timeoutMs?: number;
	}

	let { text, onDismiss, timeoutMs = 6000 }: Props = $props();

	$effect(() => {
		// `text` is read so that a replacement toast restarts the timer.
		void text;
		const timer = setTimeout(onDismiss, timeoutMs);
		return () => clearTimeout(timer);
	});
</script>

<div class="toast" role="status" aria-live="polite">
	<button type="button" title="Stäng meddelande" onclick={onDismiss}>{text}</button>
</div>

<style>
	.toast {
		position: absolute;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
	}
	button {
		padding: 12px 20px;
		border: 0;
		border-radius: 999px;
		background: #474238;
		color: #f9f4ed;
		font:
			600 14px 'Figtree',
			sans-serif;
		box-shadow: 0 10px 30px rgba(32, 30, 29, 0.24);
		cursor: pointer;
	}
</style>
