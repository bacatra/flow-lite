const { ipcRenderer } = require('electron');

let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let audioInput = null;
let pcmData = [];
let isRecording = false;
let animationId = null;
let recordStartTime = null;
let timerInterval = null;
let soundEnabled = true;
let islandMode = 'dynamic';

// UI Elements
const island = document.getElementById('island');
const iconBadge = document.getElementById('iconBadge');
const statusText = document.getElementById('statusText');
const waveBars = document.querySelectorAll('.wave-bar');
const waveform = document.getElementById('waveform');
const recordTimer = document.getElementById('recordTimer');

// Dragging and clicking island
let isDragging = false;
let startScreenX = 0;
let startScreenY = 0;

island.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  isDragging = false;
  startScreenX = e.screenX;
  startScreenY = e.screenY;

  const onMouseMove = (moveEvent) => {
    const dx = moveEvent.screenX - startScreenX;
    const dy = moveEvent.screenY - startScreenY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      isDragging = true;
      ipcRenderer.send('move-island', { dx, dy });
      startScreenX = moveEvent.screenX;
      startScreenY = moveEvent.screenY;
    }
  };

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    if (!isDragging) {
      ipcRenderer.send('open-dashboard');
    }
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
});

// Sound synthesis helper (Flow Lite audio chimes)
function playTone(freq, duration, type = 'sine', volume = 0.12) {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function playStartSound() {
  playTone(620, 0.07);
  setTimeout(() => playTone(880, 0.1), 60);
}

function playStopSound() {
  playTone(880, 0.07);
  setTimeout(() => playTone(620, 0.09), 60);
}

function playSuccessSound() {
  playTone(523.25, 0.06); // C5
  setTimeout(() => playTone(659.25, 0.06), 55); // E5
  setTimeout(() => playTone(1046.50, 0.12), 110); // C6
}

// IPC Handlers
ipcRenderer.on('start-recording', async () => {
  await startRecording();
});

ipcRenderer.on('stop-recording', async () => {
  await stopRecording();
});

ipcRenderer.on('update-status', (event, { mode, text }) => {
  setIslandState(mode, text);
});

let typingHintTimeout = null;

ipcRenderer.on('typing-hint', () => {
  if (isRecording) return;
  island.classList.remove('hidden-mode', 'idle', 'recording', 'processing', 'success');
  island.classList.add('typing-active');
  waveform.style.display = 'none';
  recordTimer.style.display = 'none';
  statusText.innerHTML = 'Digitando? Segure <kbd class="kbd-chip">CAPS LOCK</kbd>';

  clearTimeout(typingHintTimeout);
  typingHintTimeout = setTimeout(() => {
    if (!isRecording) {
      island.classList.remove('typing-active');
      resetToIdle();
    }
  }, 3200);
});

ipcRenderer.on('init', (e, config) => {
  if (typeof config === 'object') {
    islandMode = config.mode || 'dynamic';
    soundEnabled = config.soundEffects !== false;
  } else {
    islandMode = config || 'dynamic';
  }
  resetToIdle();
});

ipcRenderer.on('set-island-mode', (event, config) => {
  if (typeof config === 'object') {
    islandMode = config.mode || 'dynamic';
    soundEnabled = config.soundEffects !== false;
  } else {
    islandMode = config || 'dynamic';
  }
  if (!isRecording) {
    resetToIdle();
  }
});

function setIslandState(state, text) {
  island.className = `island-pill ${state}`;
  statusText.innerHTML = text;

  if (state === 'recording') {
    waveform.style.display = 'flex';
    recordTimer.style.display = 'inline-block';
  } else {
    waveform.style.display = 'none';
    recordTimer.style.display = 'none';
  }
}

function resetToIdle() {
  if (timerInterval) clearInterval(timerInterval);
  if (islandMode === 'dictation-only') {
    island.className = 'island-pill hidden-mode';
  } else {
    island.className = 'island-pill idle';
    waveform.style.display = 'none';
    recordTimer.style.display = 'none';
    statusText.innerHTML = 'Segure <kbd class="kbd-chip">CAPS LOCK</kbd>';
  }
}

async function startRecording() {
  if (isRecording) return;
  try {
    pcmData = [];
    isRecording = true;
    recordStartTime = Date.now();

    // Start timer display
    recordTimer.textContent = '00:00';
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      recordTimer.textContent = `${m}:${s}`;
    }, 500);

    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    audioInput = audioContext.createMediaStreamSource(mediaStream);
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.6;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    scriptProcessor.onaudioprocess = (e) => {
      if (!isRecording) return;
      const input = e.inputBuffer.getChannelData(0);
      pcmData.push(new Float32Array(input));
    };

    audioInput.connect(analyser);
    analyser.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    // Animate 7-bar waveform with frequency distribution
    function animate() {
      if (!isRecording) return;
      analyser.getByteFrequencyData(dataArray);
      for (let i = 0; i < 7; i++) {
        const val = dataArray[i * 2 + 1] || 0;
        const height = Math.max(4, Math.min(22, (val / 255) * 24));
        if (waveBars[i]) waveBars[i].style.height = `${height}px`;
      }
      animationId = requestAnimationFrame(animate);
    }
    animate();

    setIslandState('recording', 'Ouvindo...');
    playStartSound();
  } catch (err) {
    isRecording = false;
    if (timerInterval) clearInterval(timerInterval);
    setIslandState('error', 'Microfone indisponível');
    console.error('Microphone error:', err);
    setTimeout(resetToIdle, 2500);
  }
}

async function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  if (timerInterval) clearInterval(timerInterval);
  if (animationId) cancelAnimationFrame(animationId);

  playStopSound();
  setIslandState('processing', 'Formatando com IA...');

  // Disconnect audio
  if (scriptProcessor) scriptProcessor.disconnect();
  if (audioInput) audioInput.disconnect();
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }

  // Merge PCM buffers
  const totalLength = pcmData.reduce((acc, b) => acc + b.length, 0);
  if (totalLength < 16000 * 0.35) { // Less than 350ms
    setIslandState('idle', 'Toque muito rápido');
    setTimeout(resetToIdle, 1200);
    return;
  }

  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const b of pcmData) {
    merged.set(b, offset);
    offset += b.length;
  }

  // Convert to 16-bit PCM WAV
  const wavBuffer = encodeWAV(merged, 16000);
  const base64Wav = bufferToBase64(wavBuffer);

  ipcRenderer.send('audio-recorded', { audioBase64: base64Wav });
}

// Encode Float32Array to 16-bit PCM WAV
function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let index = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    index += 2;
  }

  return new Uint8Array(buffer);
}

function bufferToBase64(uint8Array) {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return window.btoa(binary);
}
