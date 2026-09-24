/**
 * Document rendering: invoice / quote / credit note / statement of
 * account as A4 HTML. Four templates, each with its own typography and
 * layout — not skins over one layout. All figures use tabular numerals
 * and right-aligned columns, which is what makes invoices look right.
 */
import { A4 } from './paginate.js';
import { docTotals, paidMinor, fmt, docStatus, daysOverdue } from './money.js';
import { clientOf, businessOf } from './model.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const TEMPLATES = {
  classic: {
    id: 'classic', name: 'Classic', margin: 18, free: true,
    font: 'Georgia, "Times New Roman", serif', body: '12.5px', h1: '26px', accent: '#0f172a',
    layout: 'header-right'
  },
  modern: {
    id: 'modern', name: 'Modern', margin: 16, free: true,
    font: '"Segoe UI", Arial, sans-serif', body: '12.5px', h1: '28px', accent: '#0f172a',
    layout: 'header-left'
  },
  band: {
    id: 'band', name: 'Accent Band', margin: 16, free: false,
    font: '"Segoe UI", Arial, sans-serif', body: '12.5px', h1: '26px', accent: '#0f172a',
    layout: 'topband'
  },
  minimal: {
    id: 'minimal', name: 'Minimal', margin: 20, free: false,
    font: '"Helvetica Neue", Arial, sans-serif', body: '12px', h1: '24px', accent: '#334155',
    layout: 'header-left', light: true
  },
  compact: {
    id: 'compact', name: 'Compact', margin: 14, free: false,
    font: '"Segoe UI", Arial, sans-serif', body: '11px', h1: '22px', accent: '#0f172a',
    layout: 'header-left', dense: true
  },
  mono: {
    id: 'mono', name: 'Ledger', margin: 16, free: false,
    font: '"Courier New", Courier, monospace', body: '12px', h1: '26px', accent: '#1e293b',
    layout: 'header-left', ruled: true
  },
  boxed: {
    id: 'boxed', name: 'Boxed', margin: 16, free: false,
    font: '"Segoe UI", Arial, sans-serif', body: '12.5px', h1: '26px', accent: '#0f172a',
    layout: 'metabox'
  },
  elegant: {
    id: 'elegant', name: 'Elegant', margin: 20, free: false,
    font: 'Georgia, "Times New Roman", serif', body: '12.5px', h1: '30px', accent: '#78350f',
    layout: 'header-center', light: true, italic: true
  },
  statement: {
    id: 'statement', name: 'Statement', margin: 16, free: false,
    font: '"Segoe UI", Arial, sans-serif', body: '12.5px', h1: '24px', accent: '#0f172a',
    layout: 'header-left'
  }
};

const TYPE_LABEL = { invoice: 'INVOICE', quote: 'QUOTE', credit: 'CREDIT NOTE', statement: 'STATEMENT OF ACCOUNT' };

function metaRows(doc) {
  const rows = [[TYPE_LABEL[doc.type] === 'QUOTE' ? 'Quote #' : 'Number', doc.number || '— (draft)'],
    ['Issue date', doc.issueDate || '']];
  if (doc.type === 'invoice' && doc.dueDate) rows.push(['Due date', doc.dueDate]);
  if (doc.terms) rows.push(['Terms', doc.terms]);
  return rows;
}

function linesTable(doc, totals, ratesById) {
  const showTax = doc.tax?.mode === 'line';
  const head = `<thead><tr>
    <th class="desc">Description</th><th class="num">Qty</th><th class="num">Unit</th>
    <th class="num">Rate</th>${showTax ? '<th class="num">Tax</th>' : ''}<th class="num">Amount</th>
  </tr></thead>`;
  const rows = totals.lines.map(l => `<tr>
    <td class="desc">${esc(l.description)}</td>
    <td class="num">${esc(l.qty)}</td><td class="num">${esc(l.unit)}</td>
    <td class="num">${fmt(l.rateMinor, doc.currency)}</td>
    ${showTax ? `<td class="num">${l.taxRateId ? esc(ratesById.get(l.taxRateId)?.name || '') : ''}</td>` : ''}
    <td class="num">${fmt(l.amountMinor, doc.currency)}</td>
  </tr>`).join('');
  return `<table class="lines">${head}<tbody>${rows}</tbody></table>`;
}

function totalsBlock(doc, totals, ratesById, paid) {
  const c = doc.currency;
  const rows = [];
  rows.push(['Subtotal', fmt(totals.displaySubtotalMinor ?? totals.subtotalMinor, c)]);
  if (totals.discountMinor > 0) rows.push(['Discount', '−' + fmt(totals.discountMinor, c)]);
  for (const [rid, amt] of totals.taxByRate) {
    if (!amt) continue;
    const r = ratesById.get(rid);
    rows.push([r ? r.name : 'Tax', fmt(amt, c)]);
  }
  if (totals.withholdingMinor > 0) {
    rows.push(['Total', fmt(totals.grandTotalMinor, c)]);
    rows.push(['Withholding tax (deducted)', '−' + fmt(totals.withholdingMinor, c)]);
  }
  rows.push(['TOTAL DUE', fmt(totals.totalDueMinor, c)]);
  if (paid > 0) {
    rows.push(['Paid', '−' + fmt(paid, c)]);
    rows.push(['Balance', fmt(totals.totalDueMinor - paid, c)]);
  }
  return `<table class="totals"><tbody>${rows.map(([k, v], i) =>
    `<tr${k === 'TOTAL DUE' || k === 'Balance' ? ' class="grand"' : ''}><td>${esc(k)}</td><td class="num">${esc(v)}</td></tr>`).join('')}</tbody></table>`;
}

/** Blocks for a standard document, fed to the paginator. */
export function docBlocks(store, doc, payments) {
  const tpl = TEMPLATES[store.settings.template] || TEMPLATES.classic;
  const biz = businessOf(store, doc);
  const cli = clientOf(store, doc);
  const totals = docTotals(doc, store.taxRates);
  const ratesById = new Map(store.taxRates.map(r => [r.id, r]));
  const paid = paidMinor(doc, payments);
  const logo = biz.logoDataUrl ? `<img class="logo" src="${biz.logoDataUrl}" alt="">` : '';

  const metaHtml = metaRows(doc).map(([k, v]) => `<div class="mrow"><span class="mk">${esc(k)}</span><span class="mv">${esc(v)}</span></div>`).join('');
  const header = tpl.layout === 'topband'
    ? `<div class="band"></div><div class="head"><div class="bparty">${logo}<h1 class="doctype">${TYPE_LABEL[doc.type] || 'INVOICE'}</h1><div class="bname">${esc(biz.name || '')}</div></div>
       <div class="meta">${metaHtml}</div></div>`
    : tpl.layout === 'metabox'
    ? `<div class="head header-left"><div class="bparty">${logo}<h1 class="doctype">${TYPE_LABEL[doc.type] || 'INVOICE'}</h1><div class="bname">${esc(biz.name || '')}</div><div class="baddr">${esc(biz.address || '').replace(/\n/g, '<br>')}</div></div>
       <div class="meta metabox">${metaHtml}</div></div>`
    : `<div class="head ${tpl.layout}"><div class="bparty">${logo}<h1 class="doctype">${TYPE_LABEL[doc.type] || 'INVOICE'}</h1><div class="bname">${esc(biz.name || '')}</div><div class="baddr">${esc(biz.address || '').replace(/\n/g, '<br>')}</div></div>
       <div class="meta">${metaHtml}</div></div>`;

  const parties = `<div class="parties">
    <div class="billto"><div class="ptag">Bill to</div><div class="pname">${esc(cli.name || 'Client')}</div>
      ${cli.company ? `<div class="pmeta">${esc(cli.company)}</div>` : ''}
      <div class="pmeta">${esc(cli.address || '').replace(/\n/g, '<br>')}</div></div>
    <div class="payto"><div class="ptag">Payment</div><div class="pmeta">${esc(biz.bankDetails || '').replace(/\n/g, '<br>')}</div>
      ${doc.fxRate ? `<div class="pmeta">Rate at issue: ${esc(doc.fxRate)}</div>` : ''}</div>
  </div>`;

  const foot = `<div class="foot">
    ${doc.notes ? `<div class="notes"><div class="ptag">Notes</div><div class="pmeta">${esc(doc.notes).replace(/\n/g, '<br>')}</div></div>` : ''}
    ${biz.taxId ? `<div class="pmeta taxid">Tax ID: ${esc(biz.taxId)}</div>` : ''}
  </div>`;

  return {
    tpl,
    blocks: [
      { key: 'header', html: header, keepWithNext: true },
      { key: 'parties', html: parties, keepWithNext: true },
      { key: 'lines', html: linesTable(doc, totals, ratesById), keepWithNext: true },
      { key: 'totals', html: totalsBlock(doc, totals, ratesById, paid) },
      { key: 'foot', html: foot }
    ]
  };
}

/** Statement of account: every issued doc for one client + running balance. */
export function statementBlocks(store, clientId, payments) {
  const tpl = TEMPLATES.statement;
  const cli = store.clients.find(c => c.id === clientId) || {};
  const biz = store.business[0] || {};
  const docs = store.documents
    .filter(d => d.clientId === clientId && d.type === 'invoice' && d.status !== 'draft' && d.status !== 'void')
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  const c = cli.currency || store.settings.homeCurrency;
  const logo = biz.logoDataUrl ? `<img class="logo" src="${biz.logoDataUrl}" alt="">` : '';

  let running = 0;
  const rows = docs.map(d => {
    const tot = docTotals(d, store.taxRates).totalDueMinor;
    const paid = paidMinor(d, payments);
    running += tot - paid;
    const st = docStatus(d, payments, store.taxRates);
    return `<tr><td>${esc(d.issueDate)}</td><td>${esc(d.number)}</td><td>${esc(st)}${st === 'overdue' ? ` (${daysOverdue(d)}d late)` : ''}</td>
      <td class="num">${fmt(tot, c)}</td><td class="num">${fmt(paid, c)}</td><td class="num">${fmt(running, c)}</td></tr>`;
  }).join('');

  const header = `<div class="head header-left"><div class="bparty">${logo}<h1 class="doctype">STATEMENT OF ACCOUNT</h1><div class="bname">${esc(biz.name || '')}</div><div class="baddr">${esc(biz.address || '').replace(/\n/g, '<br>')}</div></div>
    <div class="meta"><div class="mrow"><span class="mk">Client</span><span class="mv">${esc(cli.name || '')}${cli.company ? ' — ' + esc(cli.company) : ''}</span></div>
    <div class="mrow"><span class="mk">Date</span><span class="mv">${new Date().toISOString().slice(0, 10)}</span></div></div></div>`;

  const table = `<table class="lines"><thead><tr><th class="desc">Date</th><th class="desc">Invoice</th><th class="desc">Status</th>
    <th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead><tbody>${rows}</tbody></table>`;
  const totals = `<table class="totals"><tbody><tr class="grand"><td>Balance outstanding</td><td class="num">${fmt(running, c)}</td></tr></tbody></table>`;

  return { tpl, blocks: [
    { key: 'header', html: header, keepWithNext: true },
    { key: 'lines', html: table, keepWithNext: true },
    { key: 'totals', html: totals }
  ]};
}

export function cssFor(tpl, design = {}) {
  const accent = design.accent || tpl.accent || '#0f172a';
  const band = tpl.layout === 'topband'
    ? `.band{background:${accent};height:18mm;margin:-${tpl.margin}mm -${tpl.margin}mm 8mm -${tpl.margin}mm;}
       .head .doctype{color:${accent};}` : '';
  const variant = `
  ${tpl.dense ? `.head{margin-bottom:5mm;} .parties{margin-bottom:5mm;} .lines th,.lines td{padding:1.4mm 2mm;} .lines{margin-bottom:4mm;} .totals td{padding:1mm 2mm;} .foot{margin-top:5mm;}` : ''}
  ${tpl.ruled ? `.lines th{color:#1e293b;background:transparent;border-top:1.5px solid #1e293b;border-bottom:1.5px solid #1e293b;text-transform:none;letter-spacing:0.02em;} .lines td{border-bottom:1px solid #94a3b8;} .doctype{letter-spacing:0.14em;font-weight:700;} .mk{font-family:"Segoe UI",Arial,sans-serif;} .meta{border:1px solid #94a3b8;padding:3mm;}` : ''}
  ${tpl.layout === 'metabox' ? `.metabox{background:${accent};padding:4mm 5mm;border-radius:2mm;} .metabox .mk{color:#cbd5e1;} .metabox .mv{color:#fff;} .metabox .mrow{border-bottom:0.5px solid rgba(255,255,255,0.15);padding:1mm 0;} .metabox .mrow:last-child{border-bottom:none;}` : ''}
  ${tpl.layout === 'header-center' ? `.head{flex-direction:column;align-items:center;text-align:center;} .head .meta{text-align:center;display:flex;gap:8mm;justify-content:center;} .head .mrow{flex-direction:column;gap:0.5mm;} .doctype{font-style:italic;letter-spacing:0.02em;border-bottom:0.5px solid ${accent};padding-bottom:3mm;} .parties{justify-content:space-around;text-align:center;}` : ''}`;
  return `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  .doc { font-family: ${tpl.font}; font-size: ${tpl.body}; color: #1e293b; }
  .logo { max-height: 16mm; max-width: 50mm; display: block; margin-bottom: 3mm; }
  .doctype { font-size: ${tpl.h1}; letter-spacing: 0.06em; margin: 0 0 2mm; font-weight: ${tpl.light ? 500 : 700}; color: ${accent}; }
  .bname { font-weight: 600; margin-bottom: 1mm; }
  .baddr, .pmeta { color: #64748b; font-size: 11px; line-height: 1.45; }
  .head { display: flex; justify-content: space-between; gap: 10mm; margin-bottom: 8mm; }
  .head .meta { text-align: right; min-width: 55mm; }
  .mrow { display: flex; justify-content: space-between; gap: 6mm; margin-bottom: 1.2mm; }
  .mk { color: #64748b; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; }
  .mv { font-variant-numeric: tabular-nums; font-weight: 500; }
  .parties { display: flex; justify-content: space-between; gap: 10mm; margin-bottom: 8mm; }
  .ptag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: ${accent}; font-weight: 700; margin-bottom: 1.5mm; }
  .pname { font-weight: 600; margin-bottom: 0.5mm; }
  .lines { width: 100%; border-collapse: collapse; margin-bottom: 6mm; }
  .lines th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em;
    color: ${tpl.light ? '#64748b' : '#fff'}; background: ${tpl.light ? 'transparent' : accent};
    border-bottom: ${tpl.light ? '1.5px solid ' + accent : 'none'}; padding: 2.2mm 2mm; }
  .lines td { padding: 2.2mm 2mm; border-bottom: 0.5px solid #e2e8f0; vertical-align: top; }
  .lines .num, .totals .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { margin-left: auto; width: 70mm; border-collapse: collapse; }
  .totals td { padding: 1.6mm 2mm; font-variant-numeric: tabular-nums; }
  .totals .grand td { border-top: 1.5px solid ${accent}; font-weight: 700; color: ${accent}; font-size: 13.5px; }
  .foot { margin-top: 8mm; }
  .notes { max-width: 100mm; }
  .taxid { margin-top: 4mm; }
  ${band}
  ${variant}
  `;
}
