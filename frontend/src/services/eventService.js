// EventService - Simple direct connection
import AsyncStorage from '@react-native-async-storage/async-storage';

class EventService {
  constructor() {
    this.apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://aba-damideqi-app.onrender.com/api';
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
      console.error('Error creating event:', error);
      throw error;
    }
  }

  // Make authenticated request
  async makeRequest(endpoint, options = {}) {
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

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  // Delete event
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

  // Check if current user has expressed interest in this event
  async getInterestStatus(eventId) {
    try {
      const response = await this.makeRequest(`/events/${eventId}/interest/status`, {
        method: 'GET',
      });
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

  // Utility method
  getApiUrl() { return this.apiUrl; }
}

export default new EventService();