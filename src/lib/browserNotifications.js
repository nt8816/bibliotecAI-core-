export function supportsBrowserNotifications() {
  return false;
}

export function getBrowserNotificationPermission() {
  return 'unsupported';
}

export async function requestBrowserNotificationPermission() {
  return 'unsupported';
}

export function showBrowserNotification() {
  return null;
}
