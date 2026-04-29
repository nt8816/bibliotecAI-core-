let bibliotecaiLogoDataUrlPromise = null;

export const loadImageDataUrl = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    resolve(canvas.toDataURL('image/png'));
  };
  image.onerror = reject;
  image.src = src;
});

export const loadBibliotecaiLogoDataUrl = () => {
  if (!bibliotecaiLogoDataUrlPromise) {
    bibliotecaiLogoDataUrlPromise = loadImageDataUrl('/app-logo.png');
  }
  return bibliotecaiLogoDataUrlPromise;
};

export function addBibliotecaiPdfWatermark(doc, logoDataUrl, options = {}) {
  if (!logoDataUrl) return;

  const {
    x = 12,
    y = 8,
    width = 28,
    height = 28,
    opacity = 0.16,
  } = options;

  try {
    doc.setGState(new doc.GState({ opacity }));
    doc.addImage(logoDataUrl, 'PNG', x, y, width, height);
    doc.setGState(new doc.GState({ opacity: 1 }));
  } catch {
    doc.addImage(logoDataUrl, 'PNG', x, y, width, height);
  }
}
