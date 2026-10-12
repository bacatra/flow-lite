const { clipboard } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

function getPasteScriptPath() {
  const p = path.join(__dirname, '..', 'scripts', 'paste-text.ps1');
  const unpacked = p.replace('app.asar', 'app.asar.unpacked');
  if (fs.existsSync(unpacked)) return unpacked;
  const res = path.join(process.resourcesPath || '', 'app.asar.unpacked', 'src', 'scripts', 'paste-text.ps1');
  if (fs.existsSync(res)) return res;
  return p;
}

async function injectTextAtCursor(text) {
  if (!text || text.trim().length === 0) return;

  // Save current clipboard
  const previousClipboard = clipboard.readText();

  // Write new text
  clipboard.writeText(text);

  // Trigger Ctrl+V
  const scriptPath = getPasteScriptPath();
  await new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { timeout: 1000 }, () => {
      resolve();
    });
  });

  // Restore previous clipboard after a brief delay
  setTimeout(() => {
    try {
      if (previousClipboard) {
        clipboard.writeText(previousClipboard);
      }
    } catch (e) {}
  }, 350);
}

module.exports = {
  injectTextAtCursor
};
