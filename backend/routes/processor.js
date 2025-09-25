const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { processVideo, validateAgainstProvided } = require('../services/processor/pythonProcessor');


const router = express.Router();

// In-memory job store for async processing
// This is ephemeral and resets on server restart. For production, move to Redis or DB.
const jobs = new Map();
function createJobId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// Ensure temp upload directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.mp4');
    const base = path.basename(file.originalname || 'video', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fname = `${Date.now()}_${base}${ext || '.mp4'}`;
    cb(null, fname);
  },
});

// Accept video mime types
const fileFilter = (req, file, cb) => {
  const allowed = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/3gpp', 'video/avi', 'video/mpeg'];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  // Some devices may not send a valid mimetype; allow by extension as fallback
  const ext = (file.originalname || '').toLowerCase();
  if (ext.endsWith('.mp4') || ext.endsWith('.mov') || ext.endsWith('.mkv') || ext.endsWith('.3gp') || ext.endsWith('.avi') || ext.endsWith('.mpg') || ext.endsWith('.mpeg')) {
    return cb(null, true);
  }
  cb(new Error('Unsupported file type'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB limit

// POST /api/processor/dragy
// Multipart form: accept either field name "video" or "file"; optional fields: vehicleType, range
router.post('/dragy', upload.any(), async (req, res) => {
  const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
  const tempPath = file?.path;
  const { vehicleType, range, providedBrand, providedYear } = req.body || {};

  if (!tempPath) {
    return res.status(400).json({ success: false, error: 'No video uploaded' });
  }

  try {
    const result = await processVideo(tempPath, {
      vehicleType,
      range,
      pythonMode: true,
      singleFrameMode: false,
    });

    // Basic validation comparing detected vs provided car info
    if (result?.summary) {
      const validation = validateAgainstProvided(result.summary, { brand: providedBrand, year: providedYear });
      result.validation = validation;
    }

    // Clean up temp file
    try { fs.unlinkSync(tempPath); } catch (e) {}

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('Dragy processing error:', err);
    try { fs.unlinkSync(tempPath); } catch (e) {}
    return res.status(500).json({ success: false, error: 'Processing failed' });
  }
});

// POST /api/processor/dragy/async - start async job
router.post('/dragy/async', upload.single('video'), async (req, res) => {
  const tempPath = req.file?.path;
  const { vehicleType, range, providedBrand, providedYear } = req.body || {};

  if (!tempPath) {
    return res.status(400).json({ success: false, error: 'No video uploaded' });
  }

  const jobId = createJobId();
  jobs.set(jobId, {
    id: jobId,
    status: 'queued',
    percent: 0,
    stage: 'queued',
    error: null,
    result: null,
    createdAt: Date.now(),
  });

  // Kick off processing in background
  process.nextTick(async () => {
    const job = jobs.get(jobId);
    if (!job) return;
    job.status = 'processing';
    try {
      const result = await processVideo(tempPath, {
        vehicleType,
        range,
        pythonMode: true,
        singleFrameMode: false,
        onProgress: (percent, stage) => {
          const j = jobs.get(jobId);
          if (!j || j.status === 'done' || j.status === 'failed') return;
          j.percent = percent;
          j.stage = stage || 'processing';
        },
      });

      // Basic validation comparing detected vs provided car info
      if (result?.summary) {
        const validation = validateAgainstProvided(result.summary, { brand: providedBrand, year: providedYear });
        // Attach validation directly to the result so the client gets it from /result
        result.validation = validation;
        job.validation = validation; // keep for debugging/telemetry
      }

      job.status = 'done';
      job.result = result;
    } catch (e) {
      job.status = 'failed';
      job.error = e.message || 'Processing failed';
    } finally {
      try { fs.unlinkSync(tempPath); } catch (e) {}
      const j = jobs.get(jobId);
      if (j && j.status !== 'done' && j.status !== 'failed') {
        j.status = 'done';
      }
    }
  });

  return res.status(202).json({ success: true, jobId });
});

// GET /api/processor/dragy/progress/:id - poll progress
router.get('/dragy/progress/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  return res.json({ success: true, id: job.id, status: job.status, percent: job.percent, stage: job.stage });
});

// GET /api/processor/dragy/result/:id - fetch result when done
router.get('/dragy/result/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  if (job.status === 'done') return res.json({ success: true, result: job.result });
  if (job.status === 'failed') return res.status(500).json({ success: false, error: job.error || 'Processing failed' });
  return res.status(202).json({ success: false, error: 'Not ready' });
});

// Optional: DELETE /api/processor/dragy/job/:id - remove job from memory
router.delete('/dragy/job/:id', (req, res) => {
  const existed = jobs.delete(req.params.id);
  return res.json({ success: existed });
});

module.exports = router;
