const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { runPythonValidator } = require('../services/imageValidatorService');

const router = express.Router();

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

    const result = await runPythonValidator({ vehicleType, imagePaths });

    // Cleanup temp files
    imagePaths.forEach(p => { try { fs.unlinkSync(p); } catch (_) {} });

    return res.json(result);
  } catch (e) {
    console.error('[validator] Error:', e);
    return res.status(500).json({ ok: false, reason: e.message, invalid: [] });
  }
});

module.exports = router;
