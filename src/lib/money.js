/**
 * Money arithmetic. All amounts are stored as minor units (integers in
 * the currency's smallest denomination — paisa, cents, pence). Nothing
 * goes through floats until display, so rounding never drifts.
 */

export const CURRENCIES = {
  PKR: { name: 'Pakistani Rupee', decimals: 2, symbol: 'Rs' },
  USD: { name: 'US Dollar', decimals: 2, symbol: '$' },
  GBP: { name: 'British Pound', decimals: 2, symbol: '£' },
  EUR: { name: 'Euro', decimals: 2, symbol: '€' },
  AED: { name: 'UAE Dirham', decimals: 2, symbol: 'د.إ' },
  SAR: { name: 'Saudi Riyal', decimals: 2, symbol: '﷼' },
  INR: { name: 'Indian Rupee', decimals: 2, symbol: '₹' },
  BDT: { name: 'Bangladeshi Taka', decimals: 2, symbol: '৳' },
  NGN: { name: 'Nigerian Naira', decimals: 2, symbol: '₦' },
  CAD: { name: 'Canadian Dollar', decimals: 2, symbol: 'C$' },
  AUD: { name: 'Australian Dollar', decimals: 2, symbol: 'A$' },
  CNY: { name: 'Chinese Yuan', decimals: 2, symbol: '¥' }
};

export function decimalsOf(code) {
  return (CURRENCIES[code] || {}).decimals ?? 2;
}

/** Minor units per major unit (e.g. 100 for USD, 1 for JPY). */
export function minorUnit(code) {
  return Math.pow(10, decimalsOf(code));
}

/** major → minor, as an integer. */
export function toMinor(major, code) {
  const n = Number(major);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * minorUnit(code));
}

/** minor → major number. */
export function toMajor(minor, code) {
  return minor / minorUnit(code);
}

/** "1,234.50" for display, with the currency symbol. */
export function fmt(minor, code, { symbol = true } = {}) {
  const d = decimalsOf(code);
  const major = toMajor(minor, code);
  const text = major.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sym = (CURRENCIES[code] || {}).symbol || code;
  return symbol ? `${sym} ${text}` : text;
}

/** Parse a user-typed string ("1,234.50") to minor units. Returns null on garbage. */
export function parseAmount(text, code) {
  if (text == null) return null;
  const n = Number(String(text).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * minorUnit(code));
}

/** Round half-up to the nearest minor unit. */
function roundMinor(units) {
  return units >= 0 ? Math.floor(units + 0.5) : Math.ceil(units - 0.5);
}

/**
 * Compute every total for a document, in the document's currency.
 *
 * doc.lines[]:  { description, qty, unit, rateMinor, taxRateId }
 * doc.discount: { mode: 'none'|'amount'|'percent', amountMinor, percent }
 * doc.tax:      { mode: 'none'|'line'|'invoice', inclusive: bool }
 * taxRates[]:   { id, name, percent, withholding: bool }
 *
 * Withholding tax is a deduction (money the client withholds), shown
 * separately — it reduces the amount the client pays out, not the total due.
 */
export function docTotals(doc, taxRates) {
  const rates = new Map(taxRates.map(r => [r.id, r]));
  const lines = doc.lines || [];
  const taxMode = doc.tax?.mode || 'none';
  const inclusive = !!doc.tax?.inclusive;

  let subtotal = 0;        // sum of qty*rate, tax-exclusive
  let taxByRate = new Map(); // rateId → minor
  let withholding = 0;
  const outLines = lines.map(l => {
    const qty = Number(l.qty) || 0;
    const amount = roundMinor(qty * (l.rateMinor || 0));
    const rate = rates.get(l.taxRateId);
    let lineTax = 0;
    let net = amount;
    if (rate && taxMode === 'line') {
      const pct = rate.percent || 0;
      if (rate.withholding) {
        const wh = roundMinor(amount * pct / 100);
        withholding += wh;
        net = amount - wh;
      } else if (inclusive) {
        lineTax = roundMinor(amount * pct / (100 + pct));
      } else {
        lineTax = roundMinor(amount * pct / 100);
      }
      taxByRate.set(rate.id, (taxByRate.get(rate.id) || 0) + lineTax);
    }
    subtotal += amount;
    return { ...l, amountMinor: amount, taxMinor: lineTax, netMinor: net };
  });

  // Discount applies to the tax-exclusive subtotal before invoice-level tax.
  let discount = 0;
  const d = doc.discount || {};
  if (d.mode === 'amount') discount = Math.max(0, Math.min(d.amountMinor || 0, subtotal));
  else if (d.mode === 'percent') discount = roundMinor(subtotal * (Number(d.percent) || 0) / 100);

  const discounted = subtotal - discount;

  // Invoice-level tax applies on the discounted base, proportionally per rate
  // (kept simple: invoice mode uses a single selected rate on the whole doc).
  if (taxMode === 'invoice') {
    const rate = rates.get(doc.tax?.rateId);
    if (rate && !rate.withholding) {
      const pct = rate.percent || 0;
      const t = inclusive ? roundMinor(discounted * pct / (100 + pct))
                          : roundMinor(discounted * pct / 100);
      taxByRate.set(rate.id, t);
    } else if (rate && rate.withholding) {
      withholding = roundMinor(discounted * (rate.percent || 0) / 100);
    }
  }

  const taxTotal = [...taxByRate.values()].reduce((a, b) => a + b, 0);
  // In inclusive mode the tax is already inside the line amounts.
  const grandTotal = inclusive ? discounted : discounted + taxTotal;

  const due = grandTotal - withholding;

  return {
    lines: outLines,
    subtotalMinor: subtotal,
    discountMinor: discount,
    taxByRate,          // Map<rateId, minor>
    taxTotalMinor: taxTotal,
    withholdingMinor: withholding,
    grandTotalMinor: grandTotal, // what the service is worth
    totalDueMinor: due           // what the client actually pays (after WHT deduction)
  };
}

/** Sum of payments recorded against a document. */
export function paidMinor(doc, payments) {
  return (payments || [])
    .filter(p => p.documentId === doc.id)
    .reduce((s, p) => s + (p.amountMinor || 0), 0);
}

export function balanceMinor(doc, payments, taxRates) {
  return docTotals(doc, taxRates).totalDueMinor - paidMinor(doc, payments);
}

export function daysOverdue(doc, today = new Date()) {
  if (!doc.dueDate) return 0;
  const due = new Date(doc.dueDate + 'T00:00:00');
  const ms = today - due;
  return ms > 0 ? Math.floor(ms / 86400000) : 0;
}

/**
 * Effective status of a document — derived, not stored, so it can
 * never disagree with payments and dates.
 */
export function docStatus(doc, payments, taxRates, today = new Date()) {
  if (doc.status === 'void') return 'void';
  if (doc.status === 'draft') return 'draft';
  const bal = balanceMinor(doc, payments, taxRates);
  if (bal <= 0) return 'paid';
  if (doc.dueDate && daysOverdue(doc, today) > 0) return 'overdue';
  if (paidMinor(doc, payments) > 0) return 'partial';
  return 'sent';
}
