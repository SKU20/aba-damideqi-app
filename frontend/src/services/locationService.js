// Location service for handling GPS and city detection
import * as Location from 'expo-location';
import { findNearestCity, GEORGIAN_CITIES } from '../utils/georgianCities';

class LocationService {
  constructor() {
    this.currentLocation = null;
    this.currentCity = null;
  }

  // New: Cross-country city/country detection using reverse geocoding
  async getCityCountry() {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) throw new Error('Location permission denied');

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeout: 15000,
        maximumAge: 300000,
      });

      const geos = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      const first = geos && geos[0] ? geos[0] : null;
      const city = first?.city || first?.subregion || first?.region || null;
      const country = first?.country || null;
      const region = first?.region || first?.subregion || null;

      return { city, country, region };
    } catch (error) {
      console.error('Error in getCityCountry:', error);
      return { city: null, country: null, region: null };
    }
  }

  // Request location permissions
  async requestPermissions() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission not granted');
      }
      return true;
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }

  // Get current location
  async getCurrentLocation() {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Location permission denied');
      }

      console.log('🌍 Getting current location...');
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeout: 15000,
        maximumAge: 300000, // 5 minutes
      });

      this.currentLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: new Date().toISOString()
      };

      console.log('📍 Location obtained:', this.currentLocation);

      // Find nearest Georgian city
      this.currentCity = findNearestCity(
        this.currentLocation.latitude, 
        this.currentLocation.longitude
      );

      console.log('🏙️ Nearest city:', this.currentCity);

      return {
        location: this.currentLocation,
        city: this.currentCity
      };

    } catch (error) {
      console.error('Error getting location:', error);
      throw error;
    }
  }

  // Get location with fallback to manual selection
  async getLocationWithFallback() {
    try {
      return await this.getCurrentLocation();
    } catch (error) {
      console.log('GPS failed, will use manual city selection');
      return {
        location: null,
        city: null,
        error: error.message
      };
    }
  }

  // Manual city selection
  getCityByName(cityName) {
    return GEORGIAN_CITIES.find(city => 
      city.name.toLowerCase() === cityName.toLowerCase() ||
      city.nameKa === cityName
    );
  }

  // Get all cities for manual selection
  getAllCities() {
    return GEORGIAN_CITIES.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Get major cities (population centers)
  getMajorCities() {
    const majorCityNames = [
      'Tbilisi', 'Kutaisi', 'Batumi', 'Rustavi', 'Gori', 
      'Zugdidi', 'Poti', 'Kobuleti', 'Telavi', 'Borjomi'
    ];
    
    return GEORGIAN_CITIES.filter(city => 
      majorCityNames.includes(city.name)
    ).sort((a, b) => a.name.localeCompare(b.name));
  }

  // Format location for display
  formatLocationForDisplay(location, selectedLanguage = 'georgian') {
    if (!location) return 'Unknown Location';
    
    if (selectedLanguage === 'english') {
      return `${location.name}, ${location.region}`;
    } else {
      return `${location.nameKa}, ${location.region}`;
    }
  }

  // Get current cached location
  getCachedLocation() {
    return {
      location: this.currentLocation,
      city: this.currentCity
    };
  }
}

export default new LocationService();
