import AsyncStorage from '@react-native-async-storage/async-storage';
import eventService from './eventService';
import authService from './authService';

class ProcessorService {
  constructor() {
    this.apiUrl = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized && this.apiUrl) return;
    // Use the same URL logic as CarService for consistency
    const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://aba-damideqi-app.onrender.com';
    this.apiUrl = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
    this.isInitialized = true;
    console.log('[ProcessorService] Initialized with API URL:', this.apiUrl);
  }

  async getAuthToken() {
    try {
      await authService.initialize();
      return authService.token;
    } catch (e) {
      console.error('[ProcessorService] Error getting auth token:', e);
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

    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Don't set Content-Type for FormData - let the browser set it with boundary

    const res = await fetch(`${this.apiUrl}/processor/dragy`, {
      method: 'POST',
      headers,
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

    console.log('[ProcessorService] Starting job with:', {
      apiUrl: this.apiUrl,
      hasToken: !!token,
      fileUri: file.uri,
      fileName: file.name,
      fileType: file.type,
      vehicleType,
      range
    });

    const form = new FormData();
    form.append('vehicleType', vehicleType || 'car');
    form.append('range', range || '0-60mph');
    if (providedBrand) form.append('providedBrand', providedBrand);
    if (providedYear) form.append('providedYear', String(providedYear));

    const filename = file.name || (file.uri.split('/').pop() || 'video.mp4');
    const match = /(\/|^)([^\/]+)$/.exec(filename);
    const name = match ? match[2] : filename;
    
    // Determine proper MIME type based on file extension
    let mimeType = 'video/mp4';
    if (name.toLowerCase().includes('.mp4')) {
      mimeType = 'video/mp4';
    } else if (name.toLowerCase().includes('.mov')) {
      mimeType = 'video/quicktime';
    } else if (name.toLowerCase().includes('.avi')) {
      mimeType = 'video/avi';
    } else if (name.toLowerCase().includes('.mkv')) {
      mimeType = 'video/x-matroska';
    }
    
    const type = file.type && file.type.startsWith('video/') ? file.type : mimeType;

    console.log('[ProcessorService] File details:', { filename, name, type });
    
    // Check file size if available
    if (file.fileSize) {
      const sizeMB = (file.fileSize / (1024 * 1024)).toFixed(2);
      console.log('[ProcessorService] 📊 File size:', `${sizeMB} MB (${file.fileSize} bytes)`);
    } else {
      console.log('[ProcessorService] ⚠️ File size not available in file object');
    }

    // Try a different approach - use the file URI directly but with proper FormData handling
    const fileObj = {
      uri: file.uri,
      name,
      type,
    };

    console.log('[ProcessorService] Appending file object:', fileObj);
    form.append('video', fileObj);

    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Don't set Content-Type for FormData - let the browser set it with boundary

    console.log('[ProcessorService] Making request to:', `${this.apiUrl}/processor/dragy/async`);

    try {
      // Add timeout for video uploads - increased to 5 minutes for large video files
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('[ProcessorService] Aborting request due to timeout...');
        controller.abort();
      }, 300000); // 5 minute timeout for video uploads

      console.log('[ProcessorService] Starting fetch request...');
      console.log('[ProcessorService] 📤 Uploading video file - this may take several minutes for large files...');
      const startTime = Date.now();

      const res = await fetch(`${this.apiUrl}/processor/dragy/async`, {
        method: 'POST',
        headers,
        body: form,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      const durationSeconds = Math.round(duration/1000);
      
      // Calculate upload speed if we have file size
      let speedInfo = '';
      if (file.fileSize) {
        const sizeMB = file.fileSize / (1024 * 1024);
        const speedMBps = (sizeMB / durationSeconds).toFixed(2);
        const speedKbps = ((file.fileSize * 8) / (duration / 1000) / 1024).toFixed(0);
        speedInfo = ` (${speedMBps} MB/s, ${speedKbps} Kbps)`;
      }
      
      console.log('[ProcessorService] ✅ Upload completed after', durationSeconds, 'seconds, status:', res.status + speedInfo);
      
      const data = await res.json();
      console.log('[ProcessorService] Response data:', data);
      
      if (!res.ok || !data.success || !data.jobId) {
        throw new Error(data.error || 'Failed to start processing job');
      }
      return { jobId: data.jobId };
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('[ProcessorService] Request timed out after 5 minutes');
        throw new Error('Upload timed out after 5 minutes - video file may be too large or connection is slow');
      }
      console.error('[ProcessorService] Request failed:', error);
      throw error;
    }
  }

  // Poll job progress. Calls onProgress(percent, stage, status). Resolves with result when done.
  async waitForDragyResult(jobId, { intervalMs = 2000, onProgress, signal } = {}) {
    console.log('[ProcessorService] 🎯 waitForDragyResult called with jobId:', jobId);
    console.log('[ProcessorService] 🎯 jobId type:', typeof jobId);
    console.log('[ProcessorService] 🎯 Parameters:', { intervalMs, hasOnProgress: !!onProgress, hasSignal: !!signal });
    
    await this.initialize();
    
    let token;
    try {
      token = await this.getAuthToken();
      console.log('[ProcessorService] 🔑 Auth token obtained:', !!token);
    } catch (authError) {
      console.error('[ProcessorService] ❌ Failed to get auth token:', authError);
      throw new Error('Authentication failed: ' + authError.message);
    }

    console.log('[ProcessorService] Starting to poll job:', jobId);

    const poll = async () => {
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      console.log('[ProcessorService] 🔍 Polling URL:', `${this.apiUrl}/processor/dragy/progress/${jobId}`);
      
      const resp = await fetch(`${this.apiUrl}/processor/dragy/progress/${jobId}`, {
        headers
      });
      
      console.log('[ProcessorService] 📡 Poll response status:', resp.status);
      
      const j = await resp.json();
      console.log('[ProcessorService] 📋 Poll response data:', j);
      
      if (!resp.ok || !j.success) {
        console.error('[ProcessorService] ❌ Progress check failed:', {
          status: resp.status,
          ok: resp.ok,
          success: j.success,
          error: j.error,
          fullResponse: j
        });
        throw new Error(j.error || 'Progress check failed');
      }
      
      console.log('[ProcessorService] Progress update:', { percent: j.percent, stage: j.stage, status: j.status });
      
      if (typeof onProgress === 'function') {
        try { 
          onProgress(j.percent ?? 0, j.stage ?? 'processing', j.status); 
        } catch (_) {}
      }

      if (j.status === 'done') return 'done';
      if (j.status === 'failed') throw new Error(j.error || 'Processing failed');
      return 'processing';
    };

    while (true) {
      if (signal?.aborted) throw new Error('Aborted');
      const status = await poll();
      if (status === 'done') break;
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    console.log('[ProcessorService] 🎯 Fetching final result for job:', jobId);
    console.log('[ProcessorService] 🔗 Result URL:', `${this.apiUrl}/processor/dragy/result/${jobId}`);
    
    const resResp = await fetch(`${this.apiUrl}/processor/dragy/result/${jobId}`, {
      headers
    });
    
    console.log('[ProcessorService] 📡 Result response status:', resResp.status);
    const resJson = await resResp.json();
    console.log('[ProcessorService] 📋 Result response data:', resJson);
    
    if (!resResp.ok || !resJson.success) {
      console.error('[ProcessorService] ❌ Result fetch failed:', {
        status: resResp.status,
        ok: resResp.ok,
        success: resJson.success,
        error: resJson.error,
        fullResponse: resJson
      });
      throw new Error(resJson.error || 'Result fetch failed');
    }
    
    console.log('[ProcessorService] ✅ Processing completed successfully');
    console.log('[ProcessorService] 🎉 Final result:', resJson.result);
    return resJson.result;
  }
}

export default new ProcessorService();
