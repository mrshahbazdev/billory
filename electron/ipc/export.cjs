const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, BrowserWindow } = require('electron');
const { toPDF } = require('../print/render.cjs');

function registerExportIPC() {
  const win = () => BrowserWindow.getAllWindows()[0];

  // Vector PDF: real text, selectable and searchable, fonts embedded by Chromium.
  ipcMain.handle('export:pdf', async (_e, { html, suggestedName }) => {
    const res = await dialog.showSaveDialog(win(), {
      defaultPath: suggestedName || 'invoice.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    const { buffer } = await toPDF(html);
    fs.writeFileSync(res.filePath, buffer);
    return { ok: true, filePath: res.filePath };
  });

  ipcMain.handle('export:text', async (_e, { text, suggestedName }) => {
    const res = await dialog.showSaveDialog(win(), {
      defaultPath: suggestedName || 'export.txt',
      filters: [{ name: 'Plain text', extensions: ['txt'] }]
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    fs.writeFileSync(res.filePath, text, 'utf8');
    return { ok: true, filePath: res.filePath };
  });

  // Binary exports (e.g. DOCX) arrive as base64 from the renderer.
  ipcMain.handle('export:binary', async (_e, { base64, suggestedName, filters }) => {
    const res = await dialog.showSaveDialog(win(), {
      defaultPath: suggestedName || 'export',
      filters: filters || [{ name: 'Document', extensions: ['docx'] }]
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    fs.writeFileSync(res.filePath, Buffer.from(base64, 'base64'));
    return { ok: true, filePath: res.filePath };
  });

  ipcMain.handle('export:json', async (_e, { json, suggestedName }) => {
    const res = await dialog.showSaveDialog(win(), {
      defaultPath: suggestedName || 'export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    fs.writeFileSync(res.filePath, json, 'utf8');
    return { ok: true, filePath: res.filePath };
  });
}

module.exports = { registerExportIPC };
