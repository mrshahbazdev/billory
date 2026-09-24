import React, { useState } from 'react';
import { CURRENCIES } from '../lib/money.js';
import { newBusiness, uid } from '../lib/model.js';
import { TEMPLATES } from '../lib/invoiceHtml.js';

export default function SettingsPanel({ store, update, setStore }) {
  const [history, setHistory] = useState(null);

  const mutBiz = (id, fn) => update(s => { const b = s.business.find(x => x.id === id); if (b) fn(b); });
  const mutRate = (id, fn) => update(s => { const r = s.taxRates.find(x => x.id === id); if (r) fn(r); });

  const pickLogo = async (bizId) => {
    const f = await window.api.app.openFile({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (f?.dataUrl) mutBiz(bizId, b => b.logoDataUrl = f.dataUrl);
  };

  const loadHistory = async () => setHistory(await window.api.store.history());
  const restore = async (id) => {
    const { doc } = await window.api.store.restore(id);
    if (doc && confirm('Replace current data with this snapshot? (current state is snapshotted first)')) {
      await window.api.store.snapshot(store, 'before restore');
      setStore(doc);
      setHistory(null);
    }
  };

  return (
    <div className="panel">
      <h2 className="ptitle">Business profiles</h2>
      {store.business.map(b => (
        <div className="card wide" key={b.id}>
          <div className="frow">
            <input className="in" value={b.name} placeholder="Trading name" onChange={e => mutBiz(b.id, x => x.name = e.target.value)} />
            <input className="in" value={b.taxId} placeholder="Tax ID / NTN (optional)" onChange={e => mutBiz(b.id, x => x.taxId = e.target.value)} />
            <label className="lbl">Currency
              <select className="in" value={b.currency} onChange={e => mutBiz(b.id, x => x.currency = e.target.value)}>
                {Object.keys(CURRENCIES).map(k => <option key={k}>{k}</option>)}
              </select></label>
          </div>
          <div className="frow">
            <input className="in" value={b.address} placeholder="Address" onChange={e => mutBiz(b.id, x => x.address = e.target.value)} />
            <input className="in" value={b.bankDetails} placeholder="Bank / Payoneer / Wise details" onChange={e => mutBiz(b.id, x => x.bankDetails = e.target.value)} />
          </div>
          <div className="frow">
            <button className="btn small ghost" onClick={() => pickLogo(b.id)}>{b.logoDataUrl ? 'Change logo' : 'Upload logo'}</button>
            {b.logoDataUrl && <img src={b.logoDataUrl} alt="logo" style={{ height: 32 }} />}
            <button className="icon" onClick={() => { if (store.business.length > 1) update(s => s.business = s.business.filter(x => x.id !== b.id)); }} aria-label="Remove profile">✕</button>
          </div>
        </div>
      ))}
      <button className="btn small ghost" onClick={() => update(s => s.business.push(newBusiness()))}>+ Another business profile</button>

      <h2 className="ptitle">General</h2>
      <div className="frow">
        <label className="lbl">Home currency (dashboard totals)
          <select className="in" value={store.settings.homeCurrency} onChange={e => update(s => s.settings.homeCurrency = e.target.value)}>
            {Object.keys(CURRENCIES).map(k => <option key={k}>{k}</option>)}
          </select></label>
        <label className="lbl">Invoice template
          <select className="in" value={store.settings.template} onChange={e => update(s => s.settings.template = e.target.value)}>
            {Object.values(TEMPLATES).filter(t => t.id !== 'statement').map(t => <option key={t.id} value={t.id}>{t.name}{t.free ? '' : ' (Pro)'}</option>)}
          </select></label>
        <label className="lbl">Accent
          <input className="in" type="color" value={store.settings.accent} onChange={e => update(s => s.settings.accent = e.target.value)} /></label>
      </div>

      <h2 className="ptitle">Invoice numbering</h2>
      <div className="frow">
        <label className="lbl">Format
          <input className="in" value={store.numbering.format} onChange={e => update(s => s.numbering.format = e.target.value)} /></label>
        <label className="chk"><input type="checkbox" checked={store.numbering.perClient} onChange={e => update(s => s.numbering.perClient = e.target.checked)} /> Separate sequence per client</label>
      </div>
      <p className="muted">Placeholders: {'{YYYY}'} = year, {'{NNNN}'} = sequence. Numbers are allocated when you issue — drafts leave no gaps.</p>

      <h2 className="ptitle">Tax rates</h2>
      <table className="grid">
        <thead><tr><th>Name</th><th className="num">%</th><th>Type</th><th></th></tr></thead>
        <tbody>
          {store.taxRates.map(r => (
            <tr key={r.id}>
              <td><input className="in" value={r.name} onChange={e => mutRate(r.id, x => x.name = e.target.value)} /></td>
              <td><input className="in num" type="number" step="0.1" value={r.percent} onChange={e => mutRate(r.id, x => x.percent = Number(e.target.value))} /></td>
              <td>
                <select className="in" value={r.withholding ? 'wht' : 'tax'} onChange={e => mutRate(r.id, x => x.withholding = e.target.value === 'wht')}>
                  <option value="tax">Tax (added to invoice)</option>
                  <option value="wht">Withholding (deducted by client)</option>
                </select>
              </td>
              <td><button className="icon" onClick={() => update(s => s.taxRates = s.taxRates.filter(x => x.id !== r.id))} aria-label="Delete rate">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn small ghost" onClick={() => update(s => s.taxRates.push({ id: uid(), name: 'New rate', percent: 0, withholding: false }))}>+ Tax rate</button>

      <h2 className="ptitle">Data</h2>
      <div className="frow">
        <button className="btn small ghost" onClick={loadHistory}>Snapshot history…</button>
        <button className="btn small ghost" onClick={() => window.api.app.openUserData()}>Open data folder</button>
      </div>
      {history && (
        <table className="grid">
          <tbody>
            {history.map(h => (
              <tr key={h.id}><td>{h.at.slice(0, 19).replace('T', ' ')}</td><td>{h.label}</td><td><button className="btn small ghost" onClick={() => restore(h.id)}>Restore</button></td></tr>
            ))}
            {history.length === 0 && <tr><td className="muted">No snapshots yet — snapshots are taken before deletes/imports/restores.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
