<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from './firebase';
  import Login from './screens/Login.svelte';
  import Home from './screens/Home.svelte';
  import CaptureReadings from './screens/CaptureReadings.svelte';
  import ReadingHistory from './screens/ReadingHistory.svelte';
  import Billings from './screens/Billings.svelte';
  import Settings from './screens/Settings.svelte';

  let currentScreen = $state('login');
  let user = $state(auth.currentUser);

  $effect(() => {
    const unsubscribe = auth.onAuthStateChanged((newUser) => {
      user = newUser;
      if (newUser && currentScreen === 'login') {
        currentScreen = 'home';
      } else if (!newUser) {
        currentScreen = 'login';
      }
    });
    return unsubscribe;
  });

  onMount(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(2);
      if (hash && ['home', 'capture', 'history', 'billings', 'settings'].includes(hash)) {
        currentScreen = hash;
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
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
{:else if currentScreen === 'settings'}
  <Settings />
{/if}
