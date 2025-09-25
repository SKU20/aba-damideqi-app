// frontend/src/services/eventService.js
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

  console.log('🔍 Discovering backend URL...');

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

class EventService {
  constructor() {
    this.apiUrl = null;
    this.backendIPs = [];
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('🚀 Initializing Smart EventService...');
      
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

      this.isInitialized = true;
      console.log('🎉 Smart EventService ready');
      
    } catch (error) {
      console.error('❌ Initialization error:', error);
      this.apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
      this.isInitialized = true;
    }
  }

  // Get auth token from AsyncStorage
  async getAuthToken() {
    try {
      const token = await AsyncStorage.getItem('authToken');
      return token;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  // Create new event
  async createEvent({ title, description, eventDate, eventTime, location, imageUri }) {
    try {
      await this.initialize();

      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('eventDate', eventDate);
      formData.append('eventTime', eventTime);
      formData.append('location', location);

      // Add image if provided
      if (imageUri) {
        const filename = imageUri.split('/').pop();
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image';

        formData.append('eventImage', {
          uri: imageUri,
          name: filename,
          type: type,
        });
      }

      const url = `${this.apiUrl}/events`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create event');
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
          console.log('🔄 Retrying createEvent with:', this.apiUrl);
          return this.createEvent({ title, description, eventDate, eventTime, location, imageUri });
        }
      }

      console.error('Error creating event:', error);
      throw error;
    }
  }

  // Make authenticated request
  async makeRequest(endpoint, options = {}) {
    await this.initialize();

    const token = await this.getAuthToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const url = `${this.apiUrl}${endpoint}`;
    const config = {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
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
          console.log('🔄 Retrying request with:', this.apiUrl);
          return this.makeRequest(endpoint, options);
        }
      }

      throw error;
    }
  }

  // Get user's events
  async deleteEvent(eventId) {
    try {
      const response = await this.makeRequest(`/events/${eventId}`, {
        method: 'DELETE',
      });
      return response;
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }

  async addEventInterest(eventId) {
    try {
      const response = await this.makeRequest(`/events/${eventId}/interest`, {
        method: 'POST',
      });
      return response;
    } catch (error) {
      console.error('Error adding event interest:', error);
      throw error;
    }
  }

  // Check if current user has expressed interest in this event (user-specific)
  async getInterestStatus(eventId) {
    try {
      const response = await this.makeRequest(`/events/${eventId}/interest/status`, {
        method: 'GET',
      });
      // Expected response: { success: true, interested: boolean, interestedCount: number }
      return response;
    } catch (error) {
      console.error('Error fetching interest status:', error);
      throw error;
    }
  }

  // Get user's events
  async getMyEvents() {
    try {
      return await this.makeRequest('/events/my', {
        method: 'GET'
      });
    } catch (error) {
      console.error('Error fetching user events:', error);
      throw error;
    }
  }

  // Get all public events
  async getAllEvents() {
    try {
      return await this.makeRequest('/events', {
        method: 'GET'
      });
    } catch (error) {
      console.error('Error fetching all events:', error);
      throw error;
    }
  }

  // Utility methods
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

export default new EventService();