const { spawn } = require('child_process');
const path = require('path');

// Run the Python validator script with a list of image paths and vehicle type
// Returns a Promise resolving to the parsed JSON result
function runPythonValidator({ vehicleType, imagePaths }) {
  return new Promise((resolve, reject) => {
    try {
      const scriptPath = path.join(__dirname, '..', 'scripts', 'image_validator.py');
      const args = ['-u', scriptPath, '--vehicle_type', vehicleType, ...imagePaths];

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
          return reject(new Error(err || `validator exited with code ${code}`));
        }
        try {
          const json = JSON.parse(out.trim());
          resolve(json);
        } catch (e) {
          reject(new Error(`Failed to parse validator output: ${e.message}. Raw: ${out}`));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { runPythonValidator };
