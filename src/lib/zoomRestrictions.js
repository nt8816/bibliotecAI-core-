export function installZoomRestrictions(target = window) {
  const listenerOptions = { capture: true, passive: false };
  const zoomKeys = new Set(['+', '=', '-', '0', 'Add', 'Subtract']);
  const zoomCodes = new Set(['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'NumpadEqual', 'Numpad0']);
  const preventGestureZoom = (event) => event.preventDefault();
  const preventWheelZoom = (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  };
  const preventKeyboardZoom = (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (zoomKeys.has(event.key) || zoomCodes.has(event.code))) {
      event.preventDefault();
    }
  };

  const gestureEvents = ['gesturestart', 'gesturechange', 'gestureend'];
  gestureEvents.forEach((name) => target.addEventListener(name, preventGestureZoom, listenerOptions));
  target.addEventListener('wheel', preventWheelZoom, listenerOptions);
  target.addEventListener('keydown', preventKeyboardZoom, listenerOptions);

  return () => {
    gestureEvents.forEach((name) => target.removeEventListener(name, preventGestureZoom, listenerOptions));
    target.removeEventListener('wheel', preventWheelZoom, listenerOptions);
    target.removeEventListener('keydown', preventKeyboardZoom, listenerOptions);
  };
}
