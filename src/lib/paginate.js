import { cssFor } from './invoiceHtml.js';

const PX_PER_MM = 96 / 25.4;
export const A4 = { w: 210, h: 297 };
let measurer = null;

function getMeasurer() {
  if (measurer) return measurer;
  measurer = document.createElement('div');
  measurer.setAttribute('aria-hidden', 'true');
  measurer.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(measurer);
  return measurer;
}

export function contentHeight(tpl) {
  return A4.h - tpl.margin * 2;
}
export function contentWidth(tpl) {
  return A4.w - tpl.margin * 2;
}

/**
 * Measures each block in a hidden column of the template's real width.
 * `display:flow-root` contains child margins so nothing is missed.
 */
export function measureBlocks(blocks, tpl, design, widthMm) {
  const host = getMeasurer();
  host.innerHTML = `<style>${cssFor(tpl, design)}</style>` +
    `<div class="doc" style="width:${widthMm}mm">${blocks.map(b => `<div data-b style="display:flow-root">${b.html}</div>`).join('')}</div>`;
  const els = host.querySelectorAll('[data-b]');
  return Array.from(els).map(el => el.getBoundingClientRect().height / PX_PER_MM);
}

/**
 * Line-item tables are the only thing that can overflow a page: split
 * them at <tr> boundaries into page-sized chunks, re-emitting the
 * <thead> on every part.
 */
export function fitBlocks(blocks, tpl, design, widthMm, contentH) {
  const heights = measureBlocks(blocks, tpl, design, widthMm);
  if (!blocks.some((b, i) => heights[i] > contentH && b.html.includes('<tr'))) {
    return { blocks, heights };
  }
  const outBlocks = [];
  const outH = [];
  for (let i = 0; i < blocks.length; i++) {
    if (heights[i] <= contentH || !blocks[i].html.includes('<tr')) {
      outBlocks.push(blocks[i]);
      outH.push(heights[i]);
      continue;
    }
    const parts = splitTableBlock(blocks[i], tpl, design, widthMm, contentH);
    const ph = measureBlocks(parts, tpl, design, widthMm);
    outBlocks.push(...parts);
    outH.push(...ph);
  }
  return { blocks: outBlocks, heights: outH };
}

function splitTableBlock(block, tpl, design, widthMm, contentH) {
  const html = block.html;
  const tbodyStart = html.indexOf('<tbody>');
  const tbodyEnd = html.lastIndexOf('</tbody>');
  if (tbodyStart < 0 || tbodyEnd < 0) return [block];

  const prefix = html.slice(0, tbodyStart + 7);   // everything up to and incl. <tbody>
  const tail = html.slice(tbodyEnd);              // </tbody></table> + anything after
  const rows = (html.slice(tbodyStart + 7, tbodyEnd).match(/<tr[\s\S]*?<\/tr>/g)) || [];
  if (rows.length < 2) return [block];

  const mk = (rs, i, last) => ({ ...block, html: prefix + rs.join('') + (last ? tail : '</tbody></table>'), key: `${block.key}~${i}` });

  // Measure head+first-chunk overhead once, then pack rows greedily.
  const probe = [mk([rows[0]], 0, false)];
  const overhead = measureBlocks(probe, tpl, design, widthMm)[0];
  const rowH = measureBlocks(rows.map(r => ({ html: `<table>${r}</table>` })), tpl, design, widthMm);

  const parts = [];
  let cur = [];
  let used = overhead;
  for (let i = 0; i < rows.length; i++) {
    if (used + rowH[i] > contentH * 0.97 && cur.length) {
      parts.push(mk(cur, parts.length, false));
      cur = [];
      used = overhead;
    }
    cur.push(rows[i]);
    used += rowH[i];
  }
  if (cur.length) parts.push(mk(cur, parts.length, true));
  return parts;
}

/** Pack blocks into A4 pages; keepWithNext glues headings to content. */
export function packPages(blocks, heights, contentH) {
  const groups = [];
  for (let i = 0; i < blocks.length; i++) {
    const g = { blocks: [blocks[i]], h: heights[i] };
    while (blocks[i].keepWithNext && i + 1 < blocks.length) {
      i++;
      g.blocks.push(blocks[i]);
      g.h += heights[i];
    }
    groups.push(g);
  }
  const pages = [[]];
  let used = 0;
  for (const g of groups) {
    if (used + g.h > contentH && used > 0) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(...g.blocks);
    used += g.h;
  }
  return pages;
}
