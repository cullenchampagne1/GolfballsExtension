const DEFAULT_MIN_CHANNEL = 238;
const DEFAULT_MAX_SPREAD = 18;
const DEFAULT_FULL_TRANSPARENCY_CHANNEL = 248;
const DEFAULT_MAX_DIMENSION = 2048;

function finiteByte(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(255, Math.round(number)))
    : fallback;
}

/**
 * Makes only the near-white background connected to an image corner
 * transparent. Unlike a global color knockout, the flood stops at the first
 * non-bright pixel, so enclosed white product details remain untouched.
 *
 * The input buffer is never mutated. This is deliberately a presentation
 * transform; callers should retain the original asset for downloads.
 */
export function removeCornerConnectedWhite(imageData, options = {}) {
  const width = Math.floor(Number(imageData?.width));
  const height = Math.floor(Number(imageData?.height));
  const source = imageData?.data;
  const pixelCount = width * height;
  if (
    width <= 0
    || height <= 0
    || !source
    || source.length !== pixelCount * 4
  ) {
    throw new TypeError('A complete RGBA image buffer is required.');
  }

  const minChannel = Math.min(
    254,
    finiteByte(options.minChannel, DEFAULT_MIN_CHANNEL),
  );
  const maxSpread = finiteByte(options.maxSpread, DEFAULT_MAX_SPREAD);
  const fullTransparencyChannel = Math.min(
    255,
    Math.max(
      minChannel + 1,
      finiteByte(
        options.fullTransparencyChannel,
        DEFAULT_FULL_TRANSPARENCY_CHANNEL,
      ),
    ),
  );
  const output = new Uint8ClampedArray(source);
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  let removed = 0;

  const isBackground = (pixelIndex) => {
    const offset = pixelIndex * 4;
    if (source[offset + 3] <= 8) return true;
    const red = source[offset];
    const green = source[offset + 1];
    const blue = source[offset + 2];
    const darkest = Math.min(red, green, blue);
    const lightest = Math.max(red, green, blue);
    return darkest >= minChannel && lightest - darkest <= maxSpread;
  };

  const visit = (pixelIndex) => {
    if (pixelIndex < 0 || pixelIndex >= pixelCount || visited[pixelIndex]) return;
    visited[pixelIndex] = 1;
    if (!isBackground(pixelIndex)) return;
    queue[tail] = pixelIndex;
    tail += 1;
  };

  visit(0);
  visit(width - 1);
  visit(pixelCount - width);
  visit(pixelCount - 1);

  while (head < tail) {
    const pixelIndex = queue[head];
    head += 1;
    const offset = pixelIndex * 4;
    const originalAlpha = source[offset + 3];
    const darkest = Math.min(
      source[offset],
      source[offset + 1],
      source[offset + 2],
    );
    const nextAlpha = originalAlpha <= 8 || darkest >= fullTransparencyChannel
      ? 0
      : Math.round(
        originalAlpha
        * (fullTransparencyChannel - darkest)
        / (fullTransparencyChannel - minChannel),
      );
    if (nextAlpha !== originalAlpha) {
      output[offset + 3] = nextAlpha;
      removed += 1;
    }

    const x = pixelIndex % width;
    if (x > 0) visit(pixelIndex - 1);
    if (x + 1 < width) visit(pixelIndex + 1);
    if (pixelIndex >= width) visit(pixelIndex - width);
    if (pixelIndex + width < pixelCount) visit(pixelIndex + width);
  }

  return {
    data: output,
    width,
    height,
    removed,
  };
}

/**
 * Builds a display-only PNG preview with its corner-connected studio-white
 * background removed. It leaves the source URL and downloaded asset untouched.
 */
export function createCornerTransparentPreview(sourceUrl, options = {}) {
  if (!sourceUrl || typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(sourceUrl || '');
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:/i.test(sourceUrl)) image.crossOrigin = 'anonymous';
    image.onload = () => {
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      if (!naturalWidth || !naturalHeight) {
        resolve(sourceUrl);
        return;
      }

      const maxDimension = Math.max(
        1,
        Number(options.maxDimension) || DEFAULT_MAX_DIMENSION,
      );
      const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        resolve(sourceUrl);
        return;
      }

      try {
        context.drawImage(image, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        const masked = removeCornerConnectedWhite(imageData, options);
        if (!masked.removed) {
          resolve(sourceUrl);
          return;
        }
        imageData.data.set(masked.data);
        context.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = reject;
    image.src = sourceUrl;
  });
}
