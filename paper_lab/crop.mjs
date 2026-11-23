export class CropError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CropError';
    this.code = code;
  }
}

function size(value) {
  if (!value || !['width', 'height'].every(k => Number.isSafeInteger(value[k]) && value[k] > 0))
    throw new CropError('dimensions', 'Image dimensions must be positive whole pixels.');
  return { width: value.width, height: value.height };
}

function requireSize(value, expected) {
  const actual = size(value);
  if (actual.width !== expected.width || actual.height !== expected.height)
    throw new CropError('dimension-mismatch', 'Image dimensions changed. Reopen the image or enter the lines by hand.');
}

// Callers intentionally round drag coordinates before this boundary.
export function validateCrop(rect, sourceSize) {
  const src = size(sourceSize);
  if (!rect || !['x', 'y', 'width', 'height'].every(k => Number.isSafeInteger(rect[k])) ||
      rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 ||
      rect.x > src.width - rect.width || rect.y > src.height - rect.height)
    throw new CropError('rectangle', 'Select a nonempty rectangle entirely inside the image.');
  return {x: rect.x || 0, y: rect.y || 0, width: rect.width, height: rect.height};
}

export function mapOcrBoxes(result, rect, sourceSize, cropSize = rect) {
  const src = size(sourceSize);
  const crop = validateCrop(rect, src);
  requireSize(cropSize, crop);
  if (!result || result.status !== 'draft' || !Array.isArray(result.lines))
    throw new CropError('ocr-result', 'The crop OCR response is not a usable draft.');
  requireSize(result.image, crop);
  const mapBox = box => {
    let b;
    try { b = validateCrop(box, crop); }
    catch { throw new CropError('ocr-box', 'An OCR box fell outside the crop. Keep the prior draft or enter the lines by hand.'); }
    return {...b, x: b.x + crop.x, y: b.y + crop.y};
  };
  const lines = result.lines.map(line => {
    if (!line || !Array.isArray(line.words))
      throw new CropError('ocr-result', 'The crop OCR response is missing word geometry.');
    return {...line, box: mapBox(line.box), words: line.words.map(word => ({...word, box: mapBox(word?.box)}))};
  });
  return {...result, image: src, crop, lines};
}

export async function encodeImageCrop(image, rect, sourceSize, {createCanvas = () => globalThis.document.createElement('canvas')} = {}) {
  const src = size(sourceSize);
  const crop = validateCrop(rect, src);
  requireSize({width: image?.naturalWidth, height: image?.naturalHeight}, src);
  const {x, y, width, height} = crop;
  try {
    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    requireSize(canvas, crop);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob || !blob.size || blob.type !== 'image/png') throw new Error('PNG unavailable');
    return {blob, width, height, rect: crop};
  } catch (error) {
    if (error instanceof CropError) throw error;
    throw new CropError('encode', 'The browser could not crop this image. Try another image or type the lines.');
  }
}
