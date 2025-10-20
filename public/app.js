const startButton = document.getElementById('startTest');
const statusEl = document.getElementById('status');
const speedValueEl = document.getElementById('speedValue');
const speedLabelEl = document.getElementById('speedLabel');
const pingValueEl = document.getElementById('pingValue');
const downloadValueEl = document.getElementById('downloadValue');
const uploadValueEl = document.getElementById('uploadValue');

const DOWNLOAD_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const UPLOAD_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
const PING_ITERATIONS = 5;
const DOWNLOAD_ITERATIONS = 3;
const UPLOAD_ITERATIONS = 3;

const formatMbps = (mbps) => mbps.toFixed(2);
const formatLatency = (ms) => ms.toFixed(1);

function setStatus(message) {
  statusEl.textContent = message;
}

function updateDial(value, label) {
  speedValueEl.textContent = typeof value === 'number' && Number.isFinite(value)
    ? formatMbps(value)
    : '0.00';
  speedLabelEl.textContent = label;
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
    const response = await fetch(`/api/ping?cb=${cacheBuster}`, { cache: 'no-store' });
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
    const response = await fetch(`/api/download?size=${DOWNLOAD_SIZE_BYTES}&cb=${cacheBuster}`, {
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
  crypto.getRandomValues(array);
  return array;
}

async function measureUpload() {
  let totalBits = 0;
  let totalTimeMs = 0;

  for (let i = 0; i < UPLOAD_ITERATIONS; i += 1) {
    const payload = createUploadPayload(UPLOAD_SIZE_BYTES);
    const start = performance.now();
    const response = await fetch(`/api/upload?cb=${Date.now()}-${i}`, {
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

  try {
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
  } catch (error) {
    console.error(error);
    setStatus('Something went wrong. Please try again.');
    updateDial(0, 'Error');
  } finally {
    startButton.disabled = false;
    setTimeout(() => updateDial(0, 'Idle'), 1500);
  }
}

startButton.addEventListener('click', () => {
  if (startButton.disabled) return;
  runTest();
});

setStatus('Ready when you are.');
