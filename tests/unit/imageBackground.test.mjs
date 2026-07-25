import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { removeCornerConnectedWhite } from '../../src/lib/imageBackground.js';

function rgbaImage(width, height, color = [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data.set(color, index * 4);
  }
  return { width, height, data };
}

function setPixel(image, x, y, color) {
  image.data.set(color, (y * image.width + x) * 4);
}

function alphaAt(image, x, y) {
  return image.data[(y * image.width + x) * 4 + 3];
}

describe('display-only corner background cleanup', () => {
  it('removes a studio-white background connected to the image corners', () => {
    const image = rgbaImage(5, 5);
    for (let y = 1; y < 4; y += 1) {
      for (let x = 1; x < 4; x += 1) {
        setPixel(image, x, y, [62, 68, 74, 255]);
      }
    }

    const result = removeCornerConnectedWhite(image);

    assert.equal(alphaAt(result, 0, 0), 0);
    assert.equal(alphaAt(result, 4, 4), 0);
    assert.equal(alphaAt(result, 2, 2), 255);
    assert.equal(result.removed, 16);
  });

  it('preserves an enclosed white product such as a towel', () => {
    const image = rgbaImage(7, 7);
    for (let y = 2; y <= 4; y += 1) {
      for (let x = 2; x <= 4; x += 1) {
        const edge = x === 2 || x === 4 || y === 2 || y === 4;
        setPixel(image, x, y, edge ? [170, 174, 176, 255] : [255, 255, 255, 255]);
      }
    }

    const result = removeCornerConnectedWhite(image);

    assert.equal(alphaAt(result, 0, 0), 0);
    assert.equal(alphaAt(result, 2, 3), 255);
    assert.equal(alphaAt(result, 3, 3), 255);
  });

  it('stops at a non-bright boundary instead of globally removing white', () => {
    const image = rgbaImage(7, 7);
    for (let x = 1; x < 6; x += 1) {
      setPixel(image, x, 1, [232, 232, 232, 255]);
      setPixel(image, x, 5, [232, 232, 232, 255]);
    }
    for (let y = 1; y < 6; y += 1) {
      setPixel(image, 1, y, [232, 232, 232, 255]);
      setPixel(image, 5, y, [232, 232, 232, 255]);
    }

    const result = removeCornerConnectedWhite(image);

    assert.equal(alphaAt(result, 0, 0), 0);
    assert.equal(alphaAt(result, 1, 3), 255);
    assert.equal(alphaAt(result, 3, 3), 255);
  });

  it('softens connected near-white edges without mutating the source buffer', () => {
    const image = rgbaImage(3, 3, [244, 243, 242, 255]);
    setPixel(image, 1, 1, [36, 41, 44, 255]);
    const original = new Uint8ClampedArray(image.data);

    const result = removeCornerConnectedWhite(image);

    assert.deepEqual(image.data, original);
    assert.ok(alphaAt(result, 0, 0) > 0);
    assert.ok(alphaAt(result, 0, 0) < 255);
    assert.equal(alphaAt(result, 1, 1), 255);
  });
});
