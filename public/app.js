const appEl = document.querySelector('.app');
const startButton = document.getElementById('startTest');
const statusEl = document.getElementById('status');
const speedValueEl = document.getElementById('speedValue');
const speedLabelEl = document.getElementById('speedLabel');
const dialNeedleEl = document.getElementById('dialNeedle');
const dialInnerLabelEl = document.getElementById('dialInnerLabel');
const dialTicksEl = document.querySelector('.dial-ticks');
const dialScaleEl = document.querySelector('.dial-scale');
const serverValueEl = document.getElementById('serverValue');
const pingValueEl = document.getElementById('pingValue');
const downloadValueEl = document.getElementById('downloadValue');
const uploadValueEl = document.getElementById('uploadValue');
const indicatorGamingEl = document.getElementById('indicatorGaming');
const indicatorStreamingEl = document.getElementById('indicatorStreaming');
const indicatorVideoEl = document.getElementById('indicatorVideo');
const indicatorBrowsingEl = document.getElementById('indicatorBrowsing');

const DOWNLOAD_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const UPLOAD_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
const CRYPTO_CHUNK_SIZE = 65536; // getRandomValues per-call limit
const PING_ITERATIONS = 5;
const MIN_DOWNLOAD_ITERATIONS = 3;
const MIN_UPLOAD_ITERATIONS = 3;
const MAX_DOWNLOAD_ITERATIONS = 12;
const MAX_UPLOAD_ITERATIONS = 12;
const MIN_DOWNLOAD_DURATION_MS = 3500;
const MIN_UPLOAD_DURATION_MS = 2000;

const formatMbps = (mbps) => mbps.toFixed(2);
const formatLatency = (ms) => ms.toFixed(1);

const SPEEDOMETER_MAX = 1000;
const SPEEDOMETER_MIN_ANGLE = -135;
const SPEEDOMETER_MAX_ANGLE = 135;
const REQUEST_TIMEOUT_MS = 15000;
const MIN_TEST_IDLE_DELAY_MS = 1500;
const MINOR_TICK_STEP = 5;
const SCALE_VALUES = [0, 5, 10, 50, 100, 250, 500, 750, 1000];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const rotationForValue = (value) => {
  const normalized = clamp(value, 0, SPEEDOMETER_MAX) / SPEEDOMETER_MAX;
  return SPEEDOMETER_MIN_ANGLE + (SPEEDOMETER_MAX_ANGLE - SPEEDOMETER_MIN_ANGLE) * normalized;
};

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
  if (statusEl) {
    statusEl.textContent = message;
  }
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
  if (speedValueEl) {
    speedValueEl.textContent = formatMbps(safeValue);
  }
  if (speedLabelEl) {
    speedLabelEl.textContent = label;
  }
  setDialLabel(label);

  const rotation = rotationForValue(safeValue);

  if (dialNeedleEl) {
    dialNeedleEl.style.transform = `rotate(${rotation}deg)`;
  }
}

function resetIndicators() {
  if (indicatorGamingEl) indicatorGamingEl.textContent = '--';
  if (indicatorStreamingEl) indicatorStreamingEl.textContent = '--';
  if (indicatorVideoEl) indicatorVideoEl.textContent = '--';
  if (indicatorBrowsingEl) indicatorBrowsingEl.textContent = '--';
}

function updatePerformanceIndicators(download, upload, ping) {
  if (indicatorGamingEl) {
    if (Number.isFinite(ping)) {
      const rating = ping <= 20 ? 'Excellent' : ping <= 50 ? 'Good' : ping <= 90 ? 'Fair' : 'Slow';
      indicatorGamingEl.textContent = rating;
    } else {
      indicatorGamingEl.textContent = '--';
    }
  }

  if (indicatorStreamingEl) {
    if (Number.isFinite(download)) {
      const rating = download >= 150 ? '4K UHD' : download >= 60 ? 'HD' : download >= 20 ? 'SD' : 'Limited';
      indicatorStreamingEl.textContent = rating;
    } else {
      indicatorStreamingEl.textContent = '--';
    }
  }

  if (indicatorVideoEl) {
    if (Number.isFinite(upload)) {
      const rating = upload >= 35 ? 'Crystal' : upload >= 15 ? 'Smooth' : upload >= 5 ? 'Stable' : 'Choppy';
      indicatorVideoEl.textContent = rating;
    } else {
      indicatorVideoEl.textContent = '--';
    }
  }

  if (indicatorBrowsingEl) {
    if (Number.isFinite(download)) {
      const rating = download >= 250 ? 'Instant' : download >= 80 ? 'Snappy' : download >= 25 ? 'Responsive' : 'Laggy';
      indicatorBrowsingEl.textContent = rating;
    } else {
      indicatorBrowsingEl.textContent = '--';
    }
  }
}

function resetResults() {
  updateDial(0, 'Preparing');
  if (pingValueEl) pingValueEl.textContent = '--';
  if (downloadValueEl) downloadValueEl.textContent = '--';
  if (uploadValueEl) uploadValueEl.textContent = '--';
  resetIndicators();
}

async function enforceMinimumDuration(measuredMs, minimumMs, { label, statusMessage, dialValue }) {
  const remaining = minimumMs - measuredMs;
  if (remaining <= 0) return;

  if (Number.isFinite(dialValue)) {
    updateDial(dialValue, label);
  } else if (label) {
    setDialLabel(label);
  }

  if (statusMessage) {
    setStatus(statusMessage);
  }

  await wait(remaining);
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
  let iteration = 0;

  while (
    iteration < MIN_DOWNLOAD_ITERATIONS ||
    (totalTimeMs < MIN_DOWNLOAD_DURATION_MS && iteration < MAX_DOWNLOAD_ITERATIONS)
  ) {
    const cacheBuster = `${Date.now()}-${iteration}`;
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
    iteration += 1;
    setStatus(`Downloading sample ${iteration}...`);
  }

  const averageMbps = totalTimeMs > 0 ? (totalBits / totalTimeMs) / 1000 : 0;
  await enforceMinimumDuration(totalTimeMs, MIN_DOWNLOAD_DURATION_MS, {
    label: 'Downloading',
    statusMessage: 'Stabilising download results...',
    dialValue: averageMbps,
  });
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
  let iteration = 0;

  while (
    iteration < MIN_UPLOAD_ITERATIONS ||
    (totalTimeMs < MIN_UPLOAD_DURATION_MS && iteration < MAX_UPLOAD_ITERATIONS)
  ) {
    const payload = createUploadPayload(UPLOAD_SIZE_BYTES);
    const start = performance.now();
    const response = await fetchWithTimeout(`/api/upload?cb=${Date.now()}-${iteration}`, {
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
    iteration += 1;
    setStatus(`Uploading sample ${iteration}...`);
  }

  const averageMbps = totalTimeMs > 0 ? (totalBits / totalTimeMs) / 1000 : 0;
  await enforceMinimumDuration(totalTimeMs, MIN_UPLOAD_DURATION_MS, {
    label: 'Uploading',
    statusMessage: 'Stabilising upload results...',
    dialValue: averageMbps,
  });
  return Number.isFinite(averageMbps) && averageMbps > 0 ? averageMbps : 0;
}

async function runTest() {
  if (!startButton) return;

  startButton.disabled = true;
  if (appEl) {
    appEl.classList.remove('has-results');
    appEl.classList.add('is-running');
  }
  resetResults();
  setStatus('Measuring ping...');
  let completedSuccessfully = false;

  try {
    setDialLabel('Ping');
    const ping = await measurePing();
    if (pingValueEl) pingValueEl.textContent = formatLatency(ping);

    setStatus('Running download test...');
    const download = await measureDownload();
    if (downloadValueEl) downloadValueEl.textContent = formatMbps(download);

    setStatus('Running upload test...');
    const upload = await measureUpload();
    if (uploadValueEl) uploadValueEl.textContent = formatMbps(upload);

    updateDial(download, 'Complete');
    updatePerformanceIndicators(download, upload, ping);
    setStatus('All tests completed. Run it again anytime!');
    if (appEl) {
      appEl.classList.add('has-results');
    }
    completedSuccessfully = true;
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Something went wrong. Please try again.');
    updateDial(0, 'Error');
    resetIndicators();
  } finally {
    startButton.disabled = false;
    if (completedSuccessfully) {
      setTimeout(() => {
        updateDial(0, 'Idle');
        if (appEl) {
          appEl.classList.remove('is-running');
        }
      }, MIN_TEST_IDLE_DELAY_MS);
    } else {
      if (appEl) {
        appEl.classList.remove('is-running');
      }
      setTimeout(() => updateDial(0, 'Idle'), MIN_TEST_IDLE_DELAY_MS);
    }
  }
}

if (startButton) {
  startButton.addEventListener('click', () => {
    if (startButton.disabled) return;
    runTest();
  });
}

function initializeDial() {
  if (dialTicksEl) {
    dialTicksEl.innerHTML = '';
    const majorSet = new Set(SCALE_VALUES);
    for (let value = 0; value <= SPEEDOMETER_MAX; value += MINOR_TICK_STEP) {
      const tick = document.createElement('span');
      tick.className = 'dial-tick';
      if (majorSet.has(value)) {
        tick.classList.add('dial-tick--major');
      }
      tick.style.setProperty('--rotation', `${rotationForValue(value)}deg`);
      dialTicksEl.appendChild(tick);
    }
  }

  if (dialScaleEl) {
    dialScaleEl.innerHTML = '';
    SCALE_VALUES.forEach((value) => {
      const scaleValue = document.createElement('span');
      scaleValue.className = 'dial-scale-value';
      scaleValue.style.setProperty('--rotation', `${rotationForValue(value)}deg`);
      scaleValue.textContent = value;
      dialScaleEl.appendChild(scaleValue);
    });
  }

  if (serverValueEl) {
    const host = window.location.hostname || 'local';
    serverValueEl.textContent = host || 'local';
  }
}

initializeDial();
resetIndicators();
setStatus('Ready when you are.');
setDialLabel('Idle');
updateDial(0, 'Idle');
if (appEl) {
  appEl.classList.remove('has-results');
  appEl.classList.remove('is-running');
}
