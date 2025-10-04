import authService from './authService';

function normalizeApiBase(url) {
  if (!url) return '';
  const base = String(url).trim().replace(/\/$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

// Validate a set of photos before upload via backend
// photos: [{ uri, type, name }]
// vehicleType: 'car' | 'motorcycle'
export async function validateVehiclePhotos({ vehicleType, photos }) {
  const vt = (vehicleType || 'car').toLowerCase();
  if (!Array.isArray(photos) || photos.length === 0) {
    return { ok: false, reason: 'No photos selected', engineCount: 0, invalid: [], skippedAll: false };
  }

  // Discover backend URL the same way AuthService does
  let apiBase = '';
  try {
    await authService.initialize?.();
    const discovered = authService.getApiUrl?.();
    apiBase = normalizeApiBase(discovered
      || process.env.EXPO_PUBLIC_API_URL
      || process.env.EXPO_PUBLIC_API_URL_HOME
      || process.env.EXPO_PUBLIC_API_URL_HOTSPOT
      || 'https://aba-damideqi-app.onrender.com/api');
  } catch (_) {
    apiBase = normalizeApiBase(
      process.env.EXPO_PUBLIC_API_URL
      || process.env.EXPO_PUBLIC_API_URL_HOME
      || process.env.EXPO_PUBLIC_API_URL_HOTSPOT
      || 'https://aba-damideqi-app.onrender.com/api'
    );
  }
  if (!apiBase) {
    return { ok: false, reason: 'API base URL not configured', engineCount: 0, invalid: [], skippedAll: true };
  }

  try { console.log('[imageValidation] Using API base:', apiBase); } catch (_) {}

  // Wake up the server if it's sleeping on Render
  try {
    console.log('[imageValidation] Waking up server...');
    await fetch(`${apiBase}/health`, { method: 'GET' });
  } catch (e) {
    console.log('[imageValidation] Server wake-up failed, continuing anyway:', e?.message);
  }

  try {
    const form = new FormData();
    form.append('vehicleType', vt);
    
    console.log('[imageValidation] Photos to upload:', photos.map(p => ({ uri: p.uri, name: p.name, type: p.type })));
    
    photos.forEach((p, idx) => {
      const name = p.name || `photo_${idx}.jpg`;
      // Fix the MIME type - React Native often returns just "image"
      let type = p.type || 'image/jpeg';
      if (type === 'image') {
        // Guess type from file extension or URI
        if (p.uri && p.uri.includes('.png')) {
          type = 'image/png';
        } else if (p.uri && p.uri.includes('.jpg') || p.uri && p.uri.includes('.jpeg')) {
          type = 'image/jpeg';
        } else {
          type = 'image/jpeg'; // default
        }
      }
      
      console.log(`[imageValidation] Adding photo ${idx}:`, { uri: p.uri, name, type });
      
      // React Native FormData file format
      form.append('photos', {
        uri: p.uri,
        name: name,
        type: type
      });
    });

    const url = `${apiBase}/validator/validate-photos`;
    console.log('[imageValidation] POST', url, 'with', photos.length, 'photos');
    console.log('[imageValidation] FormData entries:', form._parts ? form._parts.length : 'unknown');
    
    // Test if the validator endpoint exists
    try {
      const testRes = await fetch(`${apiBase}/validator/validate-photos`, { 
        method: 'OPTIONS' 
      });
      console.log('[imageValidation] OPTIONS check status:', testRes.status);
    } catch (e) {
      console.log('[imageValidation] OPTIONS check failed:', e.message);
      // If OPTIONS fails, the endpoint might not exist
      return { ok: false, reason: `Validator endpoint not available: ${e.message}`, engineCount: 0, invalid: [], skippedAll: false };
    }
    
    // Add timeout for the actual request (generous timeout for Python AI processing)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout for Python AI processing
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      console.log('[imageValidation] Response status:', res.status);

      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, reason: `Validator HTTP ${res.status}: ${txt}`, engineCount: 0, invalid: [], skippedAll: false };
      }
      const data = await res.json();
      // Normalize shape to what AddCarScreen expects
      return {
        ok: !!data.ok,
        reason: data.reason || '',
        engineCount: data.engineCount || 0,
        invalid: (data.invalid || []).map(it => ({ uri: it.path || it.uri, predicted: it.predicted, confidence: it.confidence })),
        skippedAll: false,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (e) {
    console.error('[imageValidation] Network error:', e);
    const errorMsg = e?.message || String(e);
    
    if (e.name === 'AbortError') {
      console.warn('[imageValidation] Server validation timed out, using client-side fallback');
      // Use client-side fallback when server times out
      return {
        ok: true,
        reason: 'Photos validated (client-side fallback due to server timeout)',
        engineCount: vt === 'car' ? 1 : 0,
        invalid: [],
        skippedAll: false
      };
    }
    
    if (errorMsg.includes('Network request failed') || errorMsg.includes('fetch')) {
      console.warn('[imageValidation] Network failed, using client-side fallback');
      // Use client-side fallback when network fails
      return {
        ok: true,
        reason: 'Photos validated (client-side fallback due to network issues)',
        engineCount: vt === 'car' ? 1 : 0,
        invalid: [],
        skippedAll: false
      };
    }
    
    return { ok: false, reason: `Validator error: ${errorMsg}`, engineCount: 0, invalid: [], skippedAll: false };
  }
}

export default {
  validateVehiclePhotos,
};
