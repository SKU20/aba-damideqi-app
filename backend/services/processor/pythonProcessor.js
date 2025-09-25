const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function findPythonExecutable() {
  const candidates = [process.env.PYTHON_EXECUTABLE, 'python', 'py', 'python3'].filter(Boolean);
  return candidates;
}

function runPythonExtractor(videoPath) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'py_dragy_extractor.py');
    const execs = findPythonExecutable();
    console.log('[pythonProcessor] Candidates for Python exec:', execs);
    const tryNext = (idx) => {
      if (idx >= execs.length) return resolve({ ok: false, error: 'No python executable found in PATH' });
      const exe = execs[idx];
      console.log(`[pythonProcessor] Trying Python exec: ${exe} ${scriptPath} ${videoPath}`);
      execFile(exe, [scriptPath, videoPath], { windowsHide: true }, (err, stdout, stderr) => {
        if (err) return tryNext(idx + 1);
        try {
          const rawOut = (stdout || '').trim();
          if (!rawOut) {
            return resolve({ ok: false, error: 'Empty stdout from python', stdout, stderr });
          }
          const parsed = JSON.parse(rawOut);
          console.log('[pythonProcessor] Parsed JSON from Python:', parsed);
          return resolve({ ok: true, data: parsed });
        } catch (e) {
          console.warn('[pythonProcessor] Invalid JSON from python. stdout:', stdout, 'stderr:', stderr);
          return resolve({ ok: false, error: `Invalid JSON from python: ${e.message}`, stdout, stderr });
        }
      }).on('error', () => tryNext(idx + 1));
    };
    tryNext(0);
  });
}

async function processVideo(filePath, opts = {}) {
  const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : { size: 0 };
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const safeProgress = (p, stage) => {
    try { if (onProgress) onProgress(Math.max(0, Math.min(100, Math.round(p))), stage); } catch (_) {}
  };

  // Progress milestones
  safeProgress(5, 'python-start');
  safeProgress(15, 'prepare');

  const py = await runPythonExtractor(filePath);
  if (!py.ok) {
    console.warn('[pythonProcessor] Python extractor failed:', py.error);
    safeProgress(100, 'failed');
    return {
      processor: 'python-easyocr',
      video: { path: filePath, filename: path.basename(filePath), size_bytes: stats.size },
      detections: [],
      summary: {
        range: opts.range || '0-60mph',
        brand: null,
        model: null,
        year: null,
        best_elapsed_ms: null,
        all_results: null,
        error: py.error || 'python extractor failed'
      }
    };
  }

  const d = py.data || {};
  console.log('[pythonProcessor] Normalizing Python data:', d);
  safeProgress(60, 'ocr');
  
  if (d && d.error) {
    console.warn('[pythonProcessor] Python returned error JSON:', d.error);
    safeProgress(100, 'failed');
    return {
      processor: 'python-easyocr',
      video: { path: filePath, filename: path.basename(filePath), size_bytes: stats.size },
      detections: [],
      summary: {
        range: opts.range || '0-60mph',
        brand: null,
        model: null,
        year: null,
        best_elapsed_ms: null,
        all_results: null,
        error: d.error,
      },
    };
  }
  
  safeProgress(75, 'parsing');
  
  // Extract available times from Python output (using correct field names)
  const sec_060 = typeof d.best_0_60_s === 'number' ? d.best_0_60_s : null;            // 0-60 mph
  const sec_0100 = typeof d.best_0_100_s === 'number' ? d.best_0_100_s : null;          // 0-100 km/h
  const sec_100200 = typeof d.best_100_200_s === 'number' ? d.best_100_200_s : null;    // 100-200 km/h

  const vehicleType = (opts.vehicleType || 'car').toLowerCase();
  const reqRange = (opts.range || '').toLowerCase();

  let pickedSecs = null;
  let rangeLabel = null;
  let targetSpeed = null;

  // Determine which time to use based on vehicle type and requested range
  if (vehicleType === 'motorcycle') {
    // Motorcycles: use 0-60mph
    pickedSecs = sec_060;
    rangeLabel = '0-60mph';
    targetSpeed = 60;
  } else {
    // Cars
    if (reqRange.includes('100-200') || reqRange.includes('0-200')) {
      // Prefer 100-200 if requested
      pickedSecs = sec_100200;
      rangeLabel = '100-200km/h';
      targetSpeed = 200;
    } else if (reqRange.includes('0-100')) {
      // 0-100 km/h requested
      pickedSecs = sec_0100;
      rangeLabel = '0-100km/h';
      targetSpeed = 100;
    } else {
      // Default: prefer 0-100 for cars if present, else fallback to 0-60 mph
      if (sec_0100 != null) {
        pickedSecs = sec_0100;
        rangeLabel = '0-100km/h';
        targetSpeed = 100;
      } else {
        pickedSecs = sec_060;
        rangeLabel = '0-60mph';
        targetSpeed = 60;
      }
    }
  }

  // Fallback: if we don't have the requested time, use what we have in a sensible order
  if (pickedSecs === null) {
    if (sec_0100 != null) {
      pickedSecs = sec_0100;
      rangeLabel = '0-100km/h';
      targetSpeed = 100;
    } else if (sec_100200 != null) {
      pickedSecs = sec_100200;
      rangeLabel = '100-200km/h';
      targetSpeed = 200;
    } else if (sec_060 != null) {
      pickedSecs = sec_060;
      rangeLabel = '0-60mph';
      targetSpeed = 60;
    }
  }

  const detection = {
    brand: d.brand || null,
    model: null,
    year: d.year ? parseInt(d.year) : null,
    vehicle_type: vehicleType,
    range: rangeLabel,
    elapsed_ms: (typeof pickedSecs === 'number' ? Math.round(pickedSecs * 1000) : null),
    checkpoints: [],
    raw_overlay: d.raw_text || '',
    quarter_mile_ms: typeof d.quarter_mile_s === 'number' ? Math.round(d.quarter_mile_s * 1000) : null,
    target_speed: targetSpeed,
  };

  const final = {
    processor: 'python-easyocr',
    video: { path: filePath, filename: path.basename(filePath), size_bytes: stats.size },
    detections: [detection],
    summary: {
      range: detection.range,
      brand: detection.brand,
      model: detection.model,
      year: detection.year,
      best_elapsed_ms: detection.elapsed_ms,
      quarter_mile_ms: detection.quarter_mile_ms,
      all_results: null,
      error: detection.elapsed_ms == null ? `No time detected for requested range: ${rangeLabel}` : null,
    },
  };
  
  safeProgress(100, 'done');
  return final;
}

function validateAgainstProvided(summary, provided) {
  const reasons = [];
  if (!summary) return { verdict: 'unknown', reasons: ['no summary'] };
  if (provided?.brand && summary.brand && !String(summary.brand).toLowerCase().includes(String(provided.brand).toLowerCase())) {
    reasons.push('brand-mismatch');
  }
  if (provided?.year && summary.year && String(provided.year) !== String(summary.year)) {
    reasons.push('year-mismatch');
  }
  return { verdict: reasons.length === 0 ? 'ok' : 'mismatch', reasons };
}

module.exports = {
  processVideo,
  validateAgainstProvided,
};