<script lang="ts">
  import { auth } from '../firebase';

  function logout() {
    auth.signOut();
    window.location.hash = '#/login';
  }
</script>

<div class="min-h-screen bg-gray-50 pb-20">
  <div class="bg-blue-600 text-white p-4">
    <h1 class="text-2xl font-bold">Utilitool</h1>
    <p class="text-sm opacity-90">Meter Reading Assistant</p>
  </div>

  <div class="p-4 space-y-4">
    <a href="#/capture" class="block w-full px-6 py-4 bg-blue-600 text-white rounded-lg font-semibold text-center hover:bg-blue-700">
      📱 New Reading Session
    </a>
  </div>

  <div class="grid grid-cols-2 gap-3 mt-8 px-4">
    <div class="bg-white p-4 rounded-lg shadow">
      <p class="text-gray-600 text-sm">Recent Readings</p>
      <p class="text-2xl font-bold">—</p>
    </div>
    <div class="bg-white p-4 rounded-lg shadow">
      <p class="text-gray-600 text-sm">Pending Billings</p>
      <p class="text-2xl font-bold">—</p>
    </div>
  </div>

  <div class="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around">
    <a href="#/home" class="flex-1 py-3 text-center text-blue-600 font-semibold">🏠 Home</a>
    <a href="#/history" class="flex-1 py-3 text-center text-gray-600 font-semibold">📋 History</a>
    <a href="#/billings" class="flex-1 py-3 text-center text-gray-600 font-semibold">💰 Billings</a>
  </div>

  <div class="p-4 mt-12 border-t">
    <button onclick={logout} class="w-full px-4 py-2 text-red-600 font-semibold">
      Sign Out
    </button>
  </div>
</div>
