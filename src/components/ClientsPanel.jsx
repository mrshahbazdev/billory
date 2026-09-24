import React, { useState, useMemo } from 'react';
import { CURRENCIES, toMinor, fmt } from '../lib/money.js';
import { newClient } from '../lib/model.js';
import { statementBlocks, cssFor } from '../lib/invoiceHtml.js';
import { measureBlocks, packPages, fitBlocks, contentHeight, contentWidth } from '../lib/paginate.js';

export default function ClientsPanel({ store, update }) {
  const [section, setSection] = useState('clients');

  const addClient = () => update(s => s.clients.push(newClient()));
  const addItem = () => update(s => s.items.push({ id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), description: '', unit: 'hour', rateMinor: 0 }));

  const mutClient = (id, fn) => update(s => { const c = s.clients.find(x => x.id === id); if (c) fn(c); });
  const mutItem = (id, fn) => update(s => { const i = s.items.find(x => x.id === id); if (i) fn(i); });

  const exportStatement = async (clientId) => {
    const { tpl, blocks } = statementBlocks(store, clientId, store.payments);
    const cw = contentWidth(tpl), ch = contentHeight(tpl);
    const fit = fitBlocks(blocks, tpl, {}, cw, ch);
    const pages = packPages(fit.blocks, fit.heights, ch);
    const cli = store.clients.find(c => c.id === clientId);
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${cssFor(tpl)}</style></head><body>` +
      pages.map(p => `<div class="page" style="width:210mm;height:297mm;padding:${tpl.margin}mm;overflow:hidden;page-break-after:always"><div class="doc">${p.map(b => b.html).join('')}</div></div>`).join('') +
      `</body></html>`;
    await window.api.export.pdf({ html, suggestedName: `statement-${(cli?.name || 'client').replace(/\s+/g, '-')}.pdf` });
  };

  return (
    <div className="panel">
      <div className="filters">
        {['clients', 'items', 'recurring'].map(x => <button key={x} className={'chip' + (section === x ? ' on' : '')} onClick={() => setSection(x)}>{x}</button>)}
        <span style={{ flex: 1 }} />
        {section === 'clients' && <button className="btn small" onClick={addClient}>+ Client</button>}
        {section === 'items' && <button className="btn small" onClick={addItem}>+ Item</button>}
      </div>

      {section === 'clients' && (
        <div className="cards2">
          {store.clients.map(c => {
            const nDocs = store.documents.filter(d => d.clientId === c.id).length;
            return (
              <div className="card wide" key={c.id}>
                <div className="frow">
                  <input className="in" value={c.name} placeholder="Name" onChange={e => mutClient(c.id, x => x.name = e.target.value)} />
                  <input className="in" value={c.company} placeholder="Company" onChange={e => mutClient(c.id, x => x.company = e.target.value)} />
                  <input className="in" value={c.email} placeholder="Email" onChange={e => mutClient(c.id, x => x.email = e.target.value)} />
                </div>
                <div className="frow">
                  <input className="in" value={c.address} placeholder="Address" onChange={e => mutClient(c.id, x => x.address = e.target.value)} />
                  <label className="lbl">Currency
                    <select className="in" value={c.currency} onChange={e => mutClient(c.id, x => x.currency = e.target.value)}>
                      {Object.keys(CURRENCIES).map(k => <option key={k}>{k}</option>)}
                    </select></label>
                  <label className="lbl">Terms (days)
                    <input className="in" type="number" value={c.termsDays} onChange={e => mutClient(c.id, x => x.termsDays = Number(e.target.value))} /></label>
                </div>
                <div className="frow">
                  <input className="in" value={c.notes} placeholder="Notes" onChange={e => mutClient(c.id, x => x.notes = e.target.value)} />
                  <button className="btn small ghost" onClick={() => exportStatement(c.id)} title="Statement of account PDF">Statement PDF</button>
                  <button className="icon" onClick={() => { if (confirm('Delete client?')) update(s => s.clients = s.clients.filter(x => x.id !== c.id)); }} aria-label="Delete client">✕</button>
                </div>
                <div className="muted">{nDocs} document{nDocs === 1 ? '' : 's'}</div>
              </div>
            );
          })}
          {store.clients.length === 0 && <p className="muted">No clients yet.</p>}
        </div>
      )}

      {section === 'items' && (
        <table className="grid">
          <thead><tr><th>Saved service / item</th><th>Unit</th><th className="num">Default rate</th><th></th></tr></thead>
          <tbody>
            {store.items.map(i => (
              <tr key={i.id}>
                <td><input className="in" value={i.description} onChange={e => mutItem(i.id, x => x.description = e.target.value)} /></td>
                <td><input className="in" value={i.unit} onChange={e => mutItem(i.id, x => x.unit = e.target.value)} /></td>
                <td><input className="in num" value={i.rateMinor / 100} onChange={e => mutItem(i.id, x => x.rateMinor = toMinor(e.target.value, 'USD'))} /></td>
                <td><button className="icon" onClick={() => update(s => s.items = s.items.filter(x => x.id !== i.id))} aria-label="Delete item">✕</button></td>
              </tr>
            ))}
            {store.items.length === 0 && <tr><td colSpan="4" className="muted" style={{ padding: 16 }}>No saved items — add reusable services with a default rate.</td></tr>}
          </tbody>
        </table>
      )}

      {section === 'recurring' && (
        <table className="grid">
          <thead><tr><th>Source</th><th>Every</th><th>Next date</th><th>End</th><th></th></tr></thead>
          <tbody>
            {store.recurring.map(r => {
              const src = store.documents.find(d => d.id === r.documentId);
              return (
                <tr key={r.id}>
                  <td>{src?.number || '(draft)'}</td>
                  <td>
                    <select className="in" value={r.intervalMonths} onChange={e => update(s => { s.recurring.find(x => x.id === r.id).intervalMonths = Number(e.target.value); })}>
                      <option value={1}>month</option><option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>year</option>
                    </select>
                  </td>
                  <td><input className="in" type="date" value={r.nextDate} onChange={e => update(s => { s.recurring.find(x => x.id === r.id).nextDate = e.target.value; })} /></td>
                  <td><input className="in" type="date" value={r.endDate || ''} onChange={e => update(s => { s.recurring.find(x => x.id === r.id).endDate = e.target.value; })} /></td>
                  <td><button className="icon" onClick={() => update(s => s.recurring = s.recurring.filter(x => x.id !== r.id))} aria-label="Remove">✕</button></td>
                </tr>
              );
            })}
            {store.recurring.length === 0 && <tr><td colSpan="5" className="muted" style={{ padding: 16 }}>No recurring invoices — open an invoice and press "Make recurring".</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
