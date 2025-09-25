import AsyncStorage from '@react-native-async-storage/async-storage';
import eventService from './eventService';

class ProcessorService {
  constructor() {
    this.apiUrl = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized && this.apiUrl) return;
    // Reuse eventService discovery
    await eventService.initialize?.();
    this.apiUrl = eventService.getApiUrl?.() || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
    this.isInitialized = true;
  }

  async getAuthToken() {
    try {
      const token = await AsyncStorage.getItem('authToken');
      return token;
    } catch (e) {
      return null;
    }
  }

  async uploadDragy({ file, vehicleType, range, providedBrand, providedYear }) {
    await this.initialize();
    const token = await this.getAuthToken();

    if (!file?.uri) throw new Error('No video selected');

    const form = new FormData();
    form.append('vehicleType', vehicleType || 'car');
    form.append('range', range || '0-100');
    if (providedBrand) form.append('providedBrand', providedBrand);
    if (providedYear) form.append('providedYear', String(providedYear));

    const filename = file.name || (file.uri.split('/').pop() || 'video.mp4');
    const match = /(\.[a-zA-Z0-9]+)$/.exec(filename);
    const type = file.type || (match ? `video/${match[1].replace('.', '')}` : 'video/mp4');

    form.append('video', {
      uri: file.uri,
      name: filename,
      type,
    });

    const res = await fetch(`${this.apiUrl}/processor/dragy`, {
      method: 'POST',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'multipart/form-data',
      },
      body: form,
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Processing failed');
    }
    return data.result;
  }

  // Start async job for dragy processing, returns { jobId }
  async startDragyJob({ file, vehicleType, range, providedBrand, providedYear }) {
    await this.initialize();
    const token = await this.getAuthToken();

    if (!file?.uri) throw new Error('No video selected');

    const form = new FormData();
    form.append('vehicleType', vehicleType || 'car');
    form.append('range', range || '0-60mph');
    if (providedBrand) form.append('providedBrand', providedBrand);
    if (providedYear) form.append('providedYear', String(providedYear));

    const filename = file.name || (file.uri.split('/').pop() || 'video.mp4');
    const match = /(\/|^)([^\/]+)$/.exec(filename);
    const name = match ? match[2] : filename;
    const extMatch = /\.(\w+)$/.exec(name);
    const type = file.type || (extMatch ? `video/${extMatch[1]}` : 'video/mp4');

    form.append('video', {
      uri: file.uri,
      name,
      type,
    });

    const res = await fetch(`${this.apiUrl}/processor/dragy/async`, {
      method: 'POST',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'multipart/form-data',
      },
      body: form,
    });

    const data = await res.json();
    if (!res.ok || !data.success || !data.jobId) {
      throw new Error(data.error || 'Failed to start processing job');
    }
    return { jobId: data.jobId };
  }

  // Poll job progress. Calls onProgress(percent, stage, status). Resolves with result when done.
  async waitForDragyResult(jobId, { intervalMs = 1000, onProgress, signal } = {}) {
    await this.initialize();

    const poll = async () => {
      const resp = await fetch(`${this.apiUrl}/processor/dragy/progress/${jobId}`);
      const j = await resp.json();
      if (!resp.ok || !j.success) throw new Error(j.error || 'Progress check failed');
      if (typeof onProgress === 'function') {
        try { onProgress(j.percent ?? 0, j.stage ?? 'processing', j.status); } catch (_) {}
      }

      if (j.status === 'done') return 'done';
      if (j.status === 'failed') throw new Error('Processing failed');
      return 'processing';
    };

    while (true) {
      if (signal?.aborted) throw new Error('Aborted');
      const status = await poll();
      if (status === 'done') break;
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    const resResp = await fetch(`${this.apiUrl}/processor/dragy/result/${jobId}`);
    const resJson = await resResp.json();
    if (!resResp.ok || !resJson.success) throw new Error(resJson.error || 'Result fetch failed');
    return resJson.result;
  }
}

export default new ProcessorService();
