// AuthService - Simple direct connection
import AsyncStorage from '@react-native-async-storage/async-storage';

class AuthService {
  constructor() {
    this.token = null;
    this.user = null;
    this.apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://aba-damideqi-app.onrender.com/api';
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      const [token, userData] = await Promise.all([
        AsyncStorage.getItem('authToken'),
        AsyncStorage.getItem('userData')
      ]);

      if (token && userData) {
        this.token = token;
        this.user = JSON.parse(userData);
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('Initialization error:', error);
      this.isInitialized = true;
    }
  }

  async testConnection() {
    await this.initialize();

    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data };
      
    } catch (error) {
      console.error('Connection failed:', error);
      return {
        success: false,
        error: 'Cannot reach server - make sure backend is running'
      };
    }
  }

  async makeRequest(endpoint, options = {}) {
    await this.initialize();

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
  }

  // Session management methods
  async storeSession(token, user, profile = null) {
    try {
      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('userData', JSON.stringify({ ...user, profile }));
      
      this.token = token;
      this.user = { ...user, profile };
      
      return true;
    } catch (error) {
      console.error('Error storing session:', error);
      return false;
    }
  }

  async clearSession() {
    try {
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userData');
      
      this.token = null;
      this.user = null;
      
      return true;
    } catch (error) {
      console.error('Error clearing session:', error);
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

  // Verify email with code
  async verifyEmail(email, code) {
    try {
      const response = await fetch(`${this.apiUrl}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Resend verification code
  async resendVerificationCode(email) {
    try {
      const response = await fetch(`${this.apiUrl}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default new AuthService();