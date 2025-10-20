const startButton = document.getElementById('startTest');
const statusEl = document.getElementById('status');
const speedValueEl = document.getElementById('speedValue');
const speedLabelEl = document.getElementById('speedLabel');
const dialNeedleEl = document.getElementById('dialNeedle');
const dialInnerLabelEl = document.getElementById('dialInnerLabel');
const pingValueEl = document.getElementById('pingValue');
const downloadValueEl = document.getElementById('downloadValue');
const uploadValueEl = document.getElementById('uploadValue');

const DOWNLOAD_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const UPLOAD_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
const CRYPTO_CHUNK_SIZE = 65536; // getRandomValues per-call limit
const PING_ITERATIONS = 5;
const DOWNLOAD_ITERATIONS = 3;
const UPLOAD_ITERATIONS = 3;

const formatMbps = (mbps) => mbps.toFixed(2);
const formatLatency = (ms) => ms.toFixed(1);

const SPEEDOMETER_MAX = 200;
const SPEEDOMETER_MIN_ANGLE = -135;
const SPEEDOMETER_MAX_ANGLE = 135;
const REQUEST_TIMEOUT_MS = 15000;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

async function fetchWithTimeout(resource, options = {}, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const { signal, ...rest } = options;

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...rest,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setDialLabel(label) {
  if (!dialInnerLabelEl) return;
  const normalized = (label || '').toLowerCase();
  if (normalized.startsWith('down')) {
    dialInnerLabelEl.textContent = 'DOWNLOAD';
  } else if (normalized.startsWith('up')) {
    dialInnerLabelEl.textContent = 'UPLOAD';
  } else if (normalized.includes('ping')) {
    dialInnerLabelEl.textContent = 'PING';
  } else if (normalized === 'complete') {
    dialInnerLabelEl.textContent = 'RESULT';
  } else if (normalized === 'idle') {
    dialInnerLabelEl.textContent = 'READY';
  } else if (normalized === 'error') {
    dialInnerLabelEl.textContent = 'ERROR';
  } else {
    dialInnerLabelEl.textContent = 'SPEED';
  }
}

function updateDial(value, label) {
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const safeValue = Math.max(numericValue, 0);
  speedValueEl.textContent = formatMbps(safeValue);
  speedLabelEl.textContent = label;
  setDialLabel(label);

  const normalized = clamp(safeValue, 0, SPEEDOMETER_MAX) / SPEEDOMETER_MAX;
  const rotation = SPEEDOMETER_MIN_ANGLE + (SPEEDOMETER_MAX_ANGLE - SPEEDOMETER_MIN_ANGLE) * normalized;

  if (dialNeedleEl) {
    dialNeedleEl.style.transform = `rotate(${rotation}deg)`;
  }
}

function resetResults() {
  updateDial(0, 'Preparing');
  pingValueEl.textContent = '0';
  downloadValueEl.textContent = '0.00';
  uploadValueEl.textContent = '0.00';
}

async function measurePing() {
  const latencies = [];
  for (let i = 0; i < PING_ITERATIONS; i += 1) {
    const cacheBuster = `${Date.now()}-${i}`;
    const start = performance.now();
    const response = await fetchWithTimeout(`/api/ping?cb=${cacheBuster}`, { cache: 'no-store' });
    await response.json();
    const end = performance.now();
    if (i > 0) {
      latencies.push(end - start);
    }
  }
  if (latencies.length === 0) {
    return 0;
  }
  const average = latencies.reduce((total, value) => total + value, 0) / latencies.length;
  return average;
}

async function measureDownload() {
  let totalBits = 0;
  let totalTimeMs = 0;

  for (let i = 0; i < DOWNLOAD_ITERATIONS; i += 1) {
    const cacheBuster = `${Date.now()}-${i}`;
    const start = performance.now();
    const response = await fetchWithTimeout(`/api/download?size=${DOWNLOAD_SIZE_BYTES}&cb=${cacheBuster}`, {
      cache: 'no-store',
    });
    const blob = await response.blob();
    const end = performance.now();

    const duration = end - start;
    totalTimeMs += duration;
    totalBits += blob.size * 8;

    const instantaneousMbps = (blob.size * 8) / duration / 1000;
    updateDial(instantaneousMbps, 'Downloading');
    setStatus(`Downloading sample ${i + 1} of ${DOWNLOAD_ITERATIONS}...`);
  }

  const averageMbps = (totalBits / totalTimeMs) / 1000;
  return Number.isFinite(averageMbps) && averageMbps > 0 ? averageMbps : 0;
}

function createUploadPayload(size) {
  const array = new Uint8Array(size);
  if (window.crypto && typeof crypto.getRandomValues === 'function') {
    for (let offset = 0; offset < array.length; offset += CRYPTO_CHUNK_SIZE) {
      const slice = array.subarray(offset, Math.min(offset + CRYPTO_CHUNK_SIZE, array.length));
      crypto.getRandomValues(slice);
    }
  } else {
    for (let i = 0; i < array.length; i += 1) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return array;
}

async function measureUpload() {
  let totalBits = 0;
  let totalTimeMs = 0;

  for (let i = 0; i < UPLOAD_ITERATIONS; i += 1) {
    const payload = createUploadPayload(UPLOAD_SIZE_BYTES);
    const start = performance.now();
    const response = await fetchWithTimeout(`/api/upload?cb=${Date.now()}-${i}`, {
      method: 'POST',
      body: payload,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      cache: 'no-store',
    });
    await response.json();
    const end = performance.now();

    const duration = end - start;
    totalTimeMs += duration;
    totalBits += payload.byteLength * 8;

    const instantaneousMbps = (payload.byteLength * 8) / duration / 1000;
    updateDial(instantaneousMbps, 'Uploading');
    setStatus(`Uploading sample ${i + 1} of ${UPLOAD_ITERATIONS}...`);
  }

  const averageMbps = (totalBits / totalTimeMs) / 1000;
  return Number.isFinite(averageMbps) && averageMbps > 0 ? averageMbps : 0;
}

async function runTest() {
  startButton.disabled = true;
  resetResults();
  setStatus('Measuring ping...');
  let completedSuccessfully = false;

  try {
    setDialLabel('Ping');
    const ping = await measurePing();
    pingValueEl.textContent = formatLatency(ping);

    setStatus('Running download test...');
    const download = await measureDownload();
    downloadValueEl.textContent = formatMbps(download);

    setStatus('Running upload test...');
    const upload = await measureUpload();
    uploadValueEl.textContent = formatMbps(upload);

    updateDial(download, 'Complete');
    setStatus('All tests completed. Run it again anytime!');
    completedSuccessfully = true;
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Something went wrong. Please try again.');
    updateDial(0, 'Error');
  } finally {
    startButton.disabled = false;
    if (completedSuccessfully) {
      setTimeout(() => updateDial(0, 'Idle'), 1500);
    }
  }
}

startButton.addEventListener('click', () => {
  if (startButton.disabled) return;
  runTest();
});

setStatus('Ready when you are.');
setDialLabel('Idle');
