import React, { useState } from 'react';
import { newTimeEntry, newDocument, newLine, uid } from '../lib/model.js';
import { fmt, toMinor, parseAmount } from '../lib/money.js';

export default function TimePanel({ store, update, openDoc }) {
  const [filterClient, setFilterClient] = useState('');

  const addEntry = () => update(s => s.timeentries.unshift(newTimeEntry(filterClient)));
  const mut = (id, fn) => update(s => { const t = s.timeentries.find(x => x.id === id); if (t) fn(t); });

  const entries = store.timeentries
    .filter(t => !filterClient || t.clientId === filterClient)
    .sort((a, b) => b.date.localeCompare(a.date));

  const unbilled = entries.filter(t => !t.documentId);
  const unbilledHours = unbilled.reduce((s, t) => s + (Number(t.hours) || 0), 0);

  /** Roll unbilled entries for one client into a new draft invoice line. */
  const billClient = (clientId) => {
    const list = store.timeentries.filter(t => t.clientId === clientId && !t.documentId);
    if (!list.length) return;
    const doc = newDocument('invoice');
    doc.clientId = clientId;
    doc.businessId = store.business[0]?.id || '';
    const cli = store.clients.find(c => c.id === clientId);
    if (cli?.currency) doc.currency = cli.currency;
    doc.lines = list.map(t => ({ ...newLine(), description: `${t.description} (${t.date})`, qty: t.hours, unit: 'hour', rateMinor: t.rateMinor }));
    update(s => {
      s.documents.unshift(doc);
      for (const t of list) s.timeentries.find(x => x.id === t.id).documentId = doc.id;
    });
    openDoc(doc.id);
  };

  return (
    <div className="panel">
      <div className="toolbar">
        <select className="in" style={{ maxWidth: 220 }} value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">All clients</option>
          {store.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn small" onClick={addEntry}>+ Entry</button>
        <span style={{ flex: 1 }} />
        {filterClient && unbilled.length > 0 && (
          <button className="btn small" onClick={() => billClient(filterClient)}>
            Invoice {unbilledHours.toFixed(2)} unbilled hours
          </button>
        )}
      </div>
      <table className="grid">
        <thead><tr><th>Date</th><th>Client</th><th>Description</th><th className="num">Hours</th><th className="num">Rate</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {entries.map(t => (
            <tr key={t.id}>
              <td><input className="in" type="date" value={t.date} onChange={e => mut(t.id, x => x.date = e.target.value)} /></td>
              <td>
                <select className="in" value={t.clientId} onChange={e => mut(t.id, x => x.clientId = e.target.value)}>
                  <option value="">—</option>
                  {store.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </td>
              <td><input className="in" value={t.description} onChange={e => mut(t.id, x => x.description = e.target.value)} /></td>
              <td><input className="in num" type="number" step="0.25" min="0" value={t.hours} onChange={e => mut(t.id, x => x.hours = Number(e.target.value))} /></td>
              <td><input className="in num" value={t.rateMinor / 100} onChange={e => mut(t.id, x => x.rateMinor = parseAmount(e.target.value, 'USD') ?? x.rateMinor)} /></td>
              <td>{t.documentId ? <span className="pill st-sent">invoiced</span> : <span className="pill st-draft">unbilled</span>}</td>
              <td><button className="icon" onClick={() => update(s => s.timeentries = s.timeentries.filter(x => x.id !== t.id))} aria-label="Delete entry">✕</button></td>
            </tr>
          ))}
          {entries.length === 0 && <tr><td colSpan="7" className="muted" style={{ padding: 16 }}>No time entries yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
