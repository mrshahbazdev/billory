import React from 'react';
import { docTotals, paidMinor, docStatus, daysOverdue, fmt, toMinor } from '../lib/money.js';
import { clientOf, todayISO, newDocument, newPayment, uid } from '../lib/model.js';

function inThisMonth(dateStr) {
  const now = new Date();
  return dateStr && dateStr.slice(0, 7) === now.toISOString().slice(0, 7);
}

/** Convert an amount in doc currency to home currency via its fx rate, else 1:1. */
function toHome(minor, doc, home) {
  if (doc.currency === home) return { minor, approx: false };
  const r = Number(doc.fxRate);
  if (!r) return { minor: null, approx: true };
  return { minor: Math.round(minor * r), approx: true };
}

export default function Dashboard({ store, update, openDoc }) {
  const home = store.settings.homeCurrency;
  const payments = store.payments;

  let outstanding = 0, overdue = 0, paidThisMonth = 0;
  let unknownFx = 0;
  const issued = store.documents.filter(d => d.status !== 'draft' && d.status !== 'void');

  for (const d of issued) {
    const t = docTotals(d, store.taxRates);
    const paid = paidMinor(d, payments);
    const bal = t.totalDueMinor - paid;
    const h = toHome(bal, d, home);
    if (h.minor == null) unknownFx++;
    else outstanding += h.minor;
    const st = docStatus(d, payments, store.taxRates);
    if (st === 'overdue' || st === 'partial') {
      if (st === 'overdue' && h.minor != null) overdue += h.minor;
    }
  }
  for (const p of payments) {
    const d = store.documents.find(x => x.id === p.documentId);
    if (!d || !inThisMonth(p.date)) continue;
    const h = toHome(p.amountMinor, { ...d, fxRate: p.fxRate || d.fxRate }, home);
    if (h.minor != null) paidThisMonth += h.minor;
  }

  const rows = issued
    .map(d => ({ d, st: docStatus(d, payments, store.taxRates), bal: docTotals(d, store.taxRates).totalDueMinor - paidMinor(d, payments) }))
    .filter(r => r.bal > 0 || r.st === 'overdue' || r.st === 'partial')
    .sort((a, b) => {
      const rank = s => s === 'overdue' ? 0 : s === 'partial' ? 1 : 2;
      if (rank(a.st) !== rank(b.st)) return rank(a.st) - rank(b.st);
      return daysOverdue(b.d) - daysOverdue(a.d);
    });

  // Recurring docs due — offer to prepare the next draft.
  const dueRecurring = store.recurring.filter(r => !r.endDate || r.nextDate <= todayISO()).filter(r => r.nextDate <= todayISO());

  const prepareRecurring = (rid) => update(s => {
    const r = s.recurring.find(x => x.id === rid);
    if (!r) return;
    const src = s.documents.find(x => x.id === r.documentId);
    if (!src) return;
    const doc = { ...structuredClone(src), id: uid(), number: '', status: 'draft', sentAt: null, createdAt: new Date().toISOString() };
    doc.issueDate = r.nextDate;
    if (doc.dueDate && src.dueDate) {
      const gap = (new Date(src.dueDate) - new Date(src.issueDate)) / 86400000;
      doc.dueDate = new Date(new Date(r.nextDate).getTime() + gap * 86400000).toISOString().slice(0, 10);
    }
    doc.lines = doc.lines.map(l => ({ ...l, id: uid() }));
    s.documents.unshift(doc);
    const next = new Date(r.nextDate + 'T00:00:00');
    next.setMonth(next.getMonth() + (r.intervalMonths || 1));
    r.nextDate = next.toISOString().slice(0, 10);
  });

  const quickPay = (d) => {
    const bal = docTotals(d, store.taxRates).totalDueMinor - paidMinor(d, payments);
    update(s => s.payments.push({ ...newPayment(d.id), amountMinor: bal, currency: d.currency }));
  };

  return (
    <div className="panel">
      <div className="cards">
        <div className="card">
          <div className="clabel">Outstanding</div>
          <div className="cval">{fmt(outstanding, home)}</div>
          <div className="csub">{rows.length} invoice{rows.length === 1 ? '' : 's'}{unknownFx ? ' (some missing FX rate — add it on the invoice)' : ''}</div>
        </div>
        <div className="card danger">
          <div className="clabel">Overdue</div>
          <div className="cval">{fmt(overdue, home)}</div>
          <div className="csub">{rows.filter(r => r.st === 'overdue').length} overdue</div>
        </div>
        <div className="card ok">
          <div className="clabel">Paid this month</div>
          <div className="cval">{fmt(paidThisMonth, home)}</div>
          <div className="csub">{home}</div>
        </div>
      </div>

      {dueRecurring.length > 0 && (
        <div className="note">
          <strong>Recurring due:</strong>
          {dueRecurring.map(r => {
            const src = store.documents.find(x => x.id === r.documentId);
            return <button key={r.id} className="btn small" style={{ marginLeft: 8 }} onClick={() => prepareRecurring(r.id)}>
              Prepare {src?.number || 'invoice'} for {r.nextDate}
            </button>;
          })}
        </div>
      )}

      <h2 className="ptitle">Who owes you</h2>
      {rows.length === 0 && <p className="muted">Nothing outstanding — every issued invoice is paid.</p>}
      <table className="grid">
        <thead><tr><th>Invoice</th><th>Client</th><th>Due</th><th>Status</th><th className="num">Balance</th><th></th></tr></thead>
        <tbody>
          {rows.map(({ d, st, bal }) => (
            <tr key={d.id} className={st === 'overdue' ? 'row-overdue' : ''}>
              <td><a onClick={() => openDoc(d.id)} className="link">{d.number || '(draft)'}</a></td>
              <td>{clientOf(store, d).name}</td>
              <td>{d.dueDate}{st === 'overdue' ? <span className="late"> {daysOverdue(d)}d late</span> : ''}</td>
              <td><span className={`pill st-${st}`}>{st}</span></td>
              <td className="num">{fmt(bal, d.currency)}</td>
              <td><button className="btn small" onClick={() => quickPay(d)} title="Record a payment for the full balance">Mark paid</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
