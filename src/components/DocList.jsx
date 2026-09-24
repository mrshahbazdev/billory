import React, { useState } from 'react';
import { docTotals, paidMinor, docStatus, daysOverdue, fmt } from '../lib/money.js';
import { clientOf, issueDocument } from '../lib/model.js';

const FILTERS = ['all', 'draft', 'sent', 'partial', 'overdue', 'paid', 'void', 'quote', 'credit'];

export default function DocList({ store, update, openDoc, makeDoc }) {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  const rows = store.documents
    .map(d => ({ d, st: docStatus(d, store.payments, store.taxRates) }))
    .filter(({ d, st }) => {
      if (filter !== 'all') {
        if (['quote', 'credit'].includes(filter)) return d.type === filter;
        return st === filter;
      }
      return true;
    })
    .filter(({ d }) => !q || (d.number + ' ' + clientOf(store, d).name + ' ' + (clientOf(store, d).company || '')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.d.issueDate || '').localeCompare(a.d.issueDate || ''));

  const del = (id) => {
    if (!confirm('Delete this document? (a snapshot is taken first)')) return;
    window.api.store.snapshot(store, 'before delete');
    update(s => { s.documents = s.documents.filter(d => d.id !== id); s.payments = s.payments.filter(p => p.documentId !== id); });
  };

  const duplicate = (d) => update(s => {
    const c = structuredClone(d);
    c.id = 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    c.number = ''; c.status = 'draft'; c.sentAt = null; c.createdAt = new Date().toISOString();
    c.lines = c.lines.map(l => ({ ...l, id: Math.random().toString(36).slice(2, 10) }));
    s.documents.unshift(c);
  });

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="filters">
          {FILTERS.map(f => <button key={f} className={'chip' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>{f}</button>)}
        </div>
        <input className="in" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 200 }} />
      </div>
      <table className="grid">
        <thead><tr><th>Doc</th><th>Client</th><th>Issued</th><th>Due</th><th>Status</th><th className="num">Total</th><th className="num">Balance</th><th></th></tr></thead>
        <tbody>
          {rows.map(({ d, st }) => {
            const t = docTotals(d, store.taxRates);
            const bal = t.totalDueMinor - paidMinor(d, store.payments);
            return (
              <tr key={d.id} className={st === 'overdue' ? 'row-overdue' : ''}>
                <td><a className="link" onClick={() => openDoc(d.id)}>{d.number || `(${d.type} draft)`}</a>
                  <span className="muted"> {d.type === 'quote' ? '· quote' : d.type === 'credit' ? '· credit' : ''}</span></td>
                <td>{clientOf(store, d).name}</td>
                <td>{d.issueDate}</td>
                <td>{d.dueDate}{st === 'overdue' ? <span className="late"> {daysOverdue(d)}d late</span> : ''}</td>
                <td><span className={`pill st-${st}`}>{st}</span></td>
                <td className="num">{fmt(t.totalDueMinor, d.currency)}</td>
                <td className="num">{fmt(bal, d.currency)}</td>
                <td className="acts">
                  {d.status === 'draft' && <button className="btn small" onClick={() => update(s => issueDocument(s, s.documents.find(x => x.id === d.id)))} title="Allocate a number and mark as sent">Issue</button>}
                  <button className="icon" onClick={() => duplicate(d)} title="Duplicate">⧉</button>
                  <button className="icon" onClick={() => del(d.id)} title="Delete">✕</button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan="8" className="muted" style={{ padding: 24, textAlign: 'center' }}>No documents — create one with + Invoice or + Quote.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
