import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DEFAULT_CROSSHAIR } from '../src/free/profiles.mjs';
const { geometry, draw } = createRequire(import.meta.url)('../src/free/renderer/crosshair-preview.js');
const settings = changes => ({ ...DEFAULT_CROSSHAIR, ...changes });

test('modern dimensions scale with scene height and the selected reference height', () => {
  const source = settings({ lengthPixels: 24, gapPixels: 18, thicknessPixels: 12 });
  const full = geometry(source, { width: 1920, height: 1080 });
  const half = geometry(source, { width: 960, height: 540 });
  assert.deepEqual([full.length, full.gap, full.thickness], [24, 18, 12]);
  assert.deepEqual([half.length, half.gap, half.thickness], [12, 9, 6]);
  const largerReference = geometry({ ...source, screenHeight: 2160 }, { width: 1920, height: 1080 });
  assert.deepEqual([largerReference.length, largerReference.gap, largerReference.thickness], [12, 9, 6]);
});

test('high legal length, gap and thickness remain distinct rather than saturating at old limits', () => {
  const viewport = { width: 960, height: 540 };
  const previousLimit = geometry(settings({ lengthPixels: 18, gapPixels: 15, thicknessPixels: 10 }), viewport);
  const maximum = geometry(settings({ lengthPixels: 255, gapPixels: 255, thicknessPixels: 31 }), viewport);
  assert.deepEqual([maximum.length, maximum.gap, maximum.thickness], [128, 127.5, 16]);
  assert.ok(maximum.length > previousLimit.length * 10);
  assert.ok(maximum.gap > previousLimit.gap * 10);
  assert.ok(maximum.thickness > previousLimit.thickness * 3);
  // Geometry is allowed to extend outside the viewport; clipping happens at the SVG/scene edge.
  const huge = geometry(settings({ screenHeight: 100, lengthPixels: 255 }), { width: 320, height: 180 });
  assert.ok(huge.shapes.some(shape => shape.x < 0 || shape.x + shape.width > huge.width));
});

test('automatic reference and hidden/disconnected fallback never produce nonfinite coordinates', () => {
  const auto = geometry(settings({ screenHeight: 0, lengthPixels: 20 }), { width: 320, height: 180 });
  assert.equal(auto.referenceHeight, 180);
  assert.equal(auto.length, 20);
  for (const shape of auto.shapes) for (const value of Object.values(shape)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  const fallback = geometry(settings());
  assert.equal(fallback.width, 105);
  assert.equal(fallback.height, 105);
  assert.equal(fallback.thickness, 1);
});

test('T style removes the top bar and modern dot-only uses the selected pixel thickness', () => {
  const viewport = { width: 1920, height: 1080 };
  const cross = geometry(settings({ tStyle: true, lengthPixels: 20 }), viewport);
  assert.equal(cross.shapes.length, 3);
  assert.ok(cross.shapes.every(shape => shape.height !== cross.length || shape.y >= cross.height / 2));
  const dot = geometry(settings({ style: 6, dot: false, thicknessPixels: 9 }), viewport);
  assert.deepEqual(dot.shapes, [{ kind: 'rect', x: 955.5, y: 535.5, width: 9, height: 9 }]);
});

test('circle/square and dynamic-quad styles retain their distinct resting shapes', () => {
  const viewport = { width: 1920, height: 1080 };
  const circle = geometry(settings({ style: 3, gapPixels: 20, lengthPixels: 255, thicknessPixels: 4 }), viewport);
  assert.equal(circle.shapes[0].kind, 'circle');
  assert.equal(circle.shapes[0].r, 22);
  const dynamic = geometry(settings({ style: 1 }), viewport);
  assert.equal(dynamic.shapes[0].r, 8);
  const square = geometry(settings({ style: 8, gapPixels: 20, thicknessPixels: 4 }), viewport);
  assert.equal(square.shapes[0].kind, 'rect');
  assert.equal(square.shapes[0].width, 48);
  const quad = geometry(settings({ style: 7, lengthPixels: 20 }), viewport);
  assert.equal(quad.shapes.length, 5);
  assert.equal(quad.shapes.at(-1).kind, 'circle');
});

test('legacy dimensions, palette/RGB, alpha and outline flags stay independent of modern units', () => {
  const source = settings({ version: 2, size: 3, gap: -2, thickness: 2, useAlpha: false, alpha: 0, outline: false, color: 5, red: 11, green: 22, blue: 33 });
  const legacy = geometry(source, { height: 540 });
  assert.deepEqual([legacy.length, legacy.gap, legacy.thickness], [9, 2.2, 4]);
  assert.equal(legacy.opacity, 1);
  assert.equal(legacy.color, 'rgb(11, 22, 33)');
  assert.equal(legacy.outlineMode, 0);
  assert.equal(geometry({ ...source, useAlpha: true }).opacity, 0);
  assert.equal(geometry(settings({ useAlpha: false, alpha: 0 })).opacity, 0);
});

test('SVG uses the actual viewport and keeps outline/color passes separated', () => {
  const node = tag => ({ tag, attributes: {}, style: {}, children: [], setAttribute(k, v) { this.attributes[k] = String(v); }, append(child) { this.children.push(child); }, replaceChildren() { this.children = []; } });
  const graphic = node('svg');
  graphic.ownerDocument = { createElementNS(_namespace, tag) { return node(tag); } };
  draw(graphic, settings({ lengthPixels: 20, outlineMode: 1 }), { width: 960, height: 540 });
  assert.equal(graphic.attributes.viewBox, '0 0 960 540');
  assert.equal(graphic.style.width, '960px');
  assert.equal(graphic.style.height, '540px');
  assert.equal(graphic.style.overflow, 'hidden');
  assert.equal(graphic.children.length, 8);
  assert.ok(graphic.children.slice(0, 4).every(child => child.attributes.fill === '#080b09'));
  assert.ok(graphic.children.slice(4).every(child => child.attributes.fill === '#72ff6d'));
  draw(graphic, settings({ style: 6, outline: false }), { width: 320, height: 180 });
  assert.equal(graphic.children.length, 1);
  assert.equal(graphic.attributes.viewBox, '0 0 320 180');
});
