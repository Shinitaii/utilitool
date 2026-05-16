<script lang="ts">
  interface Props {
    isOpen?: boolean;
    width?: number;
    children?: any;
  }

  const { isOpen = false, width = 280, children } = $props();
</script>

<aside
  class="flex flex-col border-l border-gray-200 bg-white"
  style="width: {width}px; margin-right: {isOpen ? 0 : -width}px; transition: margin-right 0.3s ease-in-out;"
>
  <div class="flex-1 overflow-auto p-6">
    {#if children}
      {@render children()}
    {/if}
  </div>
</aside>

<style>
  aside {
    position: fixed;
    top: 52px;
    right: 0;
    bottom: 0;
    z-index: 20;
  }
</style>
