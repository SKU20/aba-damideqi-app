// Smart SubscriptionService - Let backend tell us its IP
import AsyncStorage from '@react-native-async-storage/async-storage';

// Smart backend discovery (same pattern as your AuthService)
const discoverBackendUrl = async () => {
  const commonUrls = [
    process.env.EXPO_PUBLIC_API_URL,
    'http://localhost:3000/api',
    'http://127.0.0.1:3000/api',
     'http://192.168.0.12:3000/api',
    'http://192.168.100.98:3000/api', // Your home WiFi
    'http://172.20.10.2:3000/api',    // Your hotspot
  ].filter(Boolean);

  console.log('🔍 Discovering backend URL for subscriptions...');

  // Quick test of known URLs first
  for (const url of commonUrls) {
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
        if (data.success && data.localIPs) {
          console.log('✅ Backend found for subscriptions at:', url);
          
          // Store for future use
          await AsyncStorage.setItem('discoveredBackendUrl_subscription', url);
          await AsyncStorage.setItem('backendIPs_subscription', JSON.stringify(data.localIPs));
          
          return { url, backendIPs: data.localIPs };
        }
      }
    } catch (error) {
      continue;
    }
  }

  // Try stored discovery
  try {
    const storedUrl = await AsyncStorage.getItem('discoveredBackendUrl_subscription');
    const storedIPs = await AsyncStorage.getItem('backendIPs_subscription');
    
    if (storedUrl && storedIPs) {
      console.log('📱 Trying previously discovered URL for subscriptions:', storedUrl);
      
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
    console.log('Stored URL not working for subscriptions');
  }

  // Last resort: try URLs based on stored backend IPs
  try {
    const storedIPs = await AsyncStorage.getItem('backendIPs_subscription');
    if (storedIPs) {
      const ips = JSON.parse(storedIPs);
      console.log('🎯 Trying URLs from backend\'s reported IPs for subscriptions:', ips);
      
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
              console.log('✅ Found backend at reported IP for subscriptions:', url);
              await AsyncStorage.setItem('discoveredBackendUrl_subscription', url);
              return { url, backendIPs: data.localIPs };
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
  } catch (error) {
    console.log('Could not use stored IPs for subscriptions');
  }

  console.log('❌ Could not discover backend URL for subscriptions');
  return null;
};

class SubscriptionService {
  constructor() {
    this.apiUrl = null;
    this.backendIPs = [];
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('🚀 Initializing Smart SubscriptionService...');
      
      if (!__DEV__) {
        this.apiUrl = process.env.EXPO_PUBLIC_API_URL;
        console.log('🌍 Production mode - using for subscriptions:', this.apiUrl);
      } else {
        const discovery = await discoverBackendUrl();
        if (discovery) {
          this.apiUrl = discovery.url;
          this.backendIPs = discovery.backendIPs;
        } else {
          // Fallback
          this.apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
        }
        console.log('🔧 Development mode - using for subscriptions:', this.apiUrl);
      }

      this.isInitialized = true;
      console.log('🎉 Smart SubscriptionService ready');
      
    } catch (error) {
      console.error('❌ SubscriptionService initialization error:', error);
      this.apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
      this.isInitialized = true;
    }
  }

  async makeRequest(endpoint, options = {}) {
    await this.initialize();

    try {
      const url = `${this.apiUrl}${endpoint}`;
      
      const config = {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers,
        },
        ...options,
      };

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
        console.log('🔄 Network error in subscriptions - trying to rediscover backend...');
        const discovery = await discoverBackendUrl();
        if (discovery && discovery.url !== this.apiUrl) {
          this.apiUrl = discovery.url;
          console.log('🔄 Retrying subscriptions with:', this.apiUrl);
          return this.makeRequest(endpoint, options);
        }
      }

      throw error;
    }
  }

  // Subscription methods
  async fetchPlans() {
    try {
      console.log('📋 Fetching subscription plans...');
      const result = await this.makeRequest('/plans');
      
      console.log('✅ Plans fetched successfully');
      return {
        success: true,
        plans: result.plans || [],
      };
    } catch (error) {
      console.error('❌ Error fetching plans:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch plans',
        plans: []
      };
    }
  }

  async createSubscription(userId, planId) {
    try {
      console.log('💳 Creating subscription for user:', userId, 'plan:', planId);
      
      const result = await this.makeRequest('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          plan_id: planId
        }),
      });

      console.log('✅ Subscription created successfully');
      return {
        success: true,
        subscription: result.subscription,
        message: result.message
      };
    } catch (error) {
      console.error('❌ Error creating subscription:', error);
      return {
        success: false,
        error: error.message || 'Network error occurred'
      };
    }
  }

  async getUserSubscription(userId) {
    try {
      console.log('📱 Fetching subscription for user:', userId);
      
      const result = await this.makeRequest(`/subscriptions/${userId}`);

      console.log('✅ User subscription fetched');
      return {
        success: true,
        subscription: result.subscription
      };
    } catch (error) {
      console.error('❌ Error fetching user subscription:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch subscription',
        subscription: null
      };
    }
  }

  async cancelSubscription(subscriptionId, cancelReason = '') {
    try {
      console.log('❌ Canceling subscription:', subscriptionId);
      
      const result = await this.makeRequest(`/subscriptions/${subscriptionId}/cancel`, {
        method: 'PUT',
        body: JSON.stringify({
          cancel_reason: cancelReason
        }),
      });

      console.log('✅ Subscription canceled successfully');
      return {
        success: true,
        subscription: result.subscription,
        message: result.message
      };
    } catch (error) {
      console.error('❌ Error canceling subscription:', error);
      return {
        success: false,
        error: error.message || 'Network error occurred'
      };
    }
  }

  // Utility methods (same pattern as your AuthService)
  getApiUrl() { 
    return this.apiUrl; 
  }
  
  getBackendIPs() { 
    return this.backendIPs; 
  }

  async testConnection() {
    await this.initialize();

    try {
      console.log('🧪 Testing subscription service connection to:', this.apiUrl);
      
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Subscription service connection successful');
      console.log('🌐 Backend available at IPs:', data.localIPs);
      
      return { success: true, data };
      
    } catch (error) {
      console.error('❌ Subscription service connection failed:', error);

      // In development, try to rediscover
      if (__DEV__) {
        console.log('🔄 Attempting to rediscover backend for subscriptions...');
        const discovery = await discoverBackendUrl();
        if (discovery && discovery.url !== this.apiUrl) {
          this.apiUrl = discovery.url;
          this.backendIPs = discovery.backendIPs;
          console.log('🔄 Switched subscriptions to:', this.apiUrl);
          return this.testConnection();
        }
      }

      return {
        success: false,
        error: 'Cannot reach server for subscriptions - make sure backend is running'
      };
    }
  }

  async refreshDiscovery() {
    if (__DEV__) {
      await AsyncStorage.removeItem('discoveredBackendUrl_subscription');
      await AsyncStorage.removeItem('backendIPs_subscription');
      const discovery = await discoverBackendUrl();
      if (discovery) {
        this.apiUrl = discovery.url;
        this.backendIPs = discovery.backendIPs;
      }
    }
    return this.apiUrl;
  }
}

export default new SubscriptionService();