<script lang="ts">
  interface Props {
    title?: string;
    message?: string;
  }

  const {
    title = 'Coming Soon',
    message = 'This feature is still being built. Check back soon!'
  } = $props();
</script>

<div class="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
  <div class="mb-4 text-4xl">🔨</div>
  <h2 class="text-xl font-semibold text-gray-900">{title}</h2>
  <p class="mt-2 text-gray-600">{message}</p>
</div>
