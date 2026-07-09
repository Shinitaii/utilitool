<script lang="ts">
  import { sendChatMessage } from '$lib/api/chat';

  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
  }

  let isOpen = $state(false);
  let messages = $state<ChatMessage[]>([]);
  let draft = $state('');
  let isSending = $state(false);
  let error = $state('');

  function toggleOpen() {
    isOpen = !isOpen;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;

    const history = messages;
    messages = [...messages, { role: 'user', content: text }];
    draft = '';
    isSending = true;
    error = '';

    try {
      const result = await sendChatMessage(text, history);
      messages = [...messages, { role: 'assistant', content: result.reply }];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to reach the assistant';
    } finally {
      isSending = false;
    }
  }

  function handleClearChat() {
    // Nothing is persisted server-side — clearing here discards the
    // conversation for good, there's no history to restore.
    messages = [];
    error = '';
  }
</script>

<div class="chat-widget">
  {#if isOpen}
    <div class="chat-panel">
      <div class="chat-header">
        <span class="font-semibold text-sm">Insight Assistant</span>
        <div class="header-actions">
          <button
            onclick={handleClearChat}
            disabled={messages.length === 0 || isSending}
            aria-label="Clear chat"
            title="Clear chat — this cannot be undone"
            class="icon-btn"
          >
            ↺
          </button>
          <button onclick={toggleOpen} aria-label="Close chat" class="icon-btn close-btn">×</button>
        </div>
      </div>

      <div class="chat-messages">
        {#if messages.length === 0}
          <p class="text-sm text-gray-500">Ask about your usage, accumulation, or billing trends.</p>
        {/if}
        {#each messages as msg}
          <div class="chat-message {msg.role}">
            {msg.content}
          </div>
        {/each}
        {#if isSending}
          <div class="chat-message assistant">Thinking...</div>
        {/if}
      </div>

      {#if error}
        <div class="chat-error">{error}</div>
      {/if}

      <form class="chat-input-row" onsubmit={handleSubmit}>
        <input
          type="text"
          bind:value={draft}
          placeholder="Ask a question..."
          disabled={isSending}
          class="chat-input"
        />
        <button type="submit" disabled={isSending || !draft.trim()} class="chat-send-btn">
          Send
        </button>
      </form>
    </div>
  {/if}

  <button onclick={toggleOpen} class="chat-fab" aria-label="Toggle insight chatbot">
    {isOpen ? '×' : '💬'}
  </button>
</div>

<style>
  .chat-widget {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
  }

  .chat-fab {
    width: 56px;
    height: 56px;
    border-radius: 9999px;
    background-color: var(--color-accent);
    color: white;
    font-size: 1.25rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border: none;
    cursor: pointer;
  }

  .chat-panel {
    width: 340px;
    max-height: 460px;
    display: flex;
    flex-direction: column;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    overflow: hidden;
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .icon-btn {
    background: none;
    border: none;
    font-size: 1.1rem;
    cursor: pointer;
    line-height: 1;
    padding: 2px 4px;
    color: #5b524a;
  }

  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .close-btn {
    font-size: 1.25rem;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .chat-message {
    font-size: 0.875rem;
    padding: 8px 12px;
    border-radius: 8px;
    max-width: 85%;
    white-space: pre-wrap;
  }

  .chat-message.user {
    align-self: flex-end;
    background-color: var(--color-accent);
    color: white;
  }

  .chat-message.assistant {
    align-self: flex-start;
    background-color: #f0eee9;
    color: #2a251f;
  }

  .chat-error {
    padding: 8px 16px;
    font-size: 0.75rem;
    color: #a23b21;
  }

  .chat-input-row {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #e5e7eb;
  }

  .chat-input {
    flex: 1;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 0.875rem;
  }

  .chat-send-btn {
    background-color: var(--color-accent);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .chat-send-btn:disabled,
  .chat-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
