import React, { useMemo, useState } from 'react';
import { docTotals, paidMinor, docStatus, fmt, toMinor, parseAmount, CURRENCIES } from '../lib/money.js';
import { newLine, newPayment, issueDocument, clientOf, businessOf, uid } from '../lib/model.js';
import { docBlocks, cssFor } from '../lib/invoiceHtml.js';
import { measureBlocks, packPages, fitBlocks, contentHeight, contentWidth, A4 } from '../lib/paginate.js';
import { reminderDraft } from '../lib/reminders.js';

export default function DocEditor({ store, doc, update, close }) {
  const [payOpen, setPayOpen] = useState(false);
  const [remTone, setRemTone] = useState('polite');
  const [reminder, setReminder] = useState(null);
  const [pay, setPay] = useState(() => ({ ...newPayment(doc.id) }));

  const totals = useMemo(() => docTotals(doc, store.taxRates), [doc, store.taxRates]);
  const paid = paidMinor(doc, store.payments);
  const bal = totals.totalDueMinor - paid;
  const st = docStatus(doc, store.payments, store.taxRates);
  const payments = store.payments.filter(p => p.documentId === doc.id);

  const { tpl, blocks } = useMemo(() => docBlocks(store, doc, store.payments), [store, doc]);
  const pages = useMemo(() => {
    const cw = contentWidth(tpl), ch = contentHeight(tpl);
    const fit = fitBlocks(blocks, tpl, {}, cw, ch);
    return packPages(fit.blocks, fit.heights, ch);
  }, [blocks, tpl]);

  const mut = (fn) => update(s => fn(s.documents.find(d => d.id === doc.id)));
  const field = (k) => (e) => mut(d => { d[k] = e.target.value; });

  const setLine = (lid, fn) => mut(d => { const l = d.lines.find(x => x.id === lid); if (l) fn(l); });

  const addLine = () => mut(d => d.lines.push(newLine()));
  const useItem = (item) => mut(d => d.lines.push({ ...newLine(), description: item.description, unit: item.unit, rateMinor: item.rateMinor }));

  const addPayment = () => {
    if (!pay.amountMinor || pay.amountMinor <= 0) return alert('Enter an amount');
    update(s => s.payments.push({ ...pay, documentId: doc.id }));
    setPay({ ...newPayment(doc.id) });
    setPayOpen(false);
  };

  const exportPdf = async () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${cssFor(tpl)}</style></head><body>` +
      pages.map(p => `<div class="page" style="width:210mm;height:297mm;padding:${tpl.margin}mm;overflow:hidden;page-break-after:always"><div class="doc">${p.map(b => b.html).join('')}</div></div>`).join('') +
      `</body></html>`;
    await window.api.export.pdf({ html, suggestedName: `${doc.number || doc.type}.pdf` });
  };

  const convertToInvoice = () => update(s => {
    const c = structuredClone(doc);
    c.id = uid(); c.type = 'invoice'; c.number = ''; c.status = 'draft'; c.sentAt = null; c.createdAt = new Date().toISOString();
    s.documents.unshift(c);
  });

  const makeRecurring = () => update(s => {
    s.recurring.push({ id: uid(), documentId: doc.id, intervalMonths: 1, nextDate: doc.issueDate });
  });

  const rem = reminderDraft(store, doc, store.payments, remTone);
  const copyReminder = () => navigator.clipboard?.writeText(`To: ${rem.to}\nSubject: ${rem.subject}\n\n${rem.body}`);

  const disabled = doc.status === 'void';

  return (
    <div className="editor-wrap">
      <div className="editor">
        <div className="etoolbar">
          <button className="btn ghost" onClick={close}>← Documents</button>
          <span className={`pill st-${st}`}>{st}</span>
          <span className="muted">{doc.number || 'unissued draft'}</span>
          <span style={{ flex: 1 }} />
          {doc.status === 'draft' && <button className="btn" onClick={() => update(s => { const d = s.documents.find(x => x.id === doc.id); if (d) issueDocument(s, d); })}>Issue (allocate number)</button>}
          {doc.type === 'quote' && <button className="btn ghost" onClick={convertToInvoice} title="Copy this quote into a new invoice">Convert to invoice</button>}
          {doc.status !== 'draft' && doc.type === 'invoice' && <button className="btn ghost" onClick={() => setPayOpen(v => !v)}>Record payment</button>}
          {doc.status !== 'draft' && doc.type === 'invoice' && st === 'overdue' && <button className="btn ghost" onClick={() => setReminder(rem)}>Reminder</button>}
          {doc.status !== 'draft' && <button className="btn ghost" onClick={makeRecurring} title="Repeat monthly">Make recurring</button>}
          <button className="btn" onClick={exportPdf}>Export PDF</button>
          {doc.status !== 'void' && doc.status !== 'draft' && <button className="btn danger ghost" onClick={() => { if (confirm('Void this document?')) mut(d => { d.status = 'void'; }); }}>Void</button>}
        </div>

        {payOpen && (
          <div className="paybox">
            <div className="frow">
              <label>Date <input className="in" type="date" value={pay.date} onChange={e => setPay({ ...pay, date: e.target.value })} /></label>
              <label>Amount <input className="in" value={pay.amountMinor ? (pay.amountMinor / 100) : ''} placeholder={fmt(bal, doc.currency, { symbol: false })} onChange={e => setPay({ ...pay, amountMinor: parseAmount(e.target.value, doc.currency) ?? pay.amountMinor })} /></label>
              <label>Method <input className="in" value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value })} /></label>
              <label>Reference <input className="in" value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} /></label>
              <label>FX rate <input className="in" value={pay.fxRate} placeholder="received rate" onChange={e => setPay({ ...pay, fxRate: e.target.value })} /></label>
              <button className="btn" onClick={addPayment}>Add</button>
            </div>
            <p className="muted">Balance: {fmt(bal, doc.currency)} — partial payments are fine.</p>
          </div>
        )}

        {reminder && (
          <div className="paybox">
            <div className="frow">
              {['polite', 'firm', 'final'].map(t => <button key={t} className={'chip' + (remTone === t ? ' on' : '')} onClick={() => { setRemTone(t); }}>{t}</button>)}
              <button className="btn small" onClick={copyReminder}>Copy</button>
              <button className="btn small ghost" onClick={() => setReminder(null)}>Close</button>
            </div>
            <div className="muted">To: {rem.to || '(client email missing)'} — Subject: {rem.subject}</div>
            <pre className="reminder">{rem.body}</pre>
          </div>
        )}

        <div className="form">
          <div className="frow">
            <label>Client
              <select className="in" value={doc.clientId} onChange={e => mut(d => { d.clientId = e.target.value; const c = store.clients.find(x => x.id === e.target.value); if (c?.currency) d.currency = c.currency; })} disabled={disabled}>
                <option value="">— choose —</option>
                {store.clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
              </select>
            </label>
            <label>Issue date <input className="in" type="date" value={doc.issueDate} onChange={field('issueDate')} disabled={disabled} /></label>
            <label>Due date <input className="in" type="date" value={doc.dueDate} onChange={field('dueDate')} disabled={disabled} /></label>
            <label>Currency
              <select className="in" value={doc.currency} onChange={field('currency')} disabled={disabled}>
                {Object.keys(CURRENCIES).map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>FX → {store.settings.homeCurrency} <input className="in" value={doc.fxRate} placeholder="rate at issue" onChange={field('fxRate')} disabled={disabled} /></label>
          </div>

          <table className="lines-edit">
            <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Rate ({doc.currency})</th>
              {doc.tax?.mode === 'line' && <th>Tax</th>}<th className="num">Amount</th><th></th></tr></thead>
            <tbody>
              {doc.lines.map(l => (
                <tr key={l.id}>
                  <td><input className="in" value={l.description} onChange={e => setLine(l.id, x => x.description = e.target.value)} disabled={disabled} /></td>
                  <td><input className="in num" type="number" min="0" step="0.5" value={l.qty} onChange={e => setLine(l.id, x => x.qty = Number(e.target.value))} disabled={disabled} /></td>
                  <td><input className="in num" value={l.unit} onChange={e => setLine(l.id, x => x.unit = e.target.value)} disabled={disabled} /></td>
                  <td><input className="in num" value={l.rateMinor / Math.pow(10, 2)} onChange={e => setLine(l.id, x => x.rateMinor = parseAmount(e.target.value, doc.currency) ?? x.rateMinor)} disabled={disabled} /></td>
                  {doc.tax?.mode === 'line' && (
                    <td><select className="in" value={l.taxRateId} onChange={e => setLine(l.id, x => x.taxRateId = e.target.value)} disabled={disabled}>
                      <option value="">—</option>
                      {store.taxRates.map(r => <option key={r.id} value={r.id}>{r.name}{r.withholding ? ' (WHT)' : ''}</option>)}
                    </select></td>)}
                  <td className="num">{fmt(totals.lines.find(t => t.id === l.id)?.amountMinor || 0, doc.currency)}</td>
                  <td><button className="icon" onClick={() => mut(d => d.lines = d.lines.filter(x => x.id !== l.id))} disabled={disabled} aria-label="Remove line">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="frow">
            <button className="btn small ghost" onClick={addLine} disabled={disabled}>+ Line</button>
            {store.items.length > 0 && (
              <select className="in" style={{ maxWidth: 220 }} value="" onChange={e => { const it = store.items.find(i => i.id === e.target.value); if (it) useItem(it); }} disabled={disabled}>
                <option value="">Add saved item…</option>
                {store.items.map(i => <option key={i.id} value={i.id}>{i.description}</option>)}
              </select>
            )}
          </div>

          <div className="frow">
            <label>Discount
              <select className="in" value={doc.discount.mode} onChange={e => mut(d => d.discount.mode = e.target.value)} disabled={disabled}>
                <option value="none">None</option><option value="percent">%</option><option value="amount">Amount</option>
              </select>
            </label>
            {doc.discount.mode === 'percent' && <label>% <input className="in" type="number" value={doc.discount.percent} onChange={e => mut(d => d.discount.percent = Number(e.target.value))} disabled={disabled} /></label>}
            {doc.discount.mode === 'amount' && <label>Amount <input className="in" value={doc.discount.amountMinor / 100} onChange={e => mut(d => d.discount.amountMinor = parseAmount(e.target.value, doc.currency) ?? d.discount.amountMinor)} disabled={disabled} /></label>}
            <label>Tax mode
              <select className="in" value={doc.tax?.mode || 'none'} onChange={e => mut(d => d.tax = { ...d.tax, mode: e.target.value })} disabled={disabled}>
                <option value="none">Not registered / none</option><option value="invoice">Invoice-level</option><option value="line">Per line</option>
              </select>
            </label>
            {doc.tax?.mode === 'invoice' && (
              <label>Tax rate
                <select className="in" value={doc.tax?.rateId || ''} onChange={e => mut(d => d.tax.rateId = e.target.value)} disabled={disabled}>
                  <option value="">—</option>
                  {store.taxRates.map(r => <option key={r.id} value={r.id}>{r.name}{r.withholding ? ' (WHT)' : ''}</option>)}
                </select>
              </label>)}
            {doc.tax?.mode !== 'none' && (
              <label className="chk"><input type="checkbox" checked={!!doc.tax?.inclusive} onChange={e => mut(d => d.tax.inclusive = e.target.checked)} disabled={disabled} /> Prices include tax</label>)}
          </div>

          <div className="frow">
            <label style={{ flex: 1 }}>Terms <input className="in" value={doc.terms} placeholder="e.g. Net 14, bank transfer" onChange={field('terms')} disabled={disabled} /></label>
          </div>
          <div className="frow">
            <label style={{ flex: 1 }}>Notes <textarea className="in" rows="2" value={doc.notes} onChange={field('notes')} disabled={disabled} /></label>
          </div>

          <div className="live-totals">
            <span>Subtotal {fmt(totals.subtotalMinor, doc.currency)}</span>
            {totals.discountMinor > 0 && <span>− {fmt(totals.discountMinor, doc.currency)}</span>}
            {totals.taxTotalMinor > 0 && <span>Tax {fmt(totals.taxTotalMinor, doc.currency)}</span>}
            {totals.withholdingMinor > 0 && <span>WHT −{fmt(totals.withholdingMinor, doc.currency)}</span>}
            <strong>Total {fmt(totals.grandTotalMinor, doc.currency)}</strong>
            <strong className="due">Due {fmt(totals.totalDueMinor, doc.currency)}</strong>
            {paid > 0 && <span>Paid {fmt(paid, doc.currency)} · Balance {fmt(bal, doc.currency)}</span>}
          </div>

          {payments.length > 0 && (
            <table className="grid" style={{ marginTop: 8 }}>
              <thead><tr><th>Payment</th><th>Date</th><th>Method</th><th>Ref</th><th>FX</th><th className="num">Amount</th><th></th></tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td className="muted">#{p.id.slice(-4)}</td><td>{p.date}</td><td>{p.method}</td><td>{p.reference}</td><td>{p.fxRate}</td>
                    <td className="num">{fmt(p.amountMinor, doc.currency)}</td>
                    <td><button className="icon" onClick={() => update(s => s.payments = s.payments.filter(x => x.id !== p.id))} aria-label="Delete payment">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="preview">
        <div className="pcount">{pages.length} page{pages.length === 1 ? '' : 's'}</div>
        <style>{cssFor(tpl)}</style>
        {pages.map((p, i) => (
          <div className="page" key={i} style={{ padding: `${tpl.margin}mm` }}>
            <div className="doc" dangerouslySetInnerHTML={{ __html: p.map(b => b.html).join('') }} />
          </div>
        ))}
      </div>
    </div>
  );
}
