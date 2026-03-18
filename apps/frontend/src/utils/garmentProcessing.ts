type ProcessedGarmentImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export async function processGarmentImage(file: File): Promise<ProcessedGarmentImage> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Garment processing failed: no drawing context.');
    }

    context.drawImage(image, 0, 0);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const backgroundColor = sampleBackgroundColor(imageData.data, canvas.width, canvas.height);

    // Remove pixels that closely match the edge background color.
    for (let offset = 0; offset < imageData.data.length; offset += 4) {
      const red = imageData.data[offset];
      const green = imageData.data[offset + 1];
      const blue = imageData.data[offset + 2];

      const distance = colorDistance(red, green, blue, backgroundColor.r, backgroundColor.g, backgroundColor.b);
      const brightness = (red + green + blue) / 3;

      if (distance < 26 || (distance < 42 && brightness > 210)) {
        imageData.data[offset + 3] = 0;
        continue;
      }

      if (distance < 62) {
        const nextAlpha = Math.round(((distance - 26) / 36) * imageData.data[offset + 3]);
        imageData.data[offset + 3] = Math.max(0, Math.min(255, nextAlpha));
      }
    }

    context.putImageData(imageData, 0, 0);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load the garment image.'));
    image.src = src;
  });
}

function sampleBackgroundColor(data: Uint8ClampedArray, width: number, height: number) {
  const samplePoints = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1]
  ];

  let red = 0;
  let green = 0;
  let blue = 0;

  for (const [x, y] of samplePoints) {
    const offset = (y * width + x) * 4;
    red += data[offset];
    green += data[offset + 1];
    blue += data[offset + 2];
  }

  const count = samplePoints.length;
  return {
    r: Math.round(red / count),
    g: Math.round(green / count),
    b: Math.round(blue / count)
  };
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
