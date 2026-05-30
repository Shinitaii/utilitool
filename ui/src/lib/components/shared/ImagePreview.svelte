<script lang="ts">
  let { imageUrl = '', onClose = () => {} }: { imageUrl?: string; onClose?: () => void } = $props();

  let scale = $state(1);
  let rotate = $state(0);
  let translateX = $state(0);
  let translateY = $state(0);

  let touchStartDistance = 0;
  let touchStartScale = 1;
  let panStartX = 0;
  let panStartY = 0;

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(1, Math.min(scale * delta, 5));
  }

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      // Pinch to zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      touchStartDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      touchStartScale = scale;
    } else if (e.touches.length === 1) {
      // Pan
      panStartX = e.touches[0].clientX - translateX;
      panStartY = e.touches[0].clientY - translateY;
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      scale = Math.max(1, Math.min((distance / touchStartDistance) * touchStartScale, 5));
    } else if (e.touches.length === 1) {
      translateX = e.touches[0].clientX - panStartX;
      translateY = e.touches[0].clientY - panStartY;
    }
  }

  function handleRotate() {
    rotate = (rotate - 90 + 360) % 360;
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
  <div class="relative w-full h-full flex items-center justify-center overflow-hidden">
    <img
      src={imageUrl}
      alt="Preview"
      class="max-h-full max-w-full object-contain select-none"
      style="transform: translate({translateX}px, {translateY}px) scale({scale}) rotate({rotate}deg);"
      onwheel={handleWheel}
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
    />
  </div>

  <div class="absolute top-4 right-4 flex gap-2 z-10">
    <button
      onclick={handleRotate}
      class="p-2 bg-white rounded-full shadow-lg hover:bg-gray-200"
      aria-label="Rotate counter-clockwise"
    >
      ↺
    </button>
    <button
      onclick={onClose}
      class="p-2 bg-white rounded-full shadow-lg hover:bg-gray-200"
      aria-label="Close"
    >
      ✕
    </button>
  </div>
</div>

<style>
  img {
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }
</style>
