let message = $state<string | null>(null);
let manualSignOut = false;

export const authNotice = {
  get message() {
    return message;
  },
  clear() {
    message = null;
  }
};

export function markManualSignOut() {
  manualSignOut = true;
}

export function consumeManualSignOutFlag(): boolean {
  const was = manualSignOut;
  manualSignOut = false;
  return was;
}

export function setSessionExpired() {
  message = 'Your session expired — please sign in again.';
}
