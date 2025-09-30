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
      || 'http://localhost:3000/api');
  } catch (_) {
    apiBase = normalizeApiBase(
      process.env.EXPO_PUBLIC_API_URL
      || process.env.EXPO_PUBLIC_API_URL_HOME
      || process.env.EXPO_PUBLIC_API_URL_HOTSPOT
      || 'http://localhost:3000/api'
    );
  }
  if (!apiBase) {
    return { ok: false, reason: 'API base URL not configured', engineCount: 0, invalid: [], skippedAll: true };
  }

  try {
    const form = new FormData();
    form.append('vehicleType', vt);
    photos.forEach((p, idx) => {
      const name = p.name || `photo_${idx}.jpg`;
      const type = p.type || 'image/jpeg';
      form.append('photos', { uri: p.uri, name, type });
    });

    const url = `${apiBase}/validator/validate-photos`;
    try { console.log('[imageValidation] POST', url); } catch (_) {}
    const res = await fetch(url, {
      method: 'POST',
      headers: { },
      body: form,
    });

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
  } catch (e) {
    return { ok: false, reason: `Validator error: ${e?.message || e}`, engineCount: 0, invalid: [], skippedAll: false };
  }
}

export default {
  validateVehiclePhotos,
};
