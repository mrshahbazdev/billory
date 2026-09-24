const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, ipcMain } = require('electron');

/**
 * Document store. All of Billory's data is one JSON document written
 * atomically (tmp file + rename), plus timestamped snapshots in history/
 * so a bad edit can never destroy financial records.
 *
 * JSON chosen over SQLite here too: documents are filtered in memory
 * (hundreds of rows is trivial), and a plain file keeps a native
 * dependency out of the packaged installer.
 */
const MAX_HISTORY = 50;

function storeDir() {
  return app.getPath('userData');
}

function docPath() {
  return path.join(storeDir(), 'billory.json');
}

function historyDir() {
  return path.join(storeDir(), 'history');
}

function atomicWrite(file, text) {
  const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function registerStoreIPC() {
  ipcMain.handle('store:load', () => {
    try {
      return { doc: JSON.parse(fs.readFileSync(docPath(), 'utf8')) };
    } catch {
      return { doc: null };
    }
  });

  ipcMain.handle('store:save', (_e, doc) => {
    atomicWrite(docPath(), JSON.stringify(doc));
    return { ok: true };
  });

  ipcMain.handle('store:snapshot', (_e, doc, label) => {
    fs.mkdirSync(historyDir(), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = `${stamp}_${crypto.randomBytes(3).toString('hex')}`;
    atomicWrite(
      path.join(historyDir(), `${id}.json`),
      JSON.stringify({ id, label: label || '', at: new Date().toISOString(), doc })
    );
    prune();
    return { ok: true, id };
  });

  ipcMain.handle('store:history', () => {
    try {
      return fs.readdirSync(historyDir())
        .filter(f => f.endsWith('.json'))
        .map(f => {
          try {
            const s = JSON.parse(fs.readFileSync(path.join(historyDir(), f), 'utf8'));
            return { id: s.id, label: s.label, at: s.at };
          } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => b.at.localeCompare(a.at));
    } catch {
      return [];
    }
  });

  ipcMain.handle('store:restore', (_e, id) => {
    if (!/^[\w-]+$/.test(id)) return { doc: null };
    try {
      const s = JSON.parse(fs.readFileSync(path.join(historyDir(), `${id}.json`), 'utf8'));
      return { doc: s.doc };
    } catch {
      return { doc: null };
    }
  });
}

function prune() {
  try {
    const files = fs.readdirSync(historyDir()).filter(f => f.endsWith('.json')).sort();
    const extra = files.length - MAX_HISTORY;
    for (let i = 0; i < extra; i++) fs.unlinkSync(path.join(historyDir(), files[i]));
  } catch { /* pruning is best-effort */ }
}

module.exports = { registerStoreIPC };
