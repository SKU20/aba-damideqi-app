// CarService.js - Updated with pagination support for infinite queries
import AsyncStorage from '@react-native-async-storage/async-storage';

class CarService {
  constructor() {
    this.API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://aba-damideqi-app.onrender.com/api';
  }

  // Get auth token from AsyncStorage (shared with EventService)
  async getAuthToken() {
    try {
      const token = await AsyncStorage.getItem('authToken');
      return token;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.API_BASE_URL}${endpoint}`;

    // Attach Authorization when available
    const token = await this.getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Attempt to parse JSON even on error for better messages
    let data = null;
    try { data = await response.json(); } catch (_) {}

    if (!response.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP error! status: ${response.status}`;
      throw new Error(msg);
    }

    return data;
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

  // Add new car
  async addCar(userId, carData) {
    try {
      const result = await this.makeRequest(`/cars/user/${userId}`, {
        method: 'POST',
        body: JSON.stringify(carData),
      });
      
      if (!result.success) {
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

  // Upload car photos
  async uploadCarPhotos(carId, userId, photos) {
    try {
      const formData = new FormData();
      formData.append('carId', carId);
      formData.append('userId', userId);
      
      photos.forEach((photo, index) => {
        formData.append('photos', {
          uri: photo.uri,
          type: photo.type || 'image/jpeg',
          name: photo.name || `photo_${index}.jpg`,
        });
      });

      const response = await fetch(`${this.API_BASE_URL}/cars/photos/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to upload photos');
      }

      return result.data;
    } catch (error) {
      console.error('Error uploading photos:', error);
      throw error;
    }
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