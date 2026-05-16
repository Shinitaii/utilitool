<script lang="ts">
  type Status = 'paid' | 'unpaid' | 'overdue' | 'pending' | 'current' | 'moving-out';

  interface Props {
    status: Status;
  }

  const { status } = $props();

  const statusConfig: Record<string, { bg: string; fg: string }> = {
    paid: { bg: 'var(--color-status-paid-bg)', fg: 'var(--color-status-paid-fg)' },
    unpaid: { bg: 'var(--color-status-unpaid-bg)', fg: 'var(--color-status-unpaid-fg)' },
    overdue: { bg: 'var(--color-status-overdue-bg)', fg: 'var(--color-status-overdue-fg)' },
    pending: { bg: 'var(--color-status-pending-bg)', fg: 'var(--color-status-pending-fg)' },
    current: { bg: '#e8f4ea', fg: '#2c6b3a' },
    'moving-out': { bg: '#f0eee9', fg: '#5b524a' }
  };

  const config = statusConfig[status] || statusConfig.pending;
  const label = status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ');
</script>

<span
  class="inline-block rounded-full px-3 py-1 text-xs font-semibold"
  style="background-color: {config.bg}; color: {config.fg};"
>
  {label}
</span>
