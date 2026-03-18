export async function imageSourceToPngDataUrl(source: string): Promise<string> {
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image conversion failed: no drawing context.');
  }

  context.drawImage(image, 0, 0);
  return canvas.toDataURL('image/png');
}

export function extractBase64(dataUrl: string): string {
  const index = dataUrl.indexOf(',');
  if (index === -1) {
    throw new Error('Unexpected data URL format.');
  }
  return dataUrl.slice(index + 1);
}

export async function measureImage(source: string): Promise<{ width: number; height: number }> {
  const image = await loadImage(source);
  return {
    width: image.naturalWidth,
    height: image.naturalHeight
  };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image source.'));
    image.src = source;
  });
}
