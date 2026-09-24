import React, { useEffect, useRef, useState } from 'react';
import { emptyStore, sampleStore, newDocument, issueDocument } from './lib/model.js';
import Dashboard from './components/Dashboard.jsx';
import DocList from './components/DocList.jsx';
import DocEditor from './components/DocEditor.jsx';
import ClientsPanel from './components/ClientsPanel.jsx';
import TimePanel from './components/TimePanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import { exportCsv } from './lib/csv.js';

const TABS = [
  { id: 'dash', label: 'Dashboard' },
  { id: 'docs', label: 'Documents' },
  { id: 'clients', label: 'Clients & items' },
  { id: 'time', label: 'Time' },
  { id: 'settings', label: 'Settings' }
];

export default function App() {
  const [store, setStore] = useState(null);
  const [tab, setTab] = useState('dash');
  const [editingId, setEditingId] = useState(null);
  const [version, setVersion] = useState('');
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const { doc } = await window.api.store.load();
      setStore(doc && Array.isArray(doc.documents) ? doc : sampleStore());
      setVersion(await window.api.app.version().catch(() => ''));
    })();
  }, []);

  // Autosave — debounced atomic write via the main process.
  useEffect(() => {
    if (!store) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => window.api.store.save(store), 600);
    return () => clearTimeout(saveTimer.current);
  }, [store]);

  const update = (fn) => setStore(s => {
    const next = structuredClone(s);
    fn(next);
    return next;
  });

  const openDoc = (id) => { setEditingId(id); setTab('docs'); };
  const editing = store?.documents.find(d => d.id === editingId) || null;

  const makeDoc = (type) => {
    const doc = newDocument(type);
    doc.businessId = store.business[0]?.id || '';
    update(s => s.documents.unshift(doc));
    openDoc(doc.id);
  };

  const issue = (id) => update(s => { const d = s.documents.find(x => x.id === id); if (d) issueDocument(s, d); });

  const exportAllJson = () => window.api.export.json({ json: JSON.stringify(store, null, 2), suggestedName: 'billory-backup.json' });
  const exportAllCsv = () => window.api.export.text({ text: exportCsv(store, store.payments), suggestedName: 'billory-export.csv' });
  const importJson = async () => {
    const f = await window.api.app.openFile({ filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!f?.text) return;
    try {
      const parsed = JSON.parse(f.text);
      if (!parsed.documents || !parsed.clients) throw new Error('not a Billory backup');
      await window.api.store.snapshot(store, 'before import');
      setStore({ ...emptyStore(), ...parsed });
    } catch (e) { alert('Could not import: ' + e.message); }
  };

  if (!store) return <div className="boot">Loading…</div>;

  const firstRun = !store.settings.firstRunDone;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Billory</div>
        <nav className="tabs">
          {TABS.map(t => (
            <button key={t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        <div className="top-actions">
          <button className="btn ghost" onClick={exportAllJson} title="Backup everything as JSON">Backup</button>
          <button className="btn ghost" onClick={exportAllCsv}>Export CSV</button>
          <button className="btn ghost" onClick={importJson}>Import</button>
          <button className="btn" onClick={() => makeDoc('invoice')}>+ Invoice</button>
          <button className="btn ghost" onClick={() => makeDoc('quote')}>+ Quote</button>
        </div>
      </header>

      {firstRun && (
        <div className="welcome">
          <h1>Welcome to Billory</h1>
          <p>Invoice your clients, track who's paid and who hasn't — everything stays on your computer. We've loaded two sample clients and three invoices so you can look around.</p>
          <div className="welcome-actions">
            <button className="btn" onClick={() => update(s => { s.settings.firstRunDone = true; })}>Explore sample data</button>
            <button className="btn ghost" onClick={() => { setStore(emptyStore()); }}>Start blank</button>
          </div>
        </div>
      )}

      <main className="body">
        {tab === 'dash' && <Dashboard store={store} update={update} openDoc={openDoc} />}
        {tab === 'docs' && (editing
          ? <DocEditor key={editing.id} store={store} doc={editing} update={update} close={() => setEditingId(null)} />
          : <DocList store={store} update={update} openDoc={openDoc} makeDoc={makeDoc} />)}
        {tab === 'clients' && <ClientsPanel store={store} update={update} />}
        {tab === 'time' && <TimePanel store={store} update={update} openDoc={openDoc} />}
        {tab === 'settings' && <SettingsPanel store={store} update={update} setStore={setStore} />}
      </main>
      <footer className="foot">Billory v{version} — offline, no account, nothing leaves your computer.</footer>
    </div>
  );
}
