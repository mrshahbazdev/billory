/**
 * Store schema — one JSON document, written atomically by the main
 * process (electron/ipc/store.cjs) with timestamped snapshots. All
 * money is minor units; see money.js.
 */
import { toMinor } from './money.js';

export const STORE_VERSION = 1;

export function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function emptyStore() {
  return {
    version: STORE_VERSION,
    business: [],      // {id,name,logoDataUrl,address,taxId,bankDetails,currency}
    clients: [],       // {id,name,company,email,address,currency,rateMinor,termsDays,taxTreatment,notes}
    items: [],         // {id,description,unit,rateMinor}
    documents: [],     // see newDocument()
    payments: [],      // {id,documentId,date,amountMinor,currency,method,reference,fxRate}
    recurring: [],     // {id,documentId? fields copied,intervalMonths,nextDate,endDate}
    timeentries: [],   // {id,clientId,date,description,hours,rateMinor,documentId}
    taxRates: [],      // {id,name,percent,withholding}
    numbering: { format: 'INV-{YYYY}-{NNNN}', perYear: true, perClient: false, next: 1, used: [] },
    settings: {
      homeCurrency: 'PKR',
      template: 'classic',
      accent: '#0f172a',
      firstRunDone: false
    },
    meta: { createdAt: new Date().toISOString() }
  };
}

export function newBusiness() {
  return { id: uid(), name: '', logoDataUrl: '', address: '', taxId: '', bankDetails: '', currency: 'USD' };
}

export function newClient() {
  return { id: uid(), name: '', company: '', email: '', address: '', currency: 'USD', rateMinor: 0, termsDays: 14, taxTreatment: 'none', notes: '' };
}

export function newLine() {
  return { id: uid(), description: '', qty: 1, unit: 'item', rateMinor: 0, taxRateId: '' };
}

export function newDocument(type = 'invoice') {
  return {
    id: uid(),
    type,                     // 'invoice' | 'quote' | 'credit'
    number: '',               // allocated on issue (status draft → sent)
    clientId: '',
    businessId: '',
    issueDate: todayISO(),
    dueDate: '',
    currency: 'USD',
    fxRate: '',               // units of home currency per 1 doc currency, at issue
    lines: [newLine()],
    discount: { mode: 'none', amountMinor: 0, percent: 0 },
    tax: { mode: 'none', inclusive: false, rateId: '' },
    notes: '',
    terms: '',
    status: 'draft',          // draft|sent|partial|paid|overdue|void (effective status is derived)
    sentAt: null,
    quoteAccepted: false,
    createdAt: new Date().toISOString()
  };
}

export function newPayment(documentId) {
  return { id: uid(), documentId, date: todayISO(), amountMinor: 0, currency: '', method: 'bank transfer', reference: '', fxRate: '' };
}

export function newTimeEntry(clientId) {
  return { id: uid(), clientId: clientId || '', date: todayISO(), description: '', hours: 1, rateMinor: 0, documentId: '' };
}

/**
 * Allocate the next invoice/quote number — on ISSUE, not on draft, so
 * abandoned drafts leave no gaps in the sequence.
 */
export function allocateNumber(store, doc) {
  const n = store.numbering;
  const year = (doc.issueDate || todayISO()).slice(0, 4);
  const seqKey = n.perClient && doc.clientId ? `${year}:${doc.clientId}` : year;
  const seq = n.sequences || (n.sequences = {});
  const next = seq[seqKey] || 1;
  seq[seqKey] = next + 1;
  return n.format
    .replace('{YYYY}', year)
    .replace('{NNNN}', String(next).padStart(4, '0'))
    .replace('{NN}', String(next).padStart(2, '0'));
}

/** Mark a draft document as issued: number + sentAt + status. */
export function issueDocument(store, doc) {
  if (!doc.number) doc.number = allocateNumber(store, doc);
  doc.status = 'sent';
  doc.sentAt = new Date().toISOString();
  return doc;
}

export function clientOf(store, doc) {
  return store.clients.find(c => c.id === doc.clientId) || {};
}

export function businessOf(store, doc) {
  return store.business.find(b => b.id === doc.businessId) || store.business[0] || {};
}

/** Sample data so the first screen a reviewer sees is never empty. */
export function sampleStore() {
  const s = emptyStore();
  const biz = { ...newBusiness(), name: 'Muhammad Shahbaz', address: 'Lahore, Pakistan', taxId: '', bankDetails: 'Payoneer • USD receiving account', currency: 'USD' };
  s.business.push(biz);
  s.taxRates.push(
    { id: 'vat20', name: 'VAT 20%', percent: 20, withholding: false },
    { id: 'wht10', name: 'Withholding 10%', percent: 10, withholding: true }
  );
  const c1 = { ...newClient(), name: 'Oliver Grant', company: 'Brightside Studio', email: 'oliver@brightside.studio', address: 'London, UK', currency: 'GBP', termsDays: 14 };
  const c2 = { ...newClient(), name: 'Ayesha Khan', company: 'Khan & Co', email: 'ayesha@khan.co', address: 'Karachi, Pakistan', currency: 'PKR', termsDays: 30 };
  s.clients.push(c1, c2);
  s.items.push(
    { id: uid(), description: 'Web development', unit: 'hour', rateMinor: toMinor(25, 'USD') },
    { id: uid(), description: 'UI design', unit: 'day', rateMinor: toMinor(180, 'USD') }
  );

  const d = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const inv1 = { ...newDocument('invoice'), clientId: c1.id, businessId: biz.id, currency: 'GBP', issueDate: d(-40), dueDate: d(-12), fxRate: '352',
    lines: [{ ...newLine(), description: 'Landing page build', qty: 1, unit: 'project', rateMinor: toMinor(1200, 'GBP') }] };
  const inv2 = { ...newDocument('invoice'), clientId: c1.id, businessId: biz.id, currency: 'GBP', issueDate: d(-20), dueDate: d(8), fxRate: '350',
    lines: [{ ...newLine(), description: 'Monthly maintenance', qty: 1, unit: 'month', rateMinor: toMinor(600, 'GBP') }] };
  const inv3 = { ...newDocument('invoice'), clientId: c2.id, businessId: biz.id, currency: 'PKR', issueDate: d(-9), dueDate: d(21), fxRate: '1',
    lines: [{ ...newLine(), description: 'Logo + brand kit', qty: 1, unit: 'project', rateMinor: toMinor(150000, 'PKR') }] };
  [inv1, inv2, inv3].forEach(doc => issueDocument(s, doc));
  s.documents.push(inv1, inv2, inv3);
  s.payments.push({ ...newPayment(inv1.id), date: d(-10), amountMinor: toMinor(400, 'GBP'), currency: 'GBP', method: 'Payoneer', reference: 'PO-7841', fxRate: '355' });
  s.settings.firstRunDone = false;
  return s;
}
