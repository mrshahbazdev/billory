/** CSV export of the whole store — financial records, so flat and complete. */
import { docTotals, paidMinor, docStatus, toMajor } from './money.js';
import { clientOf } from './model.js';

function cell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const row = (arr) => arr.map(cell).join(',');

export function exportCsv(store, payments) {
  const out = [];
  out.push('# Billory export — ' + new Date().toISOString().slice(0, 10));

  out.push('');
  out.push('[documents]');
  out.push(row(['type', 'number', 'client', 'issue_date', 'due_date', 'currency',
    'subtotal', 'discount', 'tax', 'withholding', 'total_due', 'paid', 'balance', 'status', 'fx_rate']));
  for (const d of store.documents) {
    const t = docTotals(d, store.taxRates);
    const paid = paidMinor(d, payments);
    out.push(row([d.type, d.number, clientOf(store, d).name, d.issueDate, d.dueDate, d.currency,
      toMajor(t.subtotalMinor, d.currency), toMajor(t.discountMinor, d.currency),
      toMajor(t.taxTotalMinor, d.currency), toMajor(t.withholdingMinor, d.currency),
      toMajor(t.totalDueMinor, d.currency), toMajor(paid, d.currency),
      toMajor(t.totalDueMinor - paid, d.currency), docStatus(d, payments, store.taxRates), d.fxRate]));
  }

  out.push('');
  out.push('[payments]');
  out.push(row(['document', 'date', 'amount', 'currency', 'method', 'reference', 'fx_rate']));
  for (const p of payments) {
    const d = store.documents.find(x => x.id === p.documentId);
    out.push(row([d ? d.number : '', p.date, toMajor(p.amountMinor, d?.currency || 'USD'),
      p.currency || d?.currency || '', p.method, p.reference, p.fxRate]));
  }

  out.push('');
  out.push('[clients]');
  out.push(row(['name', 'company', 'email', 'currency', 'terms_days', 'address', 'notes']));
  for (const c of store.clients) {
    out.push(row([c.name, c.company, c.email, c.currency, c.termsDays, (c.address || '').replace(/\n/g, ' '), c.notes]));
  }

  out.push('');
  out.push('[time_entries]');
  out.push(row(['client', 'date', 'description', 'hours', 'rate', 'invoiced']));
  for (const t of store.timeentries) {
    const c = store.clients.find(x => x.id === t.clientId);
    out.push(row([c?.name || '', t.date, t.description, t.hours, toMajor(t.rateMinor, 'USD'), t.documentId ? 'yes' : 'no']));
  }

  return out.join('\n');
}
