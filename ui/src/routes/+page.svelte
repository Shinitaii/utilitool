<script lang="ts">
  import { goto } from '$app/navigation';
  import { getAccessToken } from '$lib/api/client';

  const token = getAccessToken();
  if (token) {
    goto('/dashboard');
  } else {
    goto('/login');
  }
</script>

<div>Redirecting...</div>
