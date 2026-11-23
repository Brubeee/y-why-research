import assert from 'node:assert/strict';
import test from 'node:test';
import {CropError, encodeImageCrop, mapOcrBoxes, validateCrop} from './crop.mjs';

const source = {width: 100, height: 80};
const crop = {x: 35, y: 55, width: 65, height: 25};
const local = {x: 5, y: 10, width: 60, height: 15};
const result = {status: 'draft', image: {width: 65, height: 25}, lines: [{
  text: 'x = 3', box: local, words: [{text: 'x', box: {...local, width: 8}}]
}]};
const fails = code => error => error instanceof CropError && error.code === code;

test('validates inclusive right/bottom edge, rejects fractional, zero, negative and unsafe pixels', () => {
  assert.deepEqual(validateCrop(crop, source), crop);
  for (const bad of [{x: 36}, {y: 55.1}, {y: -1}, {width: 0}, {width: Number.MAX_SAFE_INTEGER + 1}, {height: '25'}])
    assert.throws(() => validateCrop({...crop, ...bad}, source), fails('rectangle'));
});

test('rebases both line and word boxes without changing text, status or input', () => {
  const mapped = mapOcrBoxes(result, crop, source);
  assert.equal(mapped.status, 'draft');
  assert.deepEqual(mapped.image, source);
  assert.deepEqual(mapped.crop, crop);
  assert.deepEqual(mapped.lines[0].box, {...local, x: 40, y: 65});
  assert.deepEqual(mapped.lines[0].words[0].box, {...local, x: 40, y: 65, width: 8});
  assert.equal(result.lines[0].box.x, 5);
});

test('fails closed on returned canvas or OCR dimensions and out-of-bounds words', () => {
  assert.throws(() => mapOcrBoxes(result, crop, source, {width: 64, height: 25}), fails('dimension-mismatch'));
  assert.throws(() => mapOcrBoxes({...result, image: source}, crop, source), fails('dimension-mismatch'));
  const line = {...result.lines[0], words: [{box: {...local, x: 6}}]};
  assert.throws(() => mapOcrBoxes({...result, lines: [line]}, crop, source), fails('ocr-box'));
  assert.deepEqual(mapOcrBoxes({...result, lines: []}, crop, source).lines, []);
});

test('encodes a native-resolution crop and rejects decode/encode failures', async () => {
  const image = {naturalWidth: 100, naturalHeight: 80};
  let draw;
  const canvas = {
    getContext: () => ({drawImage: (...args) => {draw = args;}}),
    toBlob: (cb, type) => cb(new Blob(['pretend pixels'], {type}))
  };
  const encoded = await encodeImageCrop(image, crop, source, {createCanvas: () => canvas});
  assert.deepEqual(draw, [image, 35, 55, 65, 25, 0, 0, 65, 25]);
  assert.equal(encoded.blob.type, 'image/png');
  assert.equal(canvas.width, 65);
  assert.equal(canvas.height, 25);
  await assert.rejects(encodeImageCrop({...image, naturalHeight: 81}, crop, source), fails('dimension-mismatch'));
  await assert.rejects(encodeImageCrop(image, crop, source, {createCanvas: () => ({...canvas, toBlob: cb => cb(null)})}), fails('encode'));
});
