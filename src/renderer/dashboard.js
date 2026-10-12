const { ipcRenderer, clipboard } = require('electron');

let currentSettings = {};
let historyData = [];
let selectedPosition = 'bottom';

// Navigation Views
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const viewId = btn.getAttribute('data-view');
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
  });
});

// Segmented Position Toggle
const btnBottom = document.getElementById('btnPosBottom');
const btnTop = document.getElementById('btnPosTop');

if (btnBottom && btnTop) {
  btnBottom.addEventListener('click', () => {
    selectedPosition = 'bottom';
    btnBottom.classList.add('active');
    btnTop.classList.remove('active');
  });

  btnTop.addEventListener('click', () => {
    selectedPosition = 'top';
    btnTop.classList.add('active');
    btnBottom.classList.remove('active');
  });
}

// IPC Listeners
ipcRenderer.on('init-data', (event, { settings, history }) => {
  currentSettings = settings || {};
  historyData = history || [];

  selectedPosition = currentSettings.islandPosition || 'bottom';
  if (selectedPosition === 'top') {
    btnTop?.classList.add('active');
    btnBottom?.classList.remove('active');
  } else {
    btnBottom?.classList.add('active');
    btnTop?.classList.remove('active');
  }

  populateSettings();
  renderHistory();
  renderDictionary();
  renderStats();
});

ipcRenderer.on('new-history-item', (event, item) => {
  historyData.unshift(item);
  if (historyData.length > 50) historyData.pop();
  renderHistory();
  renderStats();
});

function populateSettings() {
  document.getElementById('apiKeyInput').value = currentSettings.openrouterApiKey || '';
  let modelVal = currentSettings.model || 'google/gemini-2.5-flash';
  if (modelVal.includes('2.0-flash')) modelVal = 'google/gemini-2.5-flash';
  document.getElementById('modelSelect').value = modelVal;
  document.getElementById('islandModeSelect').value = currentSettings.islandMode || 'dynamic';
}

function renderHistory() {
  const container = document.getElementById('historyFeed');
  if (historyData.length === 0) {
    container.innerHTML = '<div class="empty-placeholder">Nenhum ditado realizado ainda nesta sessão. Mantenha Caps Lock pressionado em qualquer programa para falar.</div>';
    return;
  }

  container.innerHTML = historyData.map((item, idx) => `
    <div class="history-card">
      <div class="card-meta">
        <span class="app-pill">${escapeHtml(item.appName || 'Aplicativo')}</span>
        <span>${item.time || ''} • ${item.wordCount || 0} palavras</span>
      </div>
      <div class="card-body">${escapeHtml(item.text)}</div>
      <div class="card-actions">
        <button class="btn-action" id="btnCopy_${idx}" onclick="copyText('${escapeQuotes(item.text)}', 'btnCopy_${idx}')">
          Copiar
        </button>
      </div>
    </div>
  `).join('');
}

function renderDictionary() {
  const container = document.getElementById('chipsContainer');
  const dict = currentSettings.dictionary || [];

  if (dict.length === 0) {
    container.innerHTML = '<span style="font-size: 12.5px; color: var(--text-muted);">Nenhum termo cadastrado ainda.</span>';
    return;
  }

  container.innerHTML = dict.map((word, idx) => `
    <div class="term-chip">
      <span>${escapeHtml(word)}</span>
      <span class="term-chip-del" onclick="removeWord(${idx})">×</span>
    </div>
  `).join('');
}

function renderStats() {
  const count = historyData.length;
  const words = historyData.reduce((acc, h) => acc + (h.wordCount || 0), 0);
  const minutesSaved = Math.round((words * 1.8) / 60);

  document.getElementById('statCount').textContent = count;
  document.getElementById('statWords').textContent = words;
  document.getElementById('statTime').textContent = `${minutesSaved} min`;
}

// Dictionary add/remove
const inputWord = document.getElementById('newWordInput');
document.getElementById('btnAddWord').addEventListener('click', addTerm);
inputWord.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTerm();
});

function addTerm() {
  const word = inputWord.value.trim();
  if (!word) return;

  if (!currentSettings.dictionary) currentSettings.dictionary = [];
  if (!currentSettings.dictionary.includes(word)) {
    currentSettings.dictionary.push(word);
    saveSettingsToServer();
    renderDictionary();
  }
  inputWord.value = '';
}

window.removeWord = function(index) {
  if (currentSettings.dictionary) {
    currentSettings.dictionary.splice(index, 1);
    saveSettingsToServer();
    renderDictionary();
  }
};

window.copyText = function(text, btnId) {
  clipboard.writeText(text);
  const btn = document.getElementById(btnId);
  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = 'Copiado';
    btn.style.color = '#ffffff';
    btn.style.borderColor = '#ffffff';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 1500);
  }
};

// Toggle API key visibility
const btnToggle = document.getElementById('btnToggleKey');
if (btnToggle) {
  btnToggle.addEventListener('click', () => {
    const input = document.getElementById('apiKeyInput');
    if (input.type === 'password') {
      input.type = 'text';
      btnToggle.textContent = 'Ocultar';
    } else {
      input.type = 'password';
      btnToggle.textContent = 'Ver Chave';
    }
  });
}

// Test API Key button
const btnTest = document.getElementById('btnTestKey');
if (btnTest) {
  btnTest.addEventListener('click', async () => {
    const input = document.getElementById('apiKeyInput');
    const resultBox = document.getElementById('testResult');
    const key = input.value.trim();

    if (!key) {
      resultBox.style.display = 'block';
      resultBox.style.color = '#a1a1aa';
      resultBox.textContent = 'Informe uma chave OpenRouter antes de testar.';
      return;
    }

    resultBox.style.display = 'block';
    resultBox.style.color = '#a1a1aa';
    resultBox.textContent = 'Conectando ao OpenRouter...';
    btnTest.disabled = true;

    try {
      const res = await ipcRenderer.invoke('test-api-key', key);
      btnTest.disabled = false;
      if (res.success) {
        resultBox.style.color = '#ffffff';
        const limitStr = res.data?.data?.limit != null ? ` (Limite: $${res.data.data.limit})` : '';
        resultBox.textContent = `Chave valida e conectada.${limitStr}`;
      } else {
        resultBox.style.color = '#a1a1aa';
        resultBox.textContent = `Falha: ${res.error}`;
      }
    } catch (e) {
      btnTest.disabled = false;
      resultBox.style.color = '#a1a1aa';
      resultBox.textContent = `Erro: ${e.message}`;
    }
  });
}

// Save settings button
document.getElementById('btnSaveSettings').addEventListener('click', () => {
  currentSettings.openrouterApiKey = document.getElementById('apiKeyInput').value.trim();
  currentSettings.model = document.getElementById('modelSelect').value;
  currentSettings.islandMode = document.getElementById('islandModeSelect').value;
  currentSettings.islandPosition = selectedPosition;

  saveSettingsToServer();

  const notice = document.getElementById('saveNotice');
  notice.style.display = 'inline';
  setTimeout(() => { notice.style.display = 'none'; }, 2500);
});

function saveSettingsToServer() {
  ipcRenderer.send('save-settings', currentSettings);
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function escapeQuotes(str) {
  return (str || '').replace(/'/g, "\\'").replace(/\n/g, ' ');
}
