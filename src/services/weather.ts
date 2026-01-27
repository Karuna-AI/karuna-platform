/**
 * Weather Service
 * Fetches weather data for proactive assistance
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { WeatherCondition } from '../types/proactive';

const STORAGE_KEYS = {
  WEATHER_CACHE: '@karuna_weather_cache',
  LOCATION_CACHE: '@karuna_location_cache',
};

// Cache duration in milliseconds (30 minutes)
const CACHE_DURATION = 30 * 60 * 1000;

export interface WeatherData {
  temperature: number; // Fahrenheit
  feelsLike: number;
  condition: WeatherCondition;
  description: string;
  humidity: number;
  windSpeed: number;
  uvIndex: number;
  sunrise: string;
  sunset: string;
  alert?: {
    type: string;
    description: string;
    severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  };
  location: {
    city: string;
    country: string;
  };
  timestamp: string;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
  timestamp: string;
}

interface WeatherCache {
  data: WeatherData;
  timestamp: number;
}

class WeatherService {
  private apiKey: string = ''; // Set via configure()
  private cache: WeatherCache | null = null;
  private locationCache: LocationData | null = null;

  /**
   * Configure the weather service with API key
   * In production, use OpenWeatherMap, WeatherAPI, or similar
   */
  configure(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Get current weather data
   */
  async getCurrentWeather(forceRefresh: boolean = false): Promise<WeatherData | null> {
    // Check cache first
    if (!forceRefresh && this.cache) {
      const age = Date.now() - this.cache.timestamp;
      if (age < CACHE_DURATION) {
        return this.cache.data;
      }
    }

    // Load from storage if not in memory
    if (!forceRefresh) {
      const cached = await this.loadCachedWeather();
      if (cached) {
        return cached;
      }
    }

    // Fetch fresh data
    try {
      const location = await this.getLocation();
      if (!location) {
        console.log('[Weather] Could not get location');
        return this.getSimulatedWeather();
      }

      // In production, this would call a real weather API
      // For now, return simulated data based on time/location
      const weather = await this.fetchWeatherFromAPI(location);

      // Cache the result
      this.cache = {
        data: weather,
        timestamp: Date.now(),
      };
      await this.saveCachedWeather(weather);

      return weather;
    } catch (error) {
      console.error('[Weather] Error fetching weather:', error);
      return this.getSimulatedWeather();
    }
  }

  /**
   * Get user's current location
   */
  private async getLocation(): Promise<LocationData | null> {
    // Check location cache
    if (this.locationCache) {
      const age = Date.now() - new Date(this.locationCache.timestamp).getTime();
      if (age < CACHE_DURATION * 2) { // Location cache is valid longer
        return this.locationCache;
      }
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[Weather] Location permission denied');
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Reverse geocode to get city name
      const geocode = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const locationData: LocationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        city: geocode[0]?.city || geocode[0]?.subregion || 'Unknown',
        timestamp: new Date().toISOString(),
      };

      this.locationCache = locationData;
      await AsyncStorage.setItem(STORAGE_KEYS.LOCATION_CACHE, JSON.stringify(locationData));

      return locationData;
    } catch (error) {
      console.error('[Weather] Error getting location:', error);
      return null;
    }
  }

  /**
   * Fetch weather from API
   * In production, replace with actual API call
   */
  private async fetchWeatherFromAPI(location: LocationData): Promise<WeatherData> {
    // If API key is configured, make real API call
    if (this.apiKey) {
      try {
        // Example with OpenWeatherMap API
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${location.latitude}&lon=${location.longitude}&appid=${this.apiKey}&units=imperial`
        );

        if (response.ok) {
          const data = await response.json();
          return this.parseOpenWeatherResponse(data, location);
        }
      } catch (error) {
        console.error('[Weather] API call failed:', error);
      }
    }

    // Fall back to simulated data
    return this.getSimulatedWeather(location);
  }

  /**
   * Parse OpenWeatherMap API response
   */
  private parseOpenWeatherResponse(data: any, location: LocationData): WeatherData {
    const condition = this.mapWeatherCondition(data.weather[0]?.main || 'Clear');

    return {
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      condition,
      description: data.weather[0]?.description || 'Clear sky',
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed),
      uvIndex: 0, // Not available in basic API
      sunrise: new Date(data.sys.sunrise * 1000).toISOString(),
      sunset: new Date(data.sys.sunset * 1000).toISOString(),
      location: {
        city: location.city || data.name || 'Unknown',
        country: data.sys.country || 'US',
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Map weather condition string to our enum
   */
  private mapWeatherCondition(condition: string): WeatherCondition {
    const lower = condition.toLowerCase();
    if (lower.includes('clear') || lower.includes('sunny')) return 'clear';
    if (lower.includes('cloud')) return 'cloudy';
    if (lower.includes('rain') || lower.includes('drizzle')) return 'rain';
    if (lower.includes('thunder') || lower.includes('storm')) return 'thunderstorm';
    if (lower.includes('snow')) return 'snow';
    if (lower.includes('fog') || lower.includes('mist') || lower.includes('haze')) return 'fog';
    return 'partly_cloudy';
  }

  /**
   * Get simulated weather data for demo purposes
   */
  private getSimulatedWeather(location?: LocationData): WeatherData {
    const hour = new Date().getHours();
    const isDay = hour >= 6 && hour < 20;

    // Simulate realistic weather patterns
    const baseTemp = 70 + Math.floor(Math.random() * 20) - 10;
    const conditions: WeatherCondition[] = ['clear', 'partly_cloudy', 'cloudy', 'rain'];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];

    let alert: WeatherData['alert'] | undefined;

    // Occasionally add weather alerts for demo
    if (Math.random() < 0.1) {
      alert = {
        type: 'Heat Advisory',
        description: 'High temperatures expected. Stay hydrated and avoid prolonged outdoor activity.',
        severity: 'moderate',
      };
    }

    return {
      temperature: baseTemp,
      feelsLike: baseTemp + (Math.random() > 0.5 ? 3 : -2),
      condition,
      description: this.getConditionDescription(condition),
      humidity: 40 + Math.floor(Math.random() * 40),
      windSpeed: Math.floor(Math.random() * 15),
      uvIndex: isDay ? Math.floor(Math.random() * 8) + 1 : 0,
      sunrise: this.getTodayTime(6, 30),
      sunset: this.getTodayTime(19, 45),
      location: {
        city: location?.city || 'Your City',
        country: 'US',
      },
      timestamp: new Date().toISOString(),
      alert,
    };
  }

  /**
   * Get weather condition description
   */
  private getConditionDescription(condition: WeatherCondition): string {
    const descriptions: Record<WeatherCondition, string> = {
      clear: 'Clear sky',
      cloudy: 'Cloudy',
      partly_cloudy: 'Partly cloudy',
      rain: 'Light rain',
      thunderstorm: 'Thunderstorm',
      snow: 'Snow',
      fog: 'Foggy',
      hot: 'Very hot',
      cold: 'Very cold',
    };
    return descriptions[condition];
  }

  /**
   * Helper to create a time string for today
   */
  private getTodayTime(hour: number, minute: number): string {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  }

  /**
   * Check if weather is suitable for outdoor activity
   */
  isGoodForOutdoors(weather: WeatherData): {
    suitable: boolean;
    reason?: string;
    suggestion?: string;
  } {
    // Check for alerts
    if (weather.alert && weather.alert.severity !== 'minor') {
      return {
        suitable: false,
        reason: weather.alert.description,
        suggestion: 'Consider staying indoors today.',
      };
    }

    // Check temperature
    if (weather.temperature > 95) {
      return {
        suitable: false,
        reason: "It's very hot outside.",
        suggestion: 'Stay cool and hydrated. Maybe take a short walk in the early morning or evening.',
      };
    }

    if (weather.temperature < 32) {
      return {
        suitable: false,
        reason: "It's freezing outside.",
        suggestion: 'Bundle up if you go out, or try some indoor exercises.',
      };
    }

    // Check conditions
    if (weather.condition === 'thunderstorm') {
      return {
        suitable: false,
        reason: 'Thunderstorms are expected.',
        suggestion: 'Best to stay indoors until the storm passes.',
      };
    }

    if (weather.condition === 'rain') {
      return {
        suitable: false,
        reason: "It's raining outside.",
        suggestion: "Don't forget an umbrella if you need to go out!",
      };
    }

    // Check UV index
    if (weather.uvIndex >= 8) {
      return {
        suitable: true,
        reason: 'UV index is high.',
        suggestion: 'Wear sunscreen and a hat if going outside.',
      };
    }

    // Good weather
    return {
      suitable: true,
      suggestion: 'Great weather for a walk!',
    };
  }

  /**
   * Get weather-based suggestions
   */
  getWeatherSuggestion(weather: WeatherData): string {
    const outdoorCheck = this.isGoodForOutdoors(weather);

    if (weather.alert) {
      return `Weather alert: ${weather.alert.description}`;
    }

    if (!outdoorCheck.suitable) {
      return outdoorCheck.suggestion || 'Consider staying indoors.';
    }

    const hour = new Date().getHours();

    if (weather.condition === 'clear' && hour >= 10 && hour <= 16) {
      return `It's ${weather.temperature}°F and sunny - a lovely day for a gentle walk!`;
    }

    if (weather.condition === 'partly_cloudy') {
      return `It's ${weather.temperature}°F with some clouds - nice weather to get some fresh air.`;
    }

    return `Current temperature is ${weather.temperature}°F. ${outdoorCheck.suggestion || ''}`;
  }

  /**
   * Load cached weather from storage
   */
  private async loadCachedWeather(): Promise<WeatherData | null> {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.WEATHER_CACHE);
      if (cached) {
        const parsed: WeatherCache = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;
        if (age < CACHE_DURATION) {
          this.cache = parsed;
          return parsed.data;
        }
      }
    } catch (error) {
      console.error('[Weather] Error loading cache:', error);
    }
    return null;
  }

  /**
   * Save weather to cache
   */
  private async saveCachedWeather(weather: WeatherData): Promise<void> {
    try {
      const cache: WeatherCache = {
        data: weather,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(STORAGE_KEYS.WEATHER_CACHE, JSON.stringify(cache));
    } catch (error) {
      console.error('[Weather] Error saving cache:', error);
    }
  }
}

export const weatherService = new WeatherService();
export default weatherService;
