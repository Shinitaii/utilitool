<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from './firebase';
  import Login from './screens/Login.svelte';
  import Home from './screens/Home.svelte';
  import CaptureReadings from './screens/CaptureReadings.svelte';
  import ReadingHistory from './screens/ReadingHistory.svelte';
  import Billings from './screens/Billings.svelte';

  let currentScreen = $state('login');
  let user = $state(auth.currentUser);

  onMount(() => {
    auth.onAuthStateChanged((newUser) => {
      user = newUser;
      if (newUser && currentScreen === 'login') {
        currentScreen = 'home';
      } else if (!newUser) {
        currentScreen = 'login';
      }
    });

    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && ['home', 'capture', 'history', 'billings'].includes(hash)) {
        currentScreen = hash;
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  });
</script>

{#if !user}
  <Login />
{:else if currentScreen === 'home'}
  <Home />
{:else if currentScreen === 'capture'}
  <CaptureReadings />
{:else if currentScreen === 'history'}
  <ReadingHistory />
{:else if currentScreen === 'billings'}
  <Billings />
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, sans-serif;
  }
</style>
