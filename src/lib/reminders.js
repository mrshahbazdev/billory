/**
 * Payment reminder drafts — polite, firm, final. The app never sends
 * email; it writes the awkward message the user keeps putting off.
 */
import { fmt, docTotals, paidMinor, daysOverdue } from './money.js';
import { clientOf } from './model.js';

export function reminderDraft(store, doc, payments, tone = 'polite') {
  const cli = clientOf(store, doc);
  const due = docTotals(doc, store.taxRates).totalDueMinor;
  const bal = due - paidMinor(doc, payments);
  const days = daysOverdue(doc);
  const amount = fmt(bal, doc.currency);
  const name = cli.name || 'there';

  const bodies = {
    polite:
`Hi ${name},

I hope you're well. A gentle note that invoice ${doc.number || ''} for ${amount} was due on ${doc.dueDate}${days > 0 ? `, ${days} day${days === 1 ? '' : 's'} ago` : ''}.

If payment is already on its way, please ignore this. Otherwise it would be great to have it settled in the next few days — happy to resend the invoice or answer any questions.

Thanks,
${store.business[0]?.name || ''}`,

    firm:
`Hi ${name},

Invoice ${doc.number || ''} for ${amount} is now ${days > 0 ? days + ' day' + (days === 1 ? '' : 's') + ' ' : ''}overdue (due ${doc.dueDate}).

Could you let me know when to expect payment? If there's an issue on your side, I'm happy to talk it through — but I do need a date.

Thanks,
${store.business[0]?.name || ''}`,

    final:
`Hi ${name},

This is a final reminder regarding invoice ${doc.number || ''} for ${amount}, which was due on ${doc.dueDate} and is now ${days} day${days === 1 ? '' : 's'} overdue.

Please arrange payment within 7 days. If I haven't heard from you by then, I'll have to pause current work and consider further steps to recover the balance.

I'd much rather resolve this amicably — do get in touch if anything is unclear.

Regards,
${store.business[0]?.name || ''}`
  };

  return {
    to: cli.email || '',
    subject: `${tone === 'final' ? 'Final reminder' : 'Payment reminder'} — invoice ${doc.number || ''} (${amount})`,
    body: bodies[tone] || bodies.polite
  };
}
