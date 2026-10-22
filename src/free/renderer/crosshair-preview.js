/* Own SVG geometry. Coordinates are CSS pixels at the preview's rendered height. */
(() => {
  'use strict';
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const positive = (value, fallback) => Math.max(0, finite(value, fallback));
  const palette = ['#fa5656', '#72ff6d', '#ffe769', '#658bff', '#75faff', '#ffffff'];

  function geometry(settings, { width = 105, height = 105, renderHeight = height } = {}) {
    width = Math.max(1, finite(width, 105));
    height = Math.max(1, finite(height, 105));
    renderHeight = Math.max(1, finite(renderHeight, height));
    const modern = settings.version === 3;
    // Zero means automatic in this preview; the game/reference renderer's zero behavior is unverified.
    const referenceHeight = positive(settings.screenHeight, 1080) || renderHeight;
    const scale = renderHeight / referenceHeight;
    const length = modern ? Math.round(positive(settings.lengthPixels, 2) * scale) : positive(settings.size, 2) * 3;
    const thickness = modern ? Math.max(1, Math.round(positive(settings.thicknessPixels, 2) * scale)) : Math.max(1, positive(settings.thickness, .5) * 2);
    const gap = modern ? positive(settings.gapPixels, 1) * scale : Math.max(.5, 5 + finite(settings.gap, -2) * 1.4);
    const outlineMode = settings.outline ? (modern ? finite(settings.outlineMode, 1) : 1) : 0;
    const outlineWidth = modern ? Math.max(1, Math.round(renderHeight / 1080)) : positive(settings.outlineThickness, 1);
    const color = settings.color === 5 ? `rgb(${settings.red}, ${settings.green}, ${settings.blue})` : palette[settings.color] || palette[1];
    const opacity = modern || settings.useAlpha ? Math.min(255, positive(settings.alpha, 255)) / 255 : 1;
    const centerX = width / 2, centerY = height / 2, shapes = [];
    const cross = distance => {
      if (!length) return;
      const add = (x, y, w, h) => shapes.push({ kind: 'rect', x: centerX + x, y: centerY + y, width: w, height: h });
      add(-distance - length, -thickness / 2, length, thickness);
      add(distance, -thickness / 2, length, thickness);
      add(-thickness / 2, distance, thickness, length);
      if (!settings.tStyle) add(-thickness / 2, -distance - length, thickness, length);
    };
    const ring = radius => shapes.push({ kind: 'circle', cx: centerX, cy: centerY, r: radius + thickness / 2, fill: 'none', strokeWidth: thickness });
    const style = modern ? finite(settings.style, 4) : 4;
    const idleSpread = 7 * renderHeight / 1080;
    // Dynamic styles show their resting shape. This composition does not simulate shots/recoil.
    if (style === 1) ring(settings.dot ? Math.max(idleSpread, thickness + 2 * renderHeight / 1080) : idleSpread);
    else if (style === 3) ring(gap);
    else if (style === 8) {
      const outer = gap + thickness;
      shapes.push({ kind: 'rect', x: centerX - outer, y: centerY - outer, width: outer * 2, height: outer * 2, fill: 'none', strokeWidth: thickness });
    } else if (style !== 6) {
      const distance = style === 0 ? idleSpread : style === 2 ? gap + idleSpread * 5 / 7 : gap;
      cross(distance);
      if (style === 7) ring(settings.dot ? Math.max(idleSpread, thickness + 2 * renderHeight / 1080) : idleSpread);
    }
    if (settings.dot || style === 6) {
      // Modern pixel dots occupy exactly the selected thickness. Preserve legacy round dots.
      if (modern) shapes.push({ kind: 'rect', x: centerX - thickness / 2, y: centerY - thickness / 2, width: thickness, height: thickness });
      else shapes.push({ kind: 'circle', cx: centerX, cy: centerY, r: Math.max(1.3, thickness / 1.8) });
    }
    return { width, height, renderHeight, referenceHeight, scale, length, gap, thickness, color, opacity, outlineMode, outlineWidth, shapes };
  }

  function draw(graphic, settings, viewport) {
    const layout = geometry(settings, viewport);
    const document = graphic.ownerDocument;
    graphic.replaceChildren();
    graphic.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    graphic.style.width = `${layout.width}px`;
    graphic.style.height = `${layout.height}px`;
    graphic.style.overflow = 'hidden';
    graphic.style.opacity = layout.opacity;
    const add = (shape, outline = false, offsetX = 0, offsetY = 0) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', shape.kind);
      const { kind, strokeWidth, fill, ...attributes } = shape;
      if (outline && kind === 'rect' && fill !== 'none') {
        const width = layout.outlineWidth;
        attributes.x -= width; attributes.y -= width;
        attributes.width += width * (layout.outlineMode === 2 ? 1 : 2);
        attributes.height += width * (layout.outlineMode === 2 ? 1 : 2);
      }
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
      if (fill === 'none') {
        node.setAttribute('fill', 'none');
        node.setAttribute('stroke', outline ? '#080b09' : layout.color);
        node.setAttribute('stroke-width', strokeWidth + (outline && layout.outlineMode === 1 ? 2 * layout.outlineWidth : 0));
      } else {
        node.setAttribute('fill', outline ? '#080b09' : layout.color);
        if (outline && kind !== 'rect') { node.setAttribute('stroke', '#080b09'); node.setAttribute('stroke-width', 2 * layout.outlineWidth); }
      }
      if (offsetX || offsetY) node.setAttribute('transform', `translate(${offsetX} ${offsetY})`);
      graphic.append(node);
    };
    if (layout.outlineMode && layout.outlineWidth) layout.shapes.forEach(shape => {
      if (layout.outlineMode === 2 && shape.fill === 'none') {
        const distance = -layout.outlineWidth;
        add(shape, true, distance, 0); add(shape, true, 0, distance); add(shape, true, distance, distance);
      } else add(shape, true);
    });
    layout.shapes.forEach(shape => add(shape));
    return layout;
  }
  const api = { geometry, draw };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.CSBoostCrosshairPreview = api;
})();
