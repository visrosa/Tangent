<script lang="ts">
import { onDestroy, onMount } from 'svelte'
import { flip } from 'svelte/animate'
import { fly } from 'svelte/transition'
import type WindowAPI from 'common/WindowApi'
import type { UserMessage } from 'common/WindowApi';

export let api: WindowAPI

let nextId = 0

interface Message extends UserMessage {
	id: number
	timeout?: number
	hovered?: boolean
	focused?: boolean
}

let messages: Message[] = []

api.onMessage(addMessageToStack)

let reducedMotion = false
let destroyed = false
onMount(() => {
	const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
	const update = () => reducedMotion = preference.matches
	update()
	preference.addEventListener('change', update)
	return () => preference.removeEventListener('change', update)
})
onDestroy(() => {
	destroyed = true
	for (const message of messages) cancelTimeout(message)
})

function addMessageToStack(message: UserMessage) {
	if (destroyed) return
	const newMessage: Message = {
		...message,
		id: nextId,
	}

	nextId++

	startTimeout(newMessage)

	messages.push(newMessage)
	messages = messages
}

function removeMessage(message: Message) {
	cancelTimeout(message)
	const index = messages.indexOf(message)
	if (index >= 0) {
		messages.splice(index, 1)
		messages = messages
	}
}

function startTimeout(message: Message, time=10000) {
	cancelTimeout(message)
	if (message.type !== 'error' && !message.hovered && !message.focused) {
		message.timeout = window.setTimeout(() => {
			removeMessage(message)
		}, time);
	}
}

function cancelTimeout(message: Message) {
	if (message.timeout) {
		window.clearTimeout(message.timeout)
		message.timeout = undefined
	}
}

function hoverMessage(message: Message, hovered: boolean) {
	message.hovered = hovered
	if (hovered) cancelTimeout(message)
	else startTimeout(message, 2000)
}

function focusMessage(message: Message, event: FocusEvent, focused: boolean) {
	if (!focused && event.currentTarget instanceof HTMLElement
		&& event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
	message.focused = focused
	if (focused) cancelTimeout(message)
	else startTimeout(message, 2000)
}
</script>

<main aria-label="Notifications">
	{#each messages as message (message.id)}
		<article
			class={message.type}
			animate:flip={{ duration: reducedMotion ? 0 : 300 }}
			transition:fly|global={{ x: reducedMotion ? 0 : 500, duration: reducedMotion ? 0 : 400 }}
			on:mouseenter={() => hoverMessage(message, true)}
			on:mouseleave={() => hoverMessage(message, false)}
			on:focusin={event => focusMessage(message, event, true)}
			on:focusout={event => focusMessage(message, event, false)}
		>
			<button
				aria-label="Dismiss notification"
				on:click={e => removeMessage(message)}
			><svg style={`width: 24px; height: 24px;`}>
					<use href="close.svg#close"/>
			</svg></button>
			<div role={message.type === 'error' ? 'alert' : 'status'} aria-atomic="true">
				{#if message.title}
					<h1>{@html message.title}</h1>
				{/if}
				<p>{@html message.message}</p>
			</div>
		</article>
	{/each}
</main>

<style lang="scss">
main {
	position: fixed;
	z-index: 100000000000000001; // lol

	top: 1em;
	right: 1em;
}

article {
	position: relative;
	width: 24em;
	font-size: 90%;

	border: 2px solid var(--borderColor);
	background: var(--backgroundColor);

	padding: .5em 2.75em .5em .75em;
	box-sizing: border-box;
	max-width: calc(100vw - 2em);
	margin-bottom: 1em;

	border-radius: var(--inputBorderRadius);

	word-wrap: pre-wrap;
	overflow-wrap: break-word;

	button {
		opacity: 1;

		position: absolute;
		top: .25em;
		right: .25em;

		width: 24px;
		height: 24px;
		padding: 0;

		transition: opacity .3s;
	}

	&.error {
		border-color: red;
		background-color: darkred;
		color: white;

		button {
			background-color: darkred;
		}

		h1 {
			&::before {
				content: '⚠️ Error: ';
			}
		}
	}
	&.warning {	
		border-color: darkgoldenrod;

		button {
			background-color: darkgoldenrod;
		}

		h1 {
			color: darkgoldenrod;
			&::before {
				content: '⚠️ ';
			}
		}
	}

	button {
		&:hover {
			background-color: rgba(0, 0, 0, .2);
		}
		&:active {
			background-color: rgba(0, 0, 0, .3);
		}
	}

	&:hover button {
		opacity: 1;
	}

	h1 {
		font-size: 110%;
		margin: 0;
	}

	p {
		margin: 1em 0;
		white-space: pre-wrap;
		&:last-child {
			margin-bottom: 0;
		}
	}
}
</style>
