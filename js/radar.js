/**
 * Radar rendering module - draws SVG-based radar chart.
 *
 * Supports two modes:
 *   1. Full radar  (all sections) - used on summary page
 *   2. Single section detail radar  - used on detail page
 */

const RadarChart = (() => {

  // Ring radii as fractions of the total radius (inner -> outer)
  const RING_FRACTIONS = [0.28, 0.48, 0.68, 0.88];
  const SIZE_SCALE = 1.1;

  /**
  * Render full multi-section radar.
   *
   * @param {HTMLElement} container
   * @param {Array} items - radar items
   * @param {Function} onQuadrantClick - callback(quadrantName)
   * @param {Function} onBlipClick - callback(item)
   */
  function renderFull(container, items, onQuadrantClick, onBlipClick) {
    container.innerHTML = '';

    const size = Math.round(Math.min(window.innerWidth - 80, 860) * SIZE_SCALE);
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 30;

    const svg = createSVG(size, size);
    container.appendChild(svg);

    // Background rings
    drawRings(svg, cx, cy, maxR, true);

    // Section dividers
    const sectionNames = RadarData.QUADRANTS;
    const sectionCount = sectionNames.length;
    const sectionAngle = (Math.PI * 2) / sectionCount;
    const baseAngle = -Math.PI / 2; // top
    const startAngle0 = baseAngle - sectionAngle / 2;
    const dividerR = maxR + 10;

    for (let i = 0; i < sectionCount; i++) {
      const angle = startAngle0 + i * sectionAngle;
      line(
        svg,
        cx,
        cy,
        cx + dividerR * Math.cos(angle),
        cy + dividerR * Math.sin(angle),
        '#ccc',
        1
      );
    }

    // Ring labels on the horizontal axis (middle of chart)
    // Adopt nearest center, Hold at edge
    const ringNames = RadarData.RINGS;
    const ringFracs = RING_FRACTIONS;
    for (let i = 0; i < 4; i++) {
      const prevR = i === 0 ? 0 : ringFracs[i - 1] * maxR;
      const curR = ringFracs[i] * maxR;
      const midR = (prevR + curR) / 2;
      // Right side: Adopt·Trial·Assess·Hold (inner→outer)
      text(svg, cx + midR, cy + 4, ringNames[i], 'ring-label', 'middle');
      // Left side: Adopt·Trial·Assess·Hold (inner→outer, mirrored)
      text(svg, cx - midR, cy + 4, ringNames[i], 'ring-label', 'middle');
    }

    // Section labels
    const labelRadius = maxR + 16;
    sectionNames.forEach((name, i) => {
      const angle = baseAngle + i * sectionAngle;
      const x = cx + labelRadius * Math.cos(angle);
      const y = cy + labelRadius * Math.sin(angle) + 4;
      const anchor = labelAnchorForAngle(angle);
      const label = text(svg, x, y, name + ' >', 'quadrant-label', anchor);
      label.style.cursor = 'pointer';
      label.addEventListener('click', () => onQuadrantClick(name));
    });

    // Place blips
    const quadrantAngles = {};
    sectionNames.forEach((name, i) => {
      const start = startAngle0 + i * sectionAngle;
      quadrantAngles[name] = { startAngle: start, endAngle: start + sectionAngle };
    });

    const tooltip = createTooltip(container);

    // Group items by quadrant, resolve collisions per quadrant
    const quadrantGroups = {};

    items.forEach((item) => {
      const angles = quadrantAngles[item.quadrant];
      if (!angles) return;
      const ringIndex = RadarData.RINGS.indexOf(item.ring);
      if (ringIndex < 0) return;

      const { x, y } = getBlipPosition(item, ringIndex, angles, maxR, cx, cy);
      const key = item.quadrant;
      if (!quadrantGroups[key]) quadrantGroups[key] = [];
      quadrantGroups[key].push({ x, y, item, ringIndex, angles, maxR, cx, cy, color: RadarData.QUADRANT_COLORS[item.quadrant] });
    });

    // Resolve collisions independently per quadrant
    Object.values(quadrantGroups).forEach((group) => {
      resolveCollisions(group);
    });

    // Resolve cross-quadrant overlaps near the center
    const allBlips = Object.values(quadrantGroups).flat();
    resolveCrossQuadrantOverlaps(allBlips, cx, cy);

    // Push circles away from the horizontal axis label zone
    resolveLabelOverlaps(allBlips, cy);

    // Draw all blips
    Object.values(quadrantGroups).forEach((group) => {
      group.forEach((b) => {
        drawBlip(svg, b.x, b.y, b.item, b.color, tooltip, onBlipClick);
      });
    });
  }

  /**
  * Render single-section detail radar.
   *
   * @param {HTMLElement} container
   * @param {Array} items - items in this quadrant only
   * @param {string} quadrantName
   * @param {Function} onBlipClick
   */
  function renderQuadrant(container, items, quadrantName, onBlipClick) {
    container.innerHTML = '';

    const size = Math.round(700 * SIZE_SCALE);
    const padding = 40;
    const maxR = size / 2 - padding;

    const svg = createSVG(size, size);
    container.appendChild(svg);

    const color = RadarData.QUADRANT_COLORS[quadrantName];

    // Draw section rings
    const cx = size / 2;
    const cy = size / 2;
    const sectionNames = RadarData.QUADRANTS;
    const sectionCount = sectionNames.length;
    const sectionAngle = (Math.PI * 2) / sectionCount;
    const baseAngle = -Math.PI / 2;
    const sectionIndex = sectionNames.indexOf(quadrantName);
    if (sectionIndex < 0) return;
    const midAngle = baseAngle + sectionIndex * sectionAngle;
    const startAngle = midAngle - sectionAngle / 2;
    const endAngle = midAngle + sectionAngle / 2;

    for (let i = RING_FRACTIONS.length - 1; i >= 0; i--) {
      const innerR = i === 0 ? 0 : RING_FRACTIONS[i - 1] * maxR;
      const outerR = RING_FRACTIONS[i] * maxR;
      const path = describeRingSector(cx, cy, innerR, outerR, startAngle, endAngle);
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', path + ` L ${cx} ${cy} Z`);
      pathEl.setAttribute('fill', i % 2 === 0 ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.02)');
      pathEl.setAttribute('stroke', '#ddd');
      pathEl.setAttribute('stroke-width', '0.5');
      svg.appendChild(pathEl);
    }

    // Ring labels along the section bisector
    const ringNames = RadarData.RINGS;
    for (let i = 0; i < 4; i++) {
      const prevR = i === 0 ? 0 : RING_FRACTIONS[i - 1] * maxR;
      const curR = RING_FRACTIONS[i] * maxR;
      const midR = (prevR + curR) / 2;
      const x = cx + midR * Math.cos(midAngle);
      const y = cy + midR * Math.sin(midAngle);
      text(svg, x, y, ringNames[i], 'ring-label', 'middle');
    }

    // Section boundaries
    line(svg, cx, cy, cx + maxR * Math.cos(startAngle), cy + maxR * Math.sin(startAngle), '#ccc', 1);
    line(svg, cx, cy, cx + maxR * Math.cos(endAngle), cy + maxR * Math.sin(endAngle), '#ccc', 1);

    // Quadrant title
    text(svg, cx + 8, padding - 10, quadrantName + ' >', 'quadrant-label', 'start');

    // Place blips in this quarter
    const tooltip = createTooltip(container);

    const blips = [];

    items.forEach((item) => {
      const ringIndex = RadarData.RINGS.indexOf(item.ring);
      if (ringIndex < 0) return;

      const innerR = ringIndex === 0 ? 0 : RING_FRACTIONS[ringIndex - 1] * maxR;
      const outerR = RING_FRACTIONS[ringIndex] * maxR;
      const { x, y } = getBlipPosition(item, ringIndex, { startAngle, endAngle }, maxR, cx, cy);
      blips.push({
        x,
        y,
        item,
        ringIndex,
        angles: { startAngle, endAngle },
        maxR,
        cx,
        cy,
        color,
      });
    });

    resolveCollisions(blips);

    blips.forEach((b) => {
      drawBlip(svg, b.x, b.y, b.item, b.color, tooltip, onBlipClick);
    });
  }

  // ======================== Helpers ========================

  function createSVG(w, h) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.overflow = 'visible';
    return svg;
  }

  function drawRings(svg, cx, cy, maxR, full) {
    for (let i = RING_FRACTIONS.length - 1; i >= 0; i--) {
      const r = RING_FRACTIONS[i] * maxR;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', i % 2 === 0 ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.02)');
      circle.setAttribute('stroke', '#ddd');
      circle.setAttribute('stroke-width', '0.5');
      svg.appendChild(circle);
    }
  }

  function line(svg, x1, y1, x2, y2, color, width) {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', x1);
    l.setAttribute('y1', y1);
    l.setAttribute('x2', x2);
    l.setAttribute('y2', y2);
    l.setAttribute('stroke', color);
    l.setAttribute('stroke-width', width);
    svg.appendChild(l);
    return l;
  }

  function text(svg, x, y, content, className, anchor) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('class', className || '');
    t.setAttribute('text-anchor', anchor || 'middle');
    t.textContent = content;
    svg.appendChild(t);
    return t;
  }

  function labelAnchorForAngle(angle) {
    const c = Math.cos(angle);
    if (c > 0.2) return 'start';
    if (c < -0.2) return 'end';
    return 'middle';
  }

  function createMultilineLabel(svg, x, y, lines, anchor) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    g.setAttribute('x', x);
    g.setAttribute('y', y);
    g.setAttribute('class', 'quadrant-label');
    g.setAttribute('text-anchor', anchor || 'middle');
    lines.forEach((line, i) => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', x);
      tspan.setAttribute('dy', i === 0 ? 0 : '1.2em');
      tspan.textContent = i === lines.length - 1 ? line + ' >' : line;
      g.appendChild(tspan);
    });
    svg.appendChild(g);
    return g;
  }

  function getBlipPosition(item, ringIndex, angles, maxR, cx, cy) {
    const innerR = ringIndex === 0 ? 0 : RING_FRACTIONS[ringIndex - 1] * maxR;
    const outerR = RING_FRACTIONS[ringIndex] * maxR;
    const margin = 14;
    const score = typeof item.score === 'number' ? item.score : 0.5;
    const clampedScore = Math.min(Math.max(score, 0), 1);
    const range = outerR - innerR - margin * 2;
    const jitter = seededRandom(item.id * 7 + 3) * 0.08 * range;
    const r = innerR + margin + (1 - clampedScore) * range + jitter;
    const anglePad = 0.15; // generous padding off the axis lines
    const angleRange = angles.endAngle - angles.startAngle - anglePad * 2;
    const angle = angles.startAngle + anglePad + seededRandom(item.id * 13 + 7) * angleRange;

    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  }

  function resolveCollisions(blips) {
    const minDist = 26;
    const iterations = 150;
    const step = 0.35;
    const damping = 0.85;
    const jitter = 1.2;

    blips.forEach((b) => {
      b.vx = 0;
      b.vy = 0;
    });

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < blips.length; i++) {
        for (let j = i + 1; j < blips.length; j++) {
          const a = blips[i];
          const b = blips[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          if (dist === 0) {
            // Use seeded random to break ties deterministically
            const angle = seededRandom(i * 17 + j * 31) * Math.PI * 2;
            dx = Math.cos(angle) * 0.1;
            dy = Math.sin(angle) * 0.1;
            dist = Math.hypot(dx, dy);
          }
          if (dist < minDist) {
            const overlap = minDist - dist;
            const ux = dx / dist;
            const uy = dy / dist;
            const force = overlap * 0.5;
            a.vx -= ux * force;
            a.vy -= uy * force;
            b.vx += ux * force;
            b.vy += uy * force;
          }
        }
      }

      blips.forEach((b, idx) => {
        // Seeded jitter to break linear stacking
        b.vx += (seededRandom(iter * 113 + idx * 7) - 0.5) * jitter;
        b.vy += (seededRandom(iter * 131 + idx * 11) - 0.5) * jitter;

        b.x += b.vx * step;
        b.y += b.vy * step;
        b.vx *= damping;
        b.vy *= damping;

        clampToSector(b);
      });
    }

    blips.forEach((b) => {
      delete b.vx;
      delete b.vy;
    });
  }

  function clampToSector(blip) {
    const { cx, cy, ringIndex, maxR } = blip;
    let start = blip.angles.startAngle;
    let end = blip.angles.endAngle;
    if (end < start) {
      const tmp = start;
      start = end;
      end = tmp;
    }

    const innerR = ringIndex === 0 ? 0 : RING_FRACTIONS[ringIndex - 1] * maxR;
    const outerR = RING_FRACTIONS[ringIndex] * maxR;
    const margin = 14;
    const anglePadding = 0.12;

    let dx = blip.x - cx;
    let dy = blip.y - cy;
    let r = Math.hypot(dx, dy);
    let angle = Math.atan2(dy, dx);

    // Normalize angle to be between start and end
    // Handle wrap-around for quadrants crossing the ±π boundary
    while (angle < start) angle += Math.PI * 2;
    while (angle > end) angle -= Math.PI * 2;

    if (angle < start + anglePadding) angle = start + anglePadding;
    if (angle > end - anglePadding) angle = end - anglePadding;

    const minR = innerR + margin;
    const maxRadius = outerR - margin;
    if (r < minR) r = minR;
    if (r > maxRadius) r = maxRadius;

    blip.x = cx + r * Math.cos(angle);
    blip.y = cy + r * Math.sin(angle);
  }

  /**
   * Resolve overlaps between blips from different quadrants by pushing
   * them radially outward (away from center) so they stay in their quadrant.
   */
  function resolveCrossQuadrantOverlaps(blips, centerX, centerY) {
    const minDist = 26;
    const iterations = 60;

    for (let iter = 0; iter < iterations; iter++) {
      let moved = false;
      for (let i = 0; i < blips.length; i++) {
        for (let j = i + 1; j < blips.length; j++) {
          // Only check blips from different quadrants
          if (blips[i].item.quadrant === blips[j].item.quadrant) continue;

          const dx = blips[j].x - blips[i].x;
          const dy = blips[j].y - blips[i].y;
          const dist = Math.hypot(dx, dy);

          if (dist < minDist) {
            moved = true;
            const push = (minDist - dist) / 2 + 0.5;

            // Push each blip outward along its own radial direction
            [blips[i], blips[j]].forEach((b) => {
              const rx = b.x - centerX;
              const ry = b.y - centerY;
              const r = Math.hypot(rx, ry) || 1;
              b.x += (rx / r) * push;
              b.y += (ry / r) * push;
              clampToSector(b);
            });
          }
        }
      }
      if (!moved) break;
    }
  }

  /**
   * Push blips away from the horizontal axis where ring labels sit,
   * then re-resolve any new circle-circle overlaps.
   */
  function resolveLabelOverlaps(blips, centerY) {
    const exclusionHalf = 12; // half-height of label exclusion zone
    const labelTop = centerY - exclusionHalf;
    const labelBottom = centerY + exclusionHalf;

    blips.forEach((b) => {
      if (b.y > labelTop && b.y < labelBottom) {
        // Push above or below the label zone
        if (b.y < centerY) {
          b.y = labelTop - 2;
        } else {
          b.y = labelBottom + 2;
        }
        clampToSector(b);
      }
    });

    // Re-resolve any overlaps caused by pushing
    resolveCollisions(blips);
  }

  function drawBlip(svg, x, y, item, color, tooltip, onClick) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'blip');
    g.setAttribute('transform', `translate(${x}, ${y})`);

    // Keep visuals in an inner group so hover scaling doesn't move the translated position
    const content = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    content.setAttribute('class', 'blip-content');

    const r = 11;

    if (item.movement === 'new') {
      // New: filled circle with a ring
      const outer = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      outer.setAttribute('r', r);
      outer.setAttribute('fill', 'transparent');
      outer.setAttribute('stroke', color);
      outer.setAttribute('stroke-width', '2');
      content.appendChild(outer);

      const inner = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      inner.setAttribute('r', r - 4);
      inner.setAttribute('fill', color);
      content.appendChild(inner);
    } else if (item.movement === 'moved') {
      // Moved: triangle
      const s = r + 1;
      const tri = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tri.setAttribute('d', `M 0,${-s} L ${s},${s * 0.8} L ${-s},${s * 0.8} Z`);
      tri.setAttribute('fill', color);
      content.appendChild(tri);
    } else {
      // No change: solid filled circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', r);
      circle.setAttribute('fill', color);
      content.appendChild(circle);
    }

    // Number label
    const numText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    numText.setAttribute('class', 'blip-number');
    numText.textContent = item.id;
    content.appendChild(numText);

    g.appendChild(content);

    // Tooltip events
    g.addEventListener('mouseenter', (e) => {
      showTooltip(tooltip, item.name, e);
    });
    g.addEventListener('mousemove', (e) => {
      moveTooltip(tooltip, e);
    });
    g.addEventListener('mouseleave', () => {
      hideTooltip(tooltip);
    });

    if (onClick) {
      g.addEventListener('click', () => onClick(item));
    }

    svg.appendChild(g);
  }

  function createTooltip(container) {
    let tip = container.querySelector('.tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tooltip';
      container.style.position = 'relative';
      container.appendChild(tip);
    }
    return tip;
  }

  function showTooltip(tip, text, e) {
    tip.textContent = text;
    tip.classList.add('visible');
    moveTooltip(tip, e);
  }

  function moveTooltip(tip, e) {
    const rect = tip.parentElement.getBoundingClientRect();
    const offsetX = 16;
    const offsetY = 20;
    tip.style.left = (e.clientX - rect.left + offsetX) + 'px';
    tip.style.top = (e.clientY - rect.top - offsetY) + 'px';
  }

  function hideTooltip(tip) {
    tip.classList.remove('visible');
  }

  /**
   * Simple seeded pseudo-random for deterministic placement.
   */
  function seededRandom(seed) {
    const x = Math.sin(seed + 1) * 10000;
    return x - Math.floor(x);
  }

  function describeArc(cx, cy, r, startAngle, endAngle) {
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  function polarToCartesian(cx, cy, r, angle) {
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  }

  function describeRingSector(cx, cy, innerR, outerR, startAngle, endAngle) {
    const largeArc = endAngle - startAngle <= Math.PI ? 0 : 1;
    const startOuter = polarToCartesian(cx, cy, outerR, startAngle);
    const endOuter = polarToCartesian(cx, cy, outerR, endAngle);

    if (innerR <= 0) {
      return `M ${startOuter.x} ${startOuter.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y} L ${cx} ${cy} Z`;
    }

    const startInner = polarToCartesian(cx, cy, innerR, endAngle);
    const endInner = polarToCartesian(cx, cy, innerR, startAngle);
    return `M ${startOuter.x} ${startOuter.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y} L ${startInner.x} ${startInner.y} A ${innerR} ${innerR} 0 ${largeArc} 0 ${endInner.x} ${endInner.y} Z`;
  }

  return { renderFull, renderQuadrant };
})();
