// CarService.js - Updated with pagination support for infinite queries
import AsyncStorage from '@react-native-async-storage/async-storage';
import authService from './authService';

class CarService {
  constructor() {
    const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://aba-damideqi-app.onrender.com';
    // Ensure the URL ends with /api
    this.API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
  }

  // Get auth token directly from AsyncStorage
  async getAuthToken() {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        console.log('[CarService] No token found in storage');
        return null;
      }
      
      console.log('[CarService] Token found, length:', token.length);
      return token;
    } catch (error) {
      console.error('[CarService] Error getting auth token:', error);
      return null;
    }
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.API_BASE_URL}${endpoint}`;

    // Attach Authorization when available
    let token = await this.getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    // Create abort controller with 60s timeout for cold starts
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    console.log(`[API] 🚀 Request started: ${endpoint}`);
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      console.log(`[API] ✅ Response received: ${endpoint} (${duration}ms)`);

      // Attempt to parse JSON even on error for better messages
      let data = null;
      try { data = await response.json(); } catch (_) {}

      if (!response.ok) {
        const msg = (data && (data.error || data.message)) || `HTTP error! status: ${response.status}`;
        
        // If token is invalid, try to refresh it once
        if (response.status === 401 && (msg.includes('Invalid') || msg.includes('expired') || msg.includes('token') || msg.includes('required'))) {
          console.log('[CarService] Token expired, attempting refresh...');
          
          // Try to refresh token using AuthService
          try {
            const refreshResult = await authService.refreshAuthToken();
            if (refreshResult.success) {
              console.log('[CarService] Token refreshed, retrying request...');
              
              // Retry the request with new token
              const newToken = await this.getAuthToken();
              const newHeaders = {
                ...headers,
                'Authorization': `Bearer ${newToken}`
              };
              
              const retryResponse = await fetch(url, {
                ...options,
                headers: newHeaders,
                signal: controller.signal,
              });
              
              if (retryResponse.ok) {
                let retryData = null;
                try { retryData = await retryResponse.json(); } catch (_) {}
                return retryData;
              }
            }
          } catch (refreshError) {
            console.error('[CarService] Token refresh failed:', refreshError);
          }
          
          // If refresh failed, clear tokens and throw session expired
          console.warn('[CarService] Token invalid, clearing from storage. Error:', msg);
          await AsyncStorage.removeItem('authToken');
          await AsyncStorage.removeItem('userData');
          throw new Error('SESSION_EXPIRED');
        }
        
        throw new Error(msg);
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      console.error(`[API] ❌ Request failed: ${endpoint} (${duration}ms)`, error.message);
      throw error;
    }
  }

  // Get brands by vehicle type (car or motorcycle)
  async getBrands(vehicleType = 'car') {
    try {
      const vt = encodeURIComponent(vehicleType);
      const result = await this.makeRequest(`/cars/brands?vehicleType=${vt}`);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch brands');
      }

      return result.data;
    } catch (error) {
      console.error('Error fetching brands:', error);
      throw error;
    }
  }

  // Get models by brand ID and vehicle type
  async getModelsByBrand(brandId, vehicleType = 'car') {
    try {
      const vt = encodeURIComponent(vehicleType);
      const result = await this.makeRequest(`/cars/brands/${brandId}/models?vehicleType=${vt}`);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch models');
      }

      return result.data;
    } catch (error) {
      console.error('Error fetching models:', error);
      throw error;
    }
  }

  // UPDATED: Get all cars with pagination support for infinite scroll
  async getAllCars({ 
    pageParam = 0, 
    limit = 10, 
    vehicleType = null, 
    city = null, 
    searchQuery = '', 
    sortBy = 'newest' 
  } = {}) {
    try {
      const params = new URLSearchParams();
      params.append('page', pageParam.toString());
      params.append('limit', limit.toString());
      params.append('includeOwner', 'true');
      
      if (vehicleType) params.append('vehicleType', vehicleType);
      if (city) params.append('city', city);
      if (searchQuery) params.append('search', searchQuery);
      if (sortBy) params.append('sortBy', sortBy);

      const result = await this.makeRequest(`/cars/all?${params.toString()}`);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch all cars');
      }

      // Return format expected by useInfiniteQuery
      return {
        data: result.data || [],
        nextPage: result.data && result.data.length === limit ? pageParam + 1 : undefined,
        hasNextPage: result.data && result.data.length === limit,
        totalCount: result.totalCount || 0
      };
    } catch (error) {
      console.error('Error fetching all cars:', error);
      throw error;
    }
  }

  // UPDATED: Get user's cars with pagination support
  async getUserCars({ userId, pageParam = 0, limit = 10 } = {}) {
    try {
      if (!userId) {
        return {
          data: [],
          nextPage: undefined,
          hasNextPage: false,
          totalCount: 0
        };
      }

      const params = new URLSearchParams();
      params.append('page', pageParam.toString());
      params.append('limit', limit.toString());
      params.append('includeOwner', 'true');

      const result = await this.makeRequest(`/cars/user/${userId}?${params.toString()}`);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch user cars');
      }

      return {
        data: result.data || [],
        nextPage: result.data && result.data.length === limit ? pageParam + 1 : undefined,
        hasNextPage: result.data && result.data.length === limit,
        totalCount: result.totalCount || 0
      };
    } catch (error) {
      console.error('Error fetching user cars:', error);
      throw error;
    }
  }

  // LEGACY: Backwards compatible methods (for existing code that doesn't use pagination)
  async getAllCarsLegacy(limit = 50, offset = 0) {
    const page = Math.floor(offset / limit);
    const result = await this.getAllCars({ pageParam: page, limit });
    return result.data;
  }

  async getUserCarsLegacy(userId) {
    const result = await this.getUserCars({ userId, limit: 100 }); // Get more for legacy
    return result.data;
  }

  // NEW: Get single car with owner information
  async getCarWithOwner(carId) {
    try {
      const result = await this.makeRequest(`/cars/${carId}?includeOwner=true`);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch car');
      }

      return result.data;
    } catch (error) {
      console.error('Error fetching car with owner:', error);
      throw error;
    }
  }

  // UPDATED: Get cars with owners with pagination
  async getCarsWithOwners({ 
    userId = null, 
    pageParam = 0, 
    limit = 10, 
    vehicleType = null,
    city = null 
  } = {}) {
    try {
      const params = new URLSearchParams();
      params.append('page', pageParam.toString());
      params.append('limit', limit.toString());
      
      if (userId) params.append('userId', userId);
      if (vehicleType) params.append('vehicleType', vehicleType);
      if (city) params.append('city', city);

      const result = await this.makeRequest(`/cars/with-owners?${params.toString()}`);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch cars with owners');
      }

      return {
        data: result.data || [],
        nextPage: result.data && result.data.length === limit ? pageParam + 1 : undefined,
        hasNextPage: result.data && result.data.length === limit,
        totalCount: result.totalCount || 0
      };
    } catch (error) {
      console.error('Error fetching cars with owners:', error);
      throw error;
    }
  }

  // Add new car (no auth required - userId in route)
  async addCar(userId, carData) {
    try {
      const url = `${this.API_BASE_URL}/cars/user/${userId}`;
      
      console.log('[CarService] Adding car without auth token');
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(carData),
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to add car');
      }

      return result.data;
    } catch (error) {
      console.error('Error adding car:', error);
      throw error;
    }
  }

  // Update car
  async updateCar(userId, carId, carData) {
    try {
      const result = await this.makeRequest(`/cars/user/${userId}/${carId}`, {
        method: 'PUT',
        body: JSON.stringify(carData),
      });
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to update car');
      }

      return result.data;
    } catch (error) {
      console.error('Error updating car:', error);
      throw error;
    }
  }

  // Delete car
  async deleteCar(userId, carId) {
    try {
      const result = await this.makeRequest(`/cars/user/${userId}/${carId}`, {
        method: 'DELETE',
      });
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to delete car');
      }

      return result;
    } catch (error) {
      console.error('Error deleting car:', error);
      throw error;
    }
  }

  // Upload car photos one by one for better reliability
  // In CarService.js - Replace uploadCarPhotos method

async uploadCarPhotos(carId, userId, photos) {
  if (!photos || photos.length === 0) {
    return { success: true, uploadedCount: 0 };
  }

  console.log('[CarService] Uploading photos without auth token');
  
  // No auth headers needed - userId is in the request body
  const headers = {};
  // Don't set Content-Type for FormData - let the browser set it with boundary

  let uploadedCount = 0;
  const failedUploads = [];

  // Upload photos one by one with retry logic
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    let uploaded = false;
    let lastError = null;
    
    // Try up to 3 times per photo
    for (let attempt = 1; attempt <= 3 && !uploaded; attempt++) {
      try {
        console.log(`[CarService] Uploading photo ${i + 1}/${photos.length} (attempt ${attempt}/3)`);
        
        const formData = new FormData();
        formData.append('carId', carId);
        formData.append('userId', userId);
        
        // React Native requires this specific format for file uploads
        // Determine the correct MIME type based on file extension
        let mimeType = 'image/jpeg';
        if (photo.uri.toLowerCase().includes('.png')) {
          mimeType = 'image/png';
        } else if (photo.uri.toLowerCase().includes('.jpg') || photo.uri.toLowerCase().includes('.jpeg')) {
          mimeType = 'image/jpeg';
        }
        
        const fileObj = {
          uri: photo.uri,
          type: mimeType,
          name: photo.name || `photo_${i}.jpg`,
        };
        
        // Use 'photos' as the field name (matching backend expectation)
        formData.append('photos', fileObj);

        // 30 second timeout per attempt
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
          console.log(`[CarService] Uploading to: ${this.API_BASE_URL}/cars/photos/upload`);
          console.log(`[CarService] FormData contents:`, {
            carId,
            userId,
            photoUri: photo.uri,
            photoType: mimeType,
            photoName: photo.name || `photo_${i}.jpg`,
            fileObj: fileObj
          });
          
          const response = await fetch(`${this.API_BASE_URL}/cars/photos/upload`, {
            method: 'POST',
            headers,
            body: formData,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          
          console.log(`[CarService] Response status: ${response.status}`);

          if (response.ok) {
            const result = await response.json();
            console.log(`[CarService] Response data:`, result);
            if (result.success) {
              uploadedCount++;
              uploaded = true;
              console.log(`[CarService] Photo ${i + 1} uploaded successfully`);
            } else {
              lastError = result.message;
              console.warn(`[CarService] Upload failed with message:`, result.message);
            }
          } else {
            const errorText = await response.text();
            lastError = `HTTP ${response.status}: ${errorText}`;
            console.warn(`[CarService] HTTP error:`, lastError);
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          lastError = fetchError.name === 'AbortError' ? 'Timeout' : fetchError.message;
          console.warn(`[CarService] Photo ${i + 1} attempt ${attempt} failed:`, lastError);
          console.warn(`[CarService] Fetch error details:`, fetchError);
          
          // Wait before retry (exponential backoff)
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          }
        }
      } catch (error) {
        lastError = error.message;
        console.warn(`[CarService] Photo ${i + 1} attempt ${attempt} error:`, lastError);
      }
    }
    
    if (!uploaded) {
      failedUploads.push({ index: i, error: lastError });
    }
  }

  if (uploadedCount === 0) {
    throw new Error(`All photo uploads failed. First error: ${failedUploads[0]?.error || 'Unknown error'}`);
  }

  if (failedUploads.length > 0) {
    console.warn(`[CarService] ${failedUploads.length} photos failed to upload after retries`);
  }

  return { 
    success: true, 
    uploadedCount, 
    totalCount: photos.length,
    failedCount: failedUploads.length 
  };
}
  // Delete a photo
  async deletePhoto(photoId, userId) {
    try {
      const result = await this.makeRequest(`/cars/photos/${photoId}`, {
        method: 'DELETE',
        body: JSON.stringify({ userId }),
      });
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to delete photo');
      }

      return result;
    } catch (error) {
      console.error('Error deleting photo:', error);
      throw error;
    }
  }

  formatCarDataForAPI(carData) {
    return {
      vehicleType: carData.vehicleType,
      customVehicleType: carData.customVehicleType,
      year: carData.year,
      brandId: carData.brandId,
      customBrand: carData.customBrand,
      modelId: carData.modelId,
      customModel: carData.customModel,
      engineVolume: carData.engineVolume,
      horsepower: carData.horsepower,
      isStock: carData.isStock,
      nonStockComment: carData.nonStockComment,
      motorcycleType: carData.motorcycleType,
      driveType: carData.driveType
    };
  }

  // Vehicle types for local use (since these are static)
  getVehicleTypes() {
    return [
      { id: 'car', name_ka: 'მანქანა', name_en: 'Car' },
      { id: 'motorcycle', name_ka: 'მოტოციკლეტი', name_en: 'Motorcycle' }
    ];
  }

  getMotorcycleTypes() {
    return [
      { id: 'sport', name_ka: 'სპორტული', name_en: 'Sport' },
      { id: 'cruiser', name_ka: 'კრუიზერი', name_en: 'Cruiser' },
      { id: 'touring', name_ka: 'ტურინგი', name_en: 'Touring' },
      { id: 'dirt', name_ka: 'ენდურო / ოფროუდი', name_en: 'Dirt/Off-road' },
      { id: 'scooter', name_ka: 'სკუტერი', name_en: 'Scooter' },
      { id: 'chopper', name_ka: 'ჩოპერი', name_en: 'Chopper' },
      { id: 'naked', name_ka: 'ნეიკედი', name_en: 'Naked' },
      { id: 'adventure', name_ka: 'ადვენჩერი', name_en: 'Adventure' },
      { id: 'custom', name_ka: 'ქსთომი', name_en: 'Custom' }
    ];
  }
  
  // Get drive types for motorcycles
  getDriveTypes() {
    return [
      { id: 'chain', name_ka: 'ჯაჭვითი', name_en: 'Chain' },
      { id: 'belt', name_ka: 'ქამრით', name_en: 'Belt' },
      { id: 'shaft', name_ka: 'შაფტით', name_en: 'Shaft' },
      { id: 'automatic', name_ka: 'ავტომატური', name_en: 'Automatic' }
    ];
  }
}

// Export singleton instance
export default new CarService();