<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from './firebase';
  import Login from './screens/Login.svelte';
  import Home from './screens/Home.svelte';
  import CaptureReadings from './screens/CaptureReadings.svelte';
  import ReadingHistory from './screens/ReadingHistory.svelte';
  import Billings from './screens/Billings.svelte';
  import Settings from './screens/Settings.svelte';
  import ConfirmSheet from './components/ConfirmSheet.svelte';
  import Toast from './components/Toast.svelte';
  import { consumeManualSignOutFlag, setSessionExpired } from './lib/stores/auth-notice.svelte';

  let currentScreen = $state('login');
  let user = $state(auth.currentUser);
  let announcement = $state('');

  const screenTitles: Record<string, string> = {
    home: 'Home',
    capture: 'Capture Readings',
    history: 'Reading History',
    billings: 'Billings',
    settings: 'Settings'
  };

  $effect(() => {
    const unsubscribe = auth.onAuthStateChanged((newUser) => {
      const wasLoggedIn = !!user;
      user = newUser;
      if (newUser && currentScreen === 'login') {
        currentScreen = 'home';
      } else if (!newUser) {
        if (wasLoggedIn && !consumeManualSignOutFlag()) {
          setSessionExpired();
        } else {
          consumeManualSignOutFlag();
        }
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
        announcement = screenTitles[hash] ?? '';
      } else if (hash) {
        window.location.hash = '#/home';
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  });
</script>

<div aria-live="polite" class="sr-only">{announcement}</div>

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

<ConfirmSheet />
<Toast />
