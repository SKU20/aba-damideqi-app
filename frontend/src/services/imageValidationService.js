// src/services/imageValidationService.js
// Client-side image validation using Hugging Face Inference API (CLIP zero-shot)
// IMPORTANT: Set EXPO_PUBLIC_HF_API_KEY in your environment for production use.

const HF_API_URL = 'https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32';

// Allowed categories per vehicleType
const CATEGORIES = {
  car: [
    'car exterior',
    'car interior',
    'car engine',
    'motorcycle',
    'truck',
    'person',
    'random object'
  ],
  motorcycle: [
    'motorcycle',
    'car exterior',
    'car interior',
    'car engine',
    'truck',
    'person',
    'random object'
  ]
};

async function classifyImageAsync(uri, labels) {
  const apiKey = process.env.EXPO_PUBLIC_HF_API_KEY;
  if (!apiKey) {
    return { label: null, confidence: 0, skipped: true };
  }

  try {
    // Fetch image bytes
    const res = await fetch(uri);
    const blob = await res.blob();

    const form = new FormData();
    form.append('inputs', blob);
    form.append('parameters', JSON.stringify({ candidate_labels: labels }));

    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      // On rate limiting or model cold start, bail gracefully
      return { label: null, confidence: 0, skipped: true };
    }

    const data = await response.json();
    // API returns array of { labels:[], scores:[] } or similar depending on model
    const labelsOut = data?.labels || data?.[0]?.labels || [];
    const scoresOut = data?.scores || data?.[0]?.scores || [];
    if (!Array.isArray(labelsOut) || labelsOut.length === 0) {
      return { label: null, confidence: 0, skipped: true };
    }
    const bestIdx = 0;
    const label = labelsOut[bestIdx];
    const confidence = scoresOut?.[bestIdx] ?? 0;
    return { label, confidence, skipped: false };
  } catch (e) {
    return { label: null, confidence: 0, skipped: true };
  }
}

// Validate a set of photos before upload
// photos: [{ uri, type, name }]
// vehicleType: 'car' | 'motorcycle'
export async function validateVehiclePhotos({ vehicleType, photos }) {
  const vt = (vehicleType || 'car').toLowerCase();
  const labels = CATEGORIES[vt];
  if (!Array.isArray(photos) || photos.length === 0) {
    return { ok: false, reason: 'No photos selected', engineCount: 0, invalid: [] };
  }

  let engineCount = 0;
  const invalid = [];
  let skippedAll = true;

  for (const p of photos) {
    const { label, confidence, skipped } = await classifyImageAsync(p.uri, labels);
    if (!skipped) skippedAll = false;

    const predicted = (label || '').toLowerCase();
    // Heuristics: accept only car categories for car; motorcycle images only for motorcycle
    if (vt === 'car') {
      if (predicted.includes('car engine')) engineCount += 1;
      const allowed = predicted.includes('car exterior') || predicted.includes('car interior') || predicted.includes('car engine');
      if (!allowed) invalid.push({ uri: p.uri, predicted });
    } else if (vt === 'motorcycle') {
      const allowed = predicted.includes('motorcycle');
      if (!allowed) invalid.push({ uri: p.uri, predicted });
    }
  }

  // If all calls were skipped (no API key / offline), don't block the user
  if (skippedAll) {
    return { ok: true, reason: 'Validation skipped', engineCount: 0, invalid: [] };
  }

  if (vt === 'car') {
    if (engineCount !== 1) {
      return { ok: false, reason: `You must include exactly 1 engine photo (found ${engineCount})`, engineCount, invalid };
    }
  }

  if (invalid.length > 0) {
    return { ok: false, reason: `Invalid photos: ${invalid.length}`, engineCount, invalid };
  }

  return { ok: true, reason: 'All photos valid', engineCount, invalid: [] };
}

export default {
  validateVehiclePhotos,
};
