const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { runPythonValidator } = require('../services/imageValidatorService');

const router = express.Router();

// Simple test endpoint to check if validator is working
router.get('/test', (req, res) => {
  res.json({ 
    ok: true, 
    message: 'Validator endpoint is working',
    timestamp: new Date().toISOString()
  });
});

// Store uploads in a temp folder under backend/tmp
const tmpDir = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tmpDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random()*1e6)}${ext}`);
  }
});

const upload = multer({ storage });

// POST /api/validator/validate-photos
router.post('/validate-photos', upload.array('photos', 10), async (req, res) => {
  try {
    const vehicleType = (req.body.vehicleType || 'car').toLowerCase();
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ ok: false, reason: 'No files uploaded', invalid: [] });
    }

    const imagePaths = files.map(f => f.path);

    // Run Python validation to detect cars vs other objects
    console.log('[validator] Running Python validation for', files.length, 'files');
    let result;
    try {
      result = await runPythonValidator({ vehicleType, imagePaths });
      console.log('[validator] Python validation result:', result);
    } catch (pythonError) {
      console.warn('[validator] Python validator failed, using fallback:', pythonError.message);
      // Fallback: reject all photos if Python fails
      result = {
        ok: false,
        reason: 'Validation service temporarily unavailable',
        engineCount: 0,
        invalid: files.map((f, i) => ({ index: i, reason: 'Service error' })),
        predictions: []
      };
    }

    // Cleanup temp files
    imagePaths.forEach(p => { try { fs.unlinkSync(p); } catch (_) {} });

    return res.json(result);
  } catch (e) {
    console.error('[validator] Error:', e);
    return res.status(500).json({ ok: false, reason: e.message, invalid: [] });
  }
});

module.exports = router;
