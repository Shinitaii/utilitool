<script lang="ts">
  let step = $state(1);
</script>

<div class="min-h-screen bg-gray-50 pb-20">
  <div class="bg-blue-600 text-white p-4 flex items-center gap-3">
    <button onclick={() => window.location.hash = '#/home'} class="text-xl">←</button>
    <h1 class="text-xl font-bold">New Reading Session</h1>
  </div>
  <div class="p-4"><p>CaptureReadings: Step {step}</p></div>
  <div class="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around">
    <a href="#/home" class="flex-1 py-3 text-center text-gray-600 font-semibold">🏠 Home</a>
    <a href="#/history" class="flex-1 py-3 text-center text-gray-600 font-semibold">📋 History</a>
    <a href="#/billings" class="flex-1 py-3 text-center text-gray-600 font-semibold">💰 Billings</a>
  </div>
</div>
