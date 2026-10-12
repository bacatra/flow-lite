const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

function getScriptPath() {
  const p = path.join(__dirname, '..', 'scripts', 'get-context.ps1');
  const unpacked = p.replace('app.asar', 'app.asar.unpacked');
  if (fs.existsSync(unpacked)) return unpacked;
  const res = path.join(process.resourcesPath || '', 'app.asar.unpacked', 'src', 'scripts', 'get-context.ps1');
  if (fs.existsSync(res)) return res;
  return p;
}

function getActiveContext() {
  return new Promise((resolve) => {
    const scriptPath = getScriptPath();
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { timeout: 1500 }, (error, stdout) => {
      if (error) {
        return resolve({ ProcessName: 'Desconhecido', WindowTitle: '', FocusedText: '' });
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (e) {
        resolve({ ProcessName: 'Desconhecido', WindowTitle: '', FocusedText: '' });
      }
    });
  });
}

module.exports = {
  getActiveContext
};
