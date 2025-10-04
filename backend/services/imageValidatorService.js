const { spawn } = require('child_process');
const path = require('path');

// Run the Python validator script with a list of image paths and vehicle type
// Returns a Promise resolving to the parsed JSON result
function runPythonValidator({ vehicleType, imagePaths }) {
  return new Promise((resolve, reject) => {
    try {
      const scriptPath = path.join(__dirname, '..', 'scripts', 'image_validator.py');
      const args = ['-u', scriptPath, '--vehicle_type', vehicleType, ...imagePaths];

      console.log('[imageValidatorService] Attempting to run Python validator...');
      console.log('[imageValidatorService] Script path:', scriptPath);
      console.log('[imageValidatorService] Python binary:', process.env.PYTHON_BIN || 'python');
      console.log('[imageValidatorService] Args:', args);

      const py = spawn(process.env.PYTHON_BIN || 'python', args, {
        cwd: path.join(__dirname, '..'),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let out = '';
      let err = '';
      py.stdout.on('data', (d) => { out += d.toString(); });
      py.stderr.on('data', (d) => { err += d.toString(); });

      py.on('close', (code) => {
        if (code !== 0) {
          console.error('[imageValidatorService] Python validator failed with code:', code);
          console.error('[imageValidatorService] Error output:', err);
          return reject(new Error(err || `validator exited with code ${code}`));
        }
        try {
          const json = JSON.parse(out.trim());
          console.log('[imageValidatorService] Python validation result:', json);
          resolve(json);
        } catch (e) {
          console.error('[imageValidatorService] Failed to parse validator output:', e.message);
          console.error('[imageValidatorService] Raw output:', out);
          reject(new Error(`Failed to parse validator output: ${e.message}. Raw: ${out}`));
        }
      });

      // Timeout after 25 seconds
      setTimeout(() => {
        py.kill();
        reject(new Error('Python validation timeout'));
      }, 25000);

    } catch (e) {
      console.error('[imageValidatorService] Error starting Python validator:', e);
      reject(e);
    }
  });
}

// Fallback function when Python is not available
// Basic validation: require at least 2 photos for cars, 1 for motorcycles
function fallbackValidator({ vehicleType, imagePaths }) {
  console.log('[imageValidatorService] Using fallback validation (Python not available)');
  
  const minPhotos = vehicleType === 'car' ? 2 : 1;
  
  if (imagePaths.length < minPhotos) {
    return {
      ok: false,
      reason: `At least ${minPhotos} photos required for ${vehicleType}`,
      engineCount: 0,
      invalid: imagePaths.map((path, index) => ({
        path: path,
        reason: 'Insufficient photos',
        index: index
      })),
      predictions: []
    };
  }
  
  // Accept photos but warn that AI validation is unavailable
  return {
    ok: true,
    reason: 'Photos accepted (AI validation unavailable - please ensure photos are vehicle-related)',
    engineCount: vehicleType === 'car' ? 1 : 0, // Assume 1 engine photo
    invalid: [],
    predictions: imagePaths.map((path, index) => ({
      path: path,
      label: `${vehicleType} photo (not AI-verified)`,
      confidence: 0.5, // Lower confidence since not AI-verified
      index: index
    }))
  };
}

module.exports = { runPythonValidator, fallbackValidator };
