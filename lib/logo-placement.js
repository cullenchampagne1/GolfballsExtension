/* Canonical golfballs.com custom-logo crop placement.
 *
 * Every proposal logo upload (detail customizer, proposal drag/drop, and copied
 * imprints) converges on background.js. Keep the Fabric object in one classic
 * worker-safe module so those entry points cannot drift. Values are taken from
 * the accepted website Express-logo save captured on 2026-08-31.
 */
(function initLogoPlacement(root) {
  'use strict';

  const PLACEMENT = Object.freeze({
    width: 500,
    height: 500,
    left: 250.67,
    top: 301.67,
    scaleX: 0.52,
    scaleY: 0.52,
    opacity: 0.85,
  });

  function createUserImage(src = '') {
    return {
      type: 'image', version: '5.3.0', originX: 'center', originY: 'center',
      left: PLACEMENT.left, top: PLACEMENT.top,
      width: PLACEMENT.width, height: PLACEMENT.height,
      fill: 'rgb(0,0,0)', stroke: null, strokeWidth: 0, strokeDashArray: null, strokeLineCap: 'butt',
      strokeDashOffset: 0, strokeLineJoin: 'miter', strokeUniform: false, strokeMiterLimit: 4,
      scaleX: PLACEMENT.scaleX, scaleY: PLACEMENT.scaleY,
      angle: 0, flipX: false, flipY: false, opacity: PLACEMENT.opacity,
      shadow: null, visible: true, backgroundColor: '', fillRule: 'nonzero', paintFirst: 'fill',
      globalCompositeOperation: 'source-over', skewX: 0, skewY: 0, cropX: 0, cropY: 0,
      src: String(src || ''), crossOrigin: null, filters: [],
    };
  }

  root.GBLogoPlacement = Object.freeze({ PLACEMENT, createUserImage });
})(globalThis);
