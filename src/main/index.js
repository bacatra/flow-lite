const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { getActiveContext } = require('./contextReader');
const { injectTextAtCursor } = require('./textInjector');
const { processAudioWithOpenRouter, testApiKey } = require('./openrouter');

// Lifecycle and error logging
function logCrash(msg) {
  try {
    const logFile = path.join(app.getPath('userData'), 'app.log');
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

process.on('uncaughtException', (err) => {
  logCrash(`Uncaught Exception: ${err ? (err.stack || err) : 'unknown'}`);
});

process.on('unhandledRejection', (reason) => {
  logCrash(`Unhandled Rejection: ${reason ? (reason.stack || reason) : 'unknown'}`);
});

app.on('before-quit', () => logCrash('app event: before-quit'));
app.on('will-quit', () => logCrash('app event: will-quit'));

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logCrash('Failed to get single instance lock, quitting second instance');
  app.quit();
  process.exit(0);
}
logCrash('Got single instance lock, starting primary instance');
app.name = 'Flow Lite';
app.setAppUserModelId('Flow Lite');

let dashboardWindow = null;
let islandWindow = null;
let tray = null;
let hookProcess = null;
let isRecording = false;
let currentContext = null;
let islandHideTimeout = null;

// Paths
const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'settings.json');
const historyPath = path.join(userDataPath, 'history.json');

function getIconPath() {
  const candidates = [
    path.join(__dirname, '..', '..', 'assets', 'icon.ico').replace('app.asar', 'app.asar.unpacked'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'assets', 'icon.ico'),
    path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
    path.join(__dirname, '..', '..', 'assets', 'icon.png').replace('app.asar', 'app.asar.unpacked'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'assets', 'icon.png'),
    path.join(__dirname, '..', '..', 'assets', 'icon.png')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function getHookPath() {
  const candidates = [
    path.join(__dirname, '..', 'scripts', 'caps-hook.exe').replace('app.asar', 'app.asar.unpacked'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'src', 'scripts', 'caps-hook.exe'),
    path.join(__dirname, '..', 'scripts', 'caps-hook.exe')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

// Settings management
function loadSettings() {
  const defaults = {
    openrouterApiKey: '',
    model: 'google/gemini-2.5-flash',
    islandMode: 'dynamic', // 'dynamic' | 'fixed' | 'dictation-only'
    islandPosition: 'bottom', // 'bottom' | 'top'
    dictionary: ['Flow Lite', 'Antigravity', 'REA']
  };

  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const merged = { ...defaults, ...data };
      if (!merged.islandPosition) merged.islandPosition = 'bottom';
      if (Array.isArray(merged.dictionary)) {
        merged.dictionary = [...new Set(merged.dictionary.filter(w => typeof w === 'string' && w.trim().length > 0))];
      }
      if (merged.model && (merged.model.includes('2.0-flash') || merged.model.includes('gemini-2.0'))) {
        merged.model = 'google/gemini-2.5-flash';
        try { fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf8'); } catch (e) {}
      }
      return merged;
    }
  } catch (e) {}
  return defaults;
}

let settings = loadSettings();

function saveSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving settings:', e);
  }
}

// History management
function loadHistory() {
  try {
    if (fs.existsSync(historyPath)) {
      return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    }
  } catch (e) {}
  return [];
}

let historyData = loadHistory();

function addHistoryItem(item) {
  historyData.unshift(item);
  if (historyData.length > 100) historyData.pop();
  try {
    fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2), 'utf8');
  } catch (e) {}

  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('new-history-item', item);
  }
}

// Create Main Dashboard Window (Flow Lite control panel)
function createDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    if (dashboardWindow.isMinimized()) dashboardWindow.restore();
    dashboardWindow.show();
    dashboardWindow.setAlwaysOnTop(true);
    dashboardWindow.focus();
    dashboardWindow.setAlwaysOnTop(false);
    return;
  }

  const iconP = getIconPath();
  const winIcon = fs.existsSync(iconP) ? iconP : undefined;

  dashboardWindow = new BrowserWindow({
    width: 820,
    height: 640,
    minWidth: 680,
    minHeight: 520,
    title: 'Flow Lite — Painel de Controle',
    backgroundColor: '#000000',
    icon: winIcon,
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  dashboardWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dashboard.html'));
  dashboardWindow.show();
  dashboardWindow.focus();

  dashboardWindow.webContents.on('did-finish-load', () => {
    dashboardWindow.webContents.send('init-data', {
      settings,
      history: historyData
    });
  });

  dashboardWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      dashboardWindow.hide();

      // Show balloon notification if available
      try {
        if (tray) {
          tray.displayBalloon({
            title: 'Flow Lite em execução',
            content: 'O aplicativo continua ativo. Segure CAPS LOCK para ditar a qualquer momento!'
          });
        }
      } catch (err) {}
    }
  });
}

// Reposition island window based on screen & settings
function positionIslandWindow() {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const islandWidth = 440;
  const islandHeight = 68;
  const pos = settings.islandPosition || 'bottom';
  const x = Math.round((width - islandWidth) / 2);
  const y = pos === 'bottom' ? Math.round(height - islandHeight - 16) : 14;

  islandWindow.setBounds({ x, y, width: islandWidth, height: islandHeight });
}

// Create Dynamic Island Window
function createIslandWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const islandWidth = 440;
  const islandHeight = 68;
  const pos = settings.islandPosition || 'bottom';
  const x = Math.round((width - islandWidth) / 2);
  const y = pos === 'bottom' ? Math.round(height - islandHeight - 16) : 14;

  islandWindow = new BrowserWindow({
    width: islandWidth,
    height: islandHeight,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  islandWindow.setAlwaysOnTop(true, 'screen-saver');
  islandWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  islandWindow.webContents.on('did-finish-load', () => {
    islandWindow.webContents.send('init', settings.islandMode);
    if (settings.islandMode === 'dynamic' || settings.islandMode === 'fixed') {
      islandWindow.show();
    }
  });
}

// Low-Level Caps Lock & Typing Hook Process
function startCapsHook() {
  if (hookProcess) {
    try { hookProcess.kill(); } catch (e) {}
  }

  const resolvedPath = getHookPath();
  if (!fs.existsSync(resolvedPath)) {
    console.error('caps-hook.exe not found at', resolvedPath);
    return;
  }

  try {
    hookProcess = spawn(resolvedPath, [String(process.pid)], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    });

    hookProcess.on('error', (err) => {
      console.error('Caps hook spawn error:', err);
    });

    hookProcess.stdout.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/).filter(l => l.trim().length > 0);
      for (const line of lines) {
        if (line === 'CAPS_DOWN') {
          onCapsDown();
        } else if (line.startsWith('CAPS_UP')) {
          onCapsUp();
        } else if (line === 'TYPING_DETECTED') {
          onTypingDetected();
        }
      }
    });

    hookProcess.on('exit', () => {
      if (!app.isQuitting) {
        setTimeout(startCapsHook, 1000);
      }
    });
  } catch (err) {
    console.error('Failed to spawn caps-hook:', err);
  }
}

function onCapsDown() {
  if (isRecording) return;
  isRecording = true;
  currentContext = null;

  // Read active window context in background
  getActiveContext().then(ctx => {
    currentContext = ctx;
  });

  if (islandWindow && !islandWindow.isDestroyed()) {
    clearTimeout(islandHideTimeout);
    islandWindow.show();
    islandWindow.webContents.send('start-recording');
  }
}

function onCapsUp() {
  if (!isRecording) return;
  isRecording = false;

  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.webContents.send('stop-recording');
  }
}

function onTypingDetected() {
  if (isRecording) return;
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.webContents.send('typing-hint');
    if (settings.islandMode === 'dictation-only') {
      islandWindow.show();
      clearTimeout(islandHideTimeout);
      islandHideTimeout = setTimeout(() => {
        if (!isRecording && settings.islandMode === 'dictation-only') {
          islandWindow.hide();
        }
      }, 3500);
    }
  }
}

// Receive processed WAV from renderer
ipcMain.on('audio-recorded', async (event, { audioBase64 }) => {
  try {
    if (islandWindow && !islandWindow.isDestroyed()) {
      islandWindow.webContents.send('update-status', {
        mode: 'processing',
        text: 'Formatando com IA...'
      });
    }

    if (!currentContext) {
      currentContext = await getActiveContext();
    }

    const text = await processAudioWithOpenRouter({
      audioBase64,
      context: currentContext,
      settings,
      customDictionary: settings.dictionary || []
    });

    if (text && text.trim().length > 0) {
      if (islandWindow && !islandWindow.isDestroyed()) {
        islandWindow.webContents.send('update-status', {
          mode: 'success',
          text: '✅ Inserido!'
        });
      }

      // Paste text into active application
      await injectTextAtCursor(text);

      // Save to history
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const words = text.split(/\s+/).filter(Boolean).length;
      addHistoryItem({
        text,
        appName: currentContext?.ProcessName || 'Aplicativo',
        windowTitle: currentContext?.WindowTitle || '',
        time: timeStr,
        wordCount: words
      });

      setTimeout(() => {
        if (islandWindow && !islandWindow.isDestroyed() && !isRecording) {
          if (settings.islandMode === 'dictation-only') {
            islandWindow.hide();
          } else {
            islandWindow.webContents.send('init', settings.islandMode);
          }
        }
      }, 1400);
    } else {
      if (islandWindow && !islandWindow.isDestroyed()) {
        islandWindow.webContents.send('update-status', {
          mode: 'idle',
          text: 'Nenhuma fala detectada'
        });
        setTimeout(() => {
          if (settings.islandMode === 'dictation-only') islandWindow.hide();
          else islandWindow.webContents.send('init', settings.islandMode);
        }, 1500);
      }
    }
  } catch (err) {
    console.error('Error during processing:', err);
    if (islandWindow && !islandWindow.isDestroyed()) {
      islandWindow.webContents.send('update-status', {
        mode: 'error',
        text: err.message ? err.message.slice(0, 36) : 'Erro no processamento'
      });
      setTimeout(() => {
        if (settings.islandMode === 'dictation-only') islandWindow.hide();
        else islandWindow.webContents.send('init', settings.islandMode);
      }, 3000);
    }
  }
});

// IPC: Open Dashboard
ipcMain.on('open-dashboard', () => {
  createDashboardWindow();
});

// IPC: Move Island Window (Smooth dragging)
ipcMain.on('move-island', (event, { dx, dy }) => {
  if (islandWindow && !islandWindow.isDestroyed()) {
    const [x, y] = islandWindow.getPosition();
    islandWindow.setPosition(x + dx, y + dy);
  }
});

// IPC: Save Settings
ipcMain.on('save-settings', (event, newSettings) => {
  saveSettings(newSettings);
  positionIslandWindow();
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.webContents.send('set-island-mode', settings.islandMode);
    if (settings.islandMode === 'dynamic' || settings.islandMode === 'fixed') {
      islandWindow.show();
    } else if (!isRecording) {
      islandWindow.hide();
    }
  }
});

// IPC: Test API Key
ipcMain.handle('test-api-key', async (event, keyToTest) => {
  try {
    const res = await testApiKey(keyToTest || settings.openrouterApiKey);
    return { success: true, data: res };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// System Tray
function createTray() {
  try {
    const iconP = getIconPath();
    app.setAppUserModelId('Flow Lite');

    if (fs.existsSync(iconP)) {
      tray = new Tray(iconP);
    } else {
      const buf = Buffer.alloc(16 * 16 * 4, 255);
      tray = new Tray(nativeImage.createFromBuffer(buf, { width: 16, height: 16 }));
    }

    tray.setToolTip('Flow Lite — Voice Typing (Segure CAPS LOCK)');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Abrir Painel de Controle',
        click: () => createDashboardWindow()
      },
      {
        label: 'Alternar Ilha Flutuante',
        click: () => {
          if (islandWindow && !islandWindow.isDestroyed()) {
            if (islandWindow.isVisible()) islandWindow.hide();
            else islandWindow.show();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Segure CAPS LOCK para ditar',
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Sair do Flow Lite',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => createDashboardWindow());
    tray.on('double-click', () => createDashboardWindow());
  } catch (err) {
    console.error('Tray creation error:', err);
  }
}

// App lifecycle
logCrash('Registering app.whenReady listener');

app.whenReady().then(() => {
  logCrash('app.whenReady triggered');
  try {
    createIslandWindow();
    logCrash('createIslandWindow completed');
  } catch (e) {
    logCrash(`createIslandWindow error: ${e.stack || e}`);
  }

  try {
    createDashboardWindow();
    logCrash('createDashboardWindow completed');
  } catch (e) {
    logCrash(`createDashboardWindow error: ${e.stack || e}`);
  }

  try {
    createTray();
    logCrash('createTray completed');
  } catch (e) {
    logCrash(`createTray error: ${e.stack || e}`);
  }

  try {
    startCapsHook();
    logCrash('startCapsHook completed');
  } catch (e) {
    logCrash(`startCapsHook error: ${e.stack || e}`);
  }
});

app.on('second-instance', () => {
  logCrash('app event: second-instance');
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    if (dashboardWindow.isMinimized()) dashboardWindow.restore();
    dashboardWindow.show();
    dashboardWindow.setAlwaysOnTop(true);
    dashboardWindow.focus();
    dashboardWindow.setAlwaysOnTop(false);
  } else {
    createDashboardWindow();
  }
});

app.on('window-all-closed', (e) => {
  logCrash('app event: window-all-closed');
  // Explicitly prevent default exit on Windows!
  e.preventDefault();
});

