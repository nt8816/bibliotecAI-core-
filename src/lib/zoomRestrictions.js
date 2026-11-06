export function installZoomRestrictions(target = window) {
  const preventGestureZoom = (event) => event.preventDefault();
  const preventWheelZoom = (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  };
  const preventKeyboardZoom = (event) => {
    if ((event.ctrlKey || event.metaKey) && ['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
    }
  };

  const gestureEvents = ['gesturestart', 'gesturechange', 'gestureend'];
  gestureEvents.forEach((name) => target.addEventListener(name, preventGestureZoom, { passive: false }));
  target.addEventListener('wheel', preventWheelZoom, { passive: false });
  target.addEventListener('keydown', preventKeyboardZoom);

  return () => {
    gestureEvents.forEach((name) => target.removeEventListener(name, preventGestureZoom));
    target.removeEventListener('wheel', preventWheelZoom);
    target.removeEventListener('keydown', preventKeyboardZoom);
  };
}
