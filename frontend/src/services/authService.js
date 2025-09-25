// Smart AuthService - Let backend tell us its IP
import AsyncStorage from '@react-native-async-storage/async-storage';

// Simple and secure - backend tells us where it is
const discoverBackendUrl = async () => {
  // Start with common development URLs
  const commonUrls = [
    process.env.EXPO_PUBLIC_API_URL,
    'http://localhost:3000/api',
    'http://127.0.0.1:3000/api',
     'http://192.168.0.12:3000/api',
    'http://192.168.100.98:3000/api', // Your home WiFi
    'http://172.20.10.2:3000/api',    // Your hotspot
  ].filter(Boolean);

  // Quick test of known URLs first
  for (const url of commonUrls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500); // Quick timeout
      
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.localIPs) {
          console.log('✅ Backend found at:', url);
          console.log('🌐 Backend reports it\'s available at:', data.localIPs);
          
          // Store for future use
          await AsyncStorage.setItem('discoveredBackendUrl', url);
          await AsyncStorage.setItem('backendIPs', JSON.stringify(data.localIPs));
          
          return { url, backendIPs: data.localIPs };
        }
      }
    } catch (error) {
      continue; // Try next URL
    }
  }

  // If no common URLs work, try the stored discovery
  try {
    const storedUrl = await AsyncStorage.getItem('discoveredBackendUrl');
    const storedIPs = await AsyncStorage.getItem('backendIPs');
    
    if (storedUrl && storedIPs) {
      console.log('📱 Trying previously discovered URL:', storedUrl);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`${storedUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          return { 
            url: storedUrl, 
            backendIPs: JSON.parse(storedIPs) 
          };
        }
      }
    }
  } catch (error) {
    console.log('Stored URL not working');
  }

  // Last resort: try URLs based on stored backend IPs
  try {
    const storedIPs = await AsyncStorage.getItem('backendIPs');
    if (storedIPs) {
      const ips = JSON.parse(storedIPs);
      console.log('🎯 Trying URLs from backend\'s reported IPs:', ips);
      
      for (const ip of ips) {
        const url = `http://${ip}:3000/api`;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1500);
          
          const response = await fetch(`${url}/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              console.log('✅ Found backend at reported IP:', url);
              await AsyncStorage.setItem('discoveredBackendUrl', url);
              return { url, backendIPs: data.localIPs };
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
  } catch (error) {
    console.log('Could not use stored IPs');
  }

  console.log('❌ Could not discover backend URL');
  return null;
};

class AuthService {
  constructor() {
    this.token = null;
    this.user = null;
    this.apiUrl = null;
    this.backendIPs = [];
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('🚀 Initializing Smart AuthService...');
      
      if (!__DEV__) {
        this.apiUrl = process.env.EXPO_PUBLIC_API_URL;
        console.log('🌍 Production mode - using:', this.apiUrl);
      } else {
        const discovery = await discoverBackendUrl();
        if (discovery) {
          this.apiUrl = discovery.url;
          this.backendIPs = discovery.backendIPs;
        } else {
          // Fallback
          this.apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
        }
        console.log('🔧 Development mode - using:', this.apiUrl);
      }

      const [token, userData] = await Promise.all([
        AsyncStorage.getItem('authToken'),
        AsyncStorage.getItem('userData')
      ]);

      if (token && userData) {
        this.token = token;
        this.user = JSON.parse(userData);
        console.log('✅ Session restored');
      }

      this.isInitialized = true;
      console.log('🎉 Smart AuthService ready');
      
    } catch (error) {
      console.error('❌ Initialization error:', error);
      this.apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
      this.isInitialized = true;
    }
  }

  async testConnection() {
    await this.initialize();

    try {
      console.log('🧪 Testing connection to:', this.apiUrl);
      
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Connection successful');
      console.log('🌐 Backend available at IPs:', data.localIPs);
      
      return { success: true, data };
      
    } catch (error) {
      console.error('❌ Connection failed:', error);

      // In development, try to rediscover
      if (__DEV__) {
        console.log('🔄 Attempting to rediscover backend...');
        const discovery = await discoverBackendUrl();
        if (discovery && discovery.url !== this.apiUrl) {
          this.apiUrl = discovery.url;
          this.backendIPs = discovery.backendIPs;
          console.log('🔄 Switched to:', this.apiUrl);
          return this.testConnection();
        }
      }

      return {
        success: false,
        error: 'Cannot reach server - make sure backend is running'
      };
    }
  }

  async makeRequest(endpoint, options = {}) {
    await this.initialize();

    try {
      const url = `${this.apiUrl}${endpoint}`;
      
      const config = {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      };

      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }

      const response = await fetch(url, config);
      
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('Invalid server response');
      }

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
      
    } catch (error) {
      // In development, try to rediscover on network errors
      if (__DEV__ && (
        error.message.includes('Network request failed') || 
        error.message.includes('fetch')
      )) {
        console.log('🔄 Network error - trying to rediscover backend...');
        const discovery = await discoverBackendUrl();
        if (discovery && discovery.url !== this.apiUrl) {
          this.apiUrl = discovery.url;
          console.log('🔄 Retrying with:', this.apiUrl);
          return this.makeRequest(endpoint, options);
        }
      }

      throw error;
    }
  }

  // Session management methods
  async storeSession(token, user, profile = null) {
    try {
      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('userData', JSON.stringify({ ...user, profile }));
      
      this.token = token;
      this.user = { ...user, profile };
      
      console.log('✅ Session stored');
      return true;
    } catch (error) {
      console.error('❌ Error storing session:', error);
      return false;
    }
  }

  async clearSession() {
    try {
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userData');
      
      this.token = null;
      this.user = null;
      
      console.log('✅ Session cleared');
      return true;
    } catch (error) {
      console.error('❌ Error clearing session:', error);
      return false;
    }
  }

  // Authentication methods
  async signUp(email, password, profile) {
    try {
      const result = await this.makeRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, ...profile })
      });
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async signIn(email, password) {
    try {
      const result = await this.makeRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (result.success && result.data?.session?.access_token) {
        await this.storeSession(
          result.data.session.access_token,
          result.data.user,
          result.data.profile
        );
      }

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async signOut() {
    try {
      if (this.token) {
        try {
          await this.makeRequest('/auth/logout', { method: 'POST' });
        } catch (error) {
          console.log('Server logout failed, continuing with local logout');
        }
      }
      
      await this.clearSession();
      return { success: true, message: 'Logged out successfully' };
    } catch (error) {
      await this.clearSession();
      return { success: false, error: error.message };
    }
  }

  async getCurrentUser() {
    try {
      if (!this.token) {
        return { success: false, error: 'No active session' };
      }
      return await this.makeRequest('/auth/me');
          } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async checkUsernameAvailability(username) {
    try {
      return await this.makeRequest('/auth/check-username', {
        method: 'POST',
        body: JSON.stringify({ username })
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Utility methods
  getStoredUser() { return this.user; }
  isAuthenticated() { return !!this.token; }
  getApiUrl() { return this.apiUrl; }
  getBackendIPs() { return this.backendIPs; }


  async refreshDiscovery() {
    if (__DEV__) {
      await AsyncStorage.removeItem('discoveredBackendUrl');
      await AsyncStorage.removeItem('backendIPs');
      const discovery = await discoverBackendUrl();
      if (discovery) {
        this.apiUrl = discovery.url;
        this.backendIPs = discovery.backendIPs;
      }
    }
    return this.apiUrl;
  }
}

export default new AuthService();