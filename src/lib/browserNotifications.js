export function supportsBrowserNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission() {
  if (!supportsBrowserNotifications()) return 'unsupported';
  return Notification.permission || 'default';
}

export async function requestBrowserNotificationPermission() {
  if (!supportsBrowserNotifications()) return 'unsupported';
  return Notification.requestPermission();
}

export function showBrowserNotification({ title, body, tag, path }) {
  if (!supportsBrowserNotifications() || getBrowserNotificationPermission() !== 'granted') {
    return null;
  }

  try {
    const notification = new Notification(String(title || 'BibliotecAI'), {
      body: String(body || ''),
      tag: String(tag || title || 'bibliotecai-notification'),
      icon: '/favicon.ico',
      badge: '/favicon.ico',
    });

    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignore focus failures.
      }

      if (path) {
        window.location.href = path;
      }

      notification.close();
    };

    return notification;
  } catch {
    return null;
  }
}
