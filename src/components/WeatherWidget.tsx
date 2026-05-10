import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { weatherService, WeatherData } from '../services/weather';
import { getColors, getFontSizes, SPACING } from '../utils/accessibility';
import { WeatherCondition } from '../types/proactive';

const CONDITION_EMOJI: Record<WeatherCondition, string> = {
  clear: '☀️',
  cloudy: '☁️',
  partly_cloudy: '⛅',
  rain: '🌧️',
  snow: '❄️',
  thunderstorm: '⛈️',
  fog: '🌫️',
  hot: '🔥',
  cold: '🥶',
};

export function WeatherWidget(): JSX.Element | null {
  const colors = getColors(true);
  const fonts = getFontSizes('large');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadWeather = async () => {
      try {
        const data = await weatherService.getCurrentWeather();
        if (mounted && data && !data.isSimulated) {
          setWeather(data);
        }
      } catch {
        // Weather is optional — fail silently
      }
    };

    loadWeather();

    // Refresh every 30 minutes
    const interval = setInterval(() => {
      loadWeather();
    }, 30 * 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!weather) return null;

  const emoji = CONDITION_EMOJI[weather.condition] || '🌤️';
  const temp = Math.round(weather.temperature);

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.surface }]}
      onPress={() => setExpanded(!expanded)}
      accessible={true}
      accessibilityLabel={`Weather: ${temp} degrees, ${weather.description}, ${weather.location.city}`}
      accessibilityHint="Tap for more weather details"
      accessibilityRole="button"
      activeOpacity={0.7}
    >
      <Text style={[styles.summary, { color: colors.textSecondary, fontSize: fonts.body - 2 }]}>
        {emoji} {temp}°F {weather.description} — {weather.location.city}
      </Text>

      {expanded && (
        <View style={styles.details}>
          <Text style={[styles.detail, { color: colors.textSecondary, fontSize: fonts.body - 3 }]}>
            Feels like {Math.round(weather.feelsLike)}°F  •  Humidity {weather.humidity}%  •  Wind {Math.round(weather.windSpeed)} mph
          </Text>
          {weather.uvIndex > 5 && (
            <Text style={[styles.detail, { color: colors.error, fontSize: fonts.body - 3 }]}>
              UV Index: {weather.uvIndex} — Wear sunscreen!
            </Text>
          )}
          {weather.alert && (
            <Text style={[styles.detail, { color: colors.error, fontSize: fonts.body - 3 }]}>
              ⚠️ {weather.alert.description}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 8,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },
  summary: {
    textAlign: 'center',
  },
  details: {
    marginTop: SPACING.xs,
    paddingTop: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  detail: {
    textAlign: 'center',
    marginTop: 2,
  },
});

export default WeatherWidget;
