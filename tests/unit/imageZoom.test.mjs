/**
 * Pointer-anchored zoom for the full mockup viewer.
 *
 * The property that matters: the pixel under the cursor must not move when the
 * zoom changes. These assert that invariant directly by projecting a point
 * through the same transform the viewer applies —
 *
 *     screen = offset + point * zoom
 *
 * so a regression in the offset maths fails here rather than as "the image
 * jumps away from where I was looking".
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ZOOM_MAX, ZOOM_MIN, clampZoom, framePoint, wheelZoom, zoomToPoint,
} from '../../src/lib/imageZoom.js';

/** Where an IMAGE-space point lands on screen under a given view. */
const project = (view, point) => ({
  x: view.offset.x + point.x * view.zoom,
  y: view.offset.y + point.y * view.zoom,
});

/** The image-space point currently sitting under a screen position — the
 *  inverse of project(). The anchor passed to zoomToPoint is a SCREEN
 *  position, so this is what has to be resolved before/after to state the
 *  invariant honestly. */
const imageUnder = (view, screen) => ({
  x: (screen.x - view.offset.x) / view.zoom,
  y: (screen.y - view.offset.y) / view.zoom,
});

/** Zooming must leave whatever sits under `screen` still under `screen`. */
function assertAnchorHeld(before, after, screen, message) {
  const pinned = imageUnder(before, screen);
  assertSamePoint(project(after, pinned), screen, message);
}

/** Sub-pixel equality: the maths accumulates float noise across steps, and
 *  anything under a pixel is invisible on screen. */
function assertSamePoint(actual, expected, message) {
  assert.ok(
    Math.abs(actual.x - expected.x) < 0.01 && Math.abs(actual.y - expected.y) < 0.01,
    `${message} — expected ~(${expected.x}, ${expected.y}), got (${actual.x}, ${actual.y})`,
  );
}

const RESET = { zoom: 1, offset: { x: 0, y: 0 } };

describe('image zoom · clamping', () => {
  it('holds the zoom inside its range', () => {
    assert.equal(clampZoom(0.2), ZOOM_MIN);
    assert.equal(clampZoom(99), ZOOM_MAX);
    assert.equal(clampZoom(2.5), 2.5);
  });

  it('treats unusable input as fully zoomed out', () => {
    for (const value of [NaN, undefined, null, 'x', {}]) {
      assert.equal(clampZoom(value), ZOOM_MIN);
    }
  });

  it('steps up and down from a wheel delta and stops at the bounds', () => {
    assert.ok(wheelZoom(1, -1) > 1, 'scrolling up zooms in');
    assert.ok(wheelZoom(2, 1) < 2, 'scrolling down zooms out');
    assert.equal(wheelZoom(ZOOM_MIN, 1), ZOOM_MIN);
    assert.equal(wheelZoom(ZOOM_MAX, -1), ZOOM_MAX);
  });
});

describe('image zoom · the anchor point stays put', () => {
  it('keeps the pixel under the cursor fixed when zooming in', () => {
    const cursor = { x: 120, y: -64 };
    const after = zoomToPoint(RESET, 2, cursor);
    assertAnchorHeld(RESET, after, cursor,
      'the detail under the pointer must not move');
    assert.equal(after.zoom, 2);
  });

  it('keeps it fixed across a chain of steps', () => {
    const cursor = { x: -80, y: 45 };
    let view = RESET;
    for (const zoom of [1.15, 1.32, 1.52, 2.1, 3]) {
      const before = view;
      view = zoomToPoint(view, zoom, cursor);
      assertAnchorHeld(before, view, cursor, `anchor drifted at ${zoom}x`);
    }
  });

  it('keeps it fixed while zooming back out', () => {
    const cursor = { x: 40, y: 40 };
    const zoomedIn = zoomToPoint(RESET, 4, cursor);
    const backOut = zoomToPoint(zoomedIn, 2, cursor);
    assertAnchorHeld(zoomedIn, backOut, cursor,
      'zooming back out must not shift the anchor');
  });

  it('zooms about the centre when no point is given', () => {
    const view = zoomToPoint(RESET, 3);
    assert.deepEqual(view.offset, { x: 0, y: 0 });
    assert.equal(view.zoom, 3);
  });

  it('anchors on a new cursor position after an earlier zoom', () => {
    const first = zoomToPoint(RESET, 2, { x: 100, y: 0 });
    const cursor = { x: -50, y: 20 };
    const second = zoomToPoint(first, 3, cursor);
    assert.equal(second.zoom, 3);
    assertAnchorHeld(first, second, cursor,
      'moving the cursor and zooming again must pin the NEW point');
  });

  it('holds the anchor when the view has already been panned', () => {
    const panned = { zoom: 2.5, offset: { x: -180, y: 60 } };
    const cursor = { x: 75, y: -30 };
    assertAnchorHeld(panned, zoomToPoint(panned, 4, cursor), cursor,
      'a pan before the zoom must not break the anchor');
  });
});

describe('image zoom · returning to 1x', () => {
  it('recentres so the image cannot strand off to one side', () => {
    const panned = { zoom: 3, offset: { x: -240, y: 130 } };
    const reset = zoomToPoint(panned, 1, { x: 90, y: 90 });
    assert.deepEqual(reset, { zoom: ZOOM_MIN, offset: { x: 0, y: 0 } });
  });

  it('recentres even when the request undershoots the minimum', () => {
    const panned = { zoom: 2, offset: { x: 50, y: 50 } };
    assert.deepEqual(zoomToPoint(panned, 0.2, { x: 10, y: 10 }),
      { zoom: ZOOM_MIN, offset: { x: 0, y: 0 } });
  });

  it('leaves the view untouched when the zoom does not change', () => {
    const view = { zoom: 2, offset: { x: 12, y: -8 } };
    assert.deepEqual(zoomToPoint(view, 2, { x: 30, y: 30 }), view);
  });

  it('cannot exceed the maximum by repeated stepping', () => {
    let view = RESET;
    for (let i = 0; i < 40; i += 1) view = zoomToPoint(view, view.zoom * 1.4, { x: 10, y: 10 });
    assert.equal(view.zoom, ZOOM_MAX);
  });
});

describe('image zoom · frame coordinates', () => {
  const rect = { left: 100, top: 50, width: 400, height: 400 };

  it('measures the pointer from the frame centre', () => {
    assert.deepEqual(framePoint(rect, 300, 250), { x: 0, y: 0 },
      'the centre of the frame is the origin');
    assert.deepEqual(framePoint(rect, 500, 450), { x: 200, y: 200 });
    assert.deepEqual(framePoint(rect, 100, 50), { x: -200, y: -200 });
  });

  it('degrades to the centre when the frame has not been measured', () => {
    assert.deepEqual(framePoint(null, 300, 250), { x: 0, y: 0 });
    assert.deepEqual(framePoint({ width: 0, height: 0 }, 5, 5), { x: 0, y: 0 });
  });
});
