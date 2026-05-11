/**
 * WeatherWidget Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { WeatherData } from '../../src/services/weather';
import { WeatherCondition } from '../../src/types/proactive';

// Mock the weather service module before importing the component
jest.mock('../../src/services/weather', () => ({
  weatherService: {
    getCurrentWeather: jest.fn(),
  },
  // Re-export WeatherData type (runtime value not needed)
}));

// Mock expo-constants (used in WeatherService constructor)
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

// Mock expo-location (used in WeatherService.getLocation)
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('../../src/web/async-storage-mock')
);

import { WeatherWidget } from '../../src/components/WeatherWidget';
import { weatherService } from '../../src/services/weather';

const mockWeatherService = weatherService as jest.Mocked<typeof weatherService>;

function makeWeatherData(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    temperature: 72,
    feelsLike: 70,
    condition: 'clear' as WeatherCondition,
    description: 'Clear sky',
    humidity: 45,
    windSpeed: 5,
    uvIndex: 3,
    sunrise: '2024-01-15T06:30:00.000Z',
    sunset: '2024-01-15T19:45:00.000Z',
    location: { city: 'Springfield', country: 'US' },
    timestamp: new Date().toISOString(),
    isSimulated: false,
    ...overrides,
  };
}

describe('WeatherWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loading / null state', () => {
    it('renders nothing (null) while weather is loading', async () => {
      // Never resolves during the test → weather stays null
      mockWeatherService.getCurrentWeather.mockReturnValue(new Promise(() => {}));
      const { container } = render(<WeatherWidget />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when the service resolves with null', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(null);
      const { container } = render(<WeatherWidget />);
      await waitFor(() => {
        expect(mockWeatherService.getCurrentWeather).toHaveBeenCalled();
      });
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when data is simulated (isSimulated: true)', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(
        makeWeatherData({ isSimulated: true })
      );
      const { container } = render(<WeatherWidget />);
      await waitFor(() => {
        expect(mockWeatherService.getCurrentWeather).toHaveBeenCalled();
      });
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when service throws', async () => {
      mockWeatherService.getCurrentWeather.mockRejectedValue(new Error('Network error'));
      const { container } = render(<WeatherWidget />);
      await waitFor(() => {
        expect(mockWeatherService.getCurrentWeather).toHaveBeenCalled();
      });
      // Widget fails silently — renders nothing
      expect(container.firstChild).toBeNull();
    });
  });

  describe('weather data rendering', () => {
    it('shows temperature rounded to nearest integer', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(
        makeWeatherData({ temperature: 72.8 })
      );
      render(<WeatherWidget />);
      await waitFor(() => expect(screen.getByText(/73°F/)).toBeTruthy());
    });

    it('shows weather description', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(
        makeWeatherData({ description: 'Partly cloudy' })
      );
      render(<WeatherWidget />);
      await waitFor(() => expect(screen.getByText(/Partly cloudy/)).toBeTruthy());
    });

    it('shows city name', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(
        makeWeatherData({ location: { city: 'Denver', country: 'US' } })
      );
      render(<WeatherWidget />);
      await waitFor(() => expect(screen.getByText(/Denver/)).toBeTruthy());
    });

    it('sets the correct accessibility label with temp, description, and city', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(
        makeWeatherData({ temperature: 72, description: 'Clear sky', location: { city: 'Springfield', country: 'US' } })
      );
      render(<WeatherWidget />);
      await waitFor(() =>
        expect(
          screen.getByLabelText('Weather: 72 degrees, Clear sky, Springfield')
        ).toBeTruthy()
      );
    });

    it('renders as a button role for tap interaction', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(makeWeatherData());
      render(<WeatherWidget />);
      await waitFor(() => {
        expect(screen.getByRole('button')).toBeTruthy();
      });
    });
  });

  describe('expanded details', () => {
    it('does not show details panel before tapping', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(
        makeWeatherData({ feelsLike: 68, humidity: 55, windSpeed: 7 })
      );
      render(<WeatherWidget />);
      await waitFor(() => expect(screen.getByRole('button')).toBeTruthy());
      expect(screen.queryByText(/Feels like/)).toBeNull();
    });

    it('shows feels-like, humidity, and wind after tapping', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(
        makeWeatherData({ feelsLike: 68, humidity: 55, windSpeed: 7 })
      );
      render(<WeatherWidget />);
      await waitFor(() => expect(screen.getByRole('button')).toBeTruthy());
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText(/Feels like 68°F/)).toBeTruthy();
      expect(screen.getByText(/Humidity 55%/)).toBeTruthy();
      expect(screen.getByText(/Wind 7 mph/)).toBeTruthy();
    });

    it('collapses details panel on second tap', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(makeWeatherData());
      render(<WeatherWidget />);
      await waitFor(() => expect(screen.getByRole('button')).toBeTruthy());
      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(screen.getByText(/Feels like/)).toBeTruthy();
      fireEvent.click(button);
      expect(screen.queryByText(/Feels like/)).toBeNull();
    });

    it('shows UV index warning when uvIndex > 5', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(
        makeWeatherData({ uvIndex: 8 })
      );
      render(<WeatherWidget />);
      await waitFor(() => expect(screen.getByRole('button')).toBeTruthy());
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText(/UV Index: 8/)).toBeTruthy();
      expect(screen.getByText(/Wear sunscreen/)).toBeTruthy();
    });

    it('does not show UV index warning when uvIndex is 5 or below', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(
        makeWeatherData({ uvIndex: 5 })
      );
      render(<WeatherWidget />);
      await waitFor(() => expect(screen.getByRole('button')).toBeTruthy());
      fireEvent.click(screen.getByRole('button'));
      expect(screen.queryByText(/UV Index/)).toBeNull();
    });

    it('shows weather alert when present', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(
        makeWeatherData({
          alert: {
            type: 'Heat Advisory',
            description: 'Stay hydrated and avoid prolonged outdoor activity.',
            severity: 'moderate',
          },
        })
      );
      render(<WeatherWidget />);
      await waitFor(() => expect(screen.getByRole('button')).toBeTruthy());
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText(/Stay hydrated/)).toBeTruthy();
    });

    it('does not show alert section when no alert', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(
        makeWeatherData({ alert: undefined })
      );
      render(<WeatherWidget />);
      await waitFor(() => expect(screen.getByRole('button')).toBeTruthy());
      fireEvent.click(screen.getByRole('button'));
      expect(screen.queryByText(/⚠️/)).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('calls getCurrentWeather on mount', async () => {
      mockWeatherService.getCurrentWeather.mockResolvedValue(null);
      render(<WeatherWidget />);
      await waitFor(() => {
        expect(mockWeatherService.getCurrentWeather).toHaveBeenCalledTimes(1);
      });
    });

    it('does not throw when unmounted before fetch resolves', async () => {
      let resolveWeather!: (value: null) => void;
      mockWeatherService.getCurrentWeather.mockReturnValue(
        new Promise<null>((res) => { resolveWeather = res; })
      );

      const { unmount } = render(<WeatherWidget />);
      unmount();

      // Resolve after unmount — should not cause state-update warning
      await act(async () => { resolveWeather(null); });
    });
  });
});
