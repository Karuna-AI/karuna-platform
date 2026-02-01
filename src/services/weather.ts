/**
 * Weather Service
 * Fetches weather data for proactive assistance
 * Uses OpenWeatherMap API when configured, falls back to simulated data
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { WeatherCondition } from '../types/proactive';
import { logger } from './logger';

const STORAGE_KEYS = {
  WEATHER_CACHE: '@karuna_weather_cache',
  LOCATION_CACHE: '@karuna_location_cache',
};

// Cache duration in milliseconds (30 minutes)
const CACHE_DURATION = 30 * 60 * 1000;

// Open-Meteo API (free, no API key required)
const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1';
// OpenWeatherMap API (optional, requires API key)
const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';

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
  isSimulated?: boolean;
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
  private apiKey: string;
  private cache: WeatherCache | null = null;
  private locationCache: LocationData | null = null;
  private isInitialized: boolean = false;

  constructor() {
    // Load API key from app config (optional - Open-Meteo is used as primary, no key needed)
    this.apiKey = Constants.expoConfig?.extra?.openWeatherApiKey || '';

    if (this.apiKey) {
      logger.weather.info('OpenWeatherMap API configured as fallback');
    }
    logger.weather.info('Using Open-Meteo as primary weather source (no API key required)');
  }

  /**
   * Configure the weather service with API key (runtime override)
   */
  configure(apiKey: string): void {
    this.apiKey = apiKey;
    if (apiKey) {
      logger.weather.info('API key updated');
    }
  }

  /**
   * Check if real weather API is available
   */
  isApiConfigured(): boolean {
    return !!this.apiKey;
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
        logger.weather.warn('Could not get location, using simulated data');
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
      logger.weather.error('Error fetching weather', error);
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
        logger.weather.info('Location permission denied');
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
      logger.weather.error('Error getting location', error);
      return null;
    }
  }

  private async fetchWeatherFromAPI(location: LocationData): Promise<WeatherData> {
    // Try Open-Meteo first (free, no API key required)
    try {
      const weather = await this.fetchFromOpenMeteo(location);
      if (weather) return weather;
    } catch (error) {
      logger.weather.warn('Open-Meteo API failed', { error: String(error) });
    }

    // Try OpenWeatherMap if API key is configured
    if (this.apiKey) {
      try {
        const weather = await this.fetchFromOpenWeatherMap(location);
        if (weather) return weather;
      } catch (error) {
        logger.weather.warn('OpenWeatherMap API failed', { error: String(error) });
      }
    }

    // Fall back to simulated data
    logger.weather.debug('All weather APIs failed, using simulated data');
    return this.getSimulatedWeather(location);
  }

  /**
   * Fetch weather from Open-Meteo API (free, no API key)
   */
  private async fetchFromOpenMeteo(location: LocationData): Promise<WeatherData | null> {
    const url = `${OPEN_METEO_BASE_URL}/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=sunrise,sunset,uv_index_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;

    logger.weather.info('Fetching weather from Open-Meteo');

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      logger.weather.warn('Open-Meteo returned error', { status: response.status });
      return null;
    }

    const data = await response.json();
    logger.weather.info('Successfully fetched weather from Open-Meteo', { city: location.city || 'unknown' });
    return this.parseOpenMeteoResponse(data, location);
  }

  /**
   * Parse Open-Meteo API response
   */
  private parseOpenMeteoResponse(data: any, location: LocationData): WeatherData {
    const current = data.current;
    const daily = data.daily;
    const condition = this.mapWMOCodeToCondition(current.weather_code);

    return {
      temperature: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      condition,
      description: this.getWMODescription(current.weather_code),
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m),
      uvIndex: daily?.uv_index_max?.[0] ?? 0,
      sunrise: daily?.sunrise?.[0] || this.getTodayTime(6, 30),
      sunset: daily?.sunset?.[0] || this.getTodayTime(19, 45),
      location: {
        city: location.city || 'Your City',
        country: 'US',
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Map WMO weather codes to our WeatherCondition enum
   * See: https://open-meteo.com/en/docs#weathervariables
   */
  private mapWMOCodeToCondition(code: number): WeatherCondition {
    if (code === 0) return 'clear';
    if (code === 1 || code === 2) return 'partly_cloudy';
    if (code === 3) return 'cloudy';
    if (code >= 45 && code <= 48) return 'fog';
    if (code >= 51 && code <= 67) return 'rain';
    if (code >= 71 && code <= 77) return 'snow';
    if (code >= 80 && code <= 82) return 'rain';
    if (code >= 85 && code <= 86) return 'snow';
    if (code >= 95 && code <= 99) return 'thunderstorm';
    return 'partly_cloudy';
  }

  /**
   * Get human-readable description from WMO weather code
   */
  private getWMODescription(code: number): string {
    const descriptions: Record<number, string> = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Fog',
      48: 'Depositing rime fog',
      51: 'Light drizzle',
      53: 'Moderate drizzle',
      55: 'Dense drizzle',
      56: 'Light freezing drizzle',
      57: 'Dense freezing drizzle',
      61: 'Slight rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      66: 'Light freezing rain',
      67: 'Heavy freezing rain',
      71: 'Slight snowfall',
      73: 'Moderate snowfall',
      75: 'Heavy snowfall',
      77: 'Snow grains',
      80: 'Slight rain showers',
      81: 'Moderate rain showers',
      82: 'Violent rain showers',
      85: 'Slight snow showers',
      86: 'Heavy snow showers',
      95: 'Thunderstorm',
      96: 'Thunderstorm with slight hail',
      99: 'Thunderstorm with heavy hail',
    };
    return descriptions[code] || 'Unknown';
  }

  /**
   * Fetch weather from OpenWeatherMap API (requires API key)
   */
  private async fetchFromOpenWeatherMap(location: LocationData): Promise<WeatherData | null> {
    const url = `${OPENWEATHER_BASE_URL}/weather?lat=${location.latitude}&lon=${location.longitude}&appid=${this.apiKey}&units=imperial`;

    logger.weather.info('Fetching weather from OpenWeatherMap');

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.weather.warn('OpenWeatherMap returned error', { status: response.status, error: errorText });
      if (response.status === 401) {
        logger.weather.error('Invalid API key - check OPENWEATHER_API_KEY');
      }
      return null;
    }

    const data = await response.json();
    logger.weather.info('Successfully fetched weather from OpenWeatherMap', { city: location.city || 'unknown' });
    return this.parseOpenWeatherResponse(data, location);
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
      isSimulated: true,
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
      logger.weather.error('Error loading cache', error);
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
      logger.weather.error('Error saving cache', error);
    }
  }
}

export const weatherService = new WeatherService();
export default weatherService;
