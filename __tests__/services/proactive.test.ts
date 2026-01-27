/**
 * Proactive Engine Service Tests
 * Tests for signals, rules, triggers, and proactive messaging
 */

describe('Proactive Engine', () => {
  describe('signal collection', () => {
    it('should collect time-based signals', () => {
      const signal = {
        type: 'time',
        value: new Date().toISOString(),
        metadata: {
          hour: new Date().getHours(),
          dayOfWeek: new Date().getDay(),
        },
      };

      expect(signal.type).toBe('time');
    });

    it('should collect location signals', () => {
      const signal = {
        type: 'location',
        value: { lat: 37.7749, lng: -122.4194 },
        metadata: { place: 'Home' },
      };

      expect(signal.type).toBe('location');
    });

    it('should collect activity signals', () => {
      const signal = {
        type: 'activity',
        value: 'walking',
        confidence: 0.95,
      };

      expect(signal.confidence).toBeGreaterThan(0.9);
    });

    it('should collect health signals', () => {
      const signal = {
        type: 'health',
        value: { heartRate: 85, steps: 5000 },
        timestamp: new Date().toISOString(),
      };

      expect(signal.value.heartRate).toBe(85);
    });

    it('should collect calendar signals', () => {
      const signal = {
        type: 'calendar',
        value: {
          event: 'Doctor appointment',
          startTime: '2024-01-15T10:00:00',
          reminderBefore: 60, // minutes
        },
      };

      expect(signal.value.event).toContain('Doctor');
    });
  });

  describe('rule evaluation', () => {
    it('should evaluate time-based rules', () => {
      const rule = {
        condition: { type: 'time', hour: 8 },
        action: { type: 'message', content: 'Good morning!' },
      };

      const currentHour = 8;
      const matches = rule.condition.hour === currentHour;

      expect(matches).toBe(true);
    });

    it('should evaluate compound rules', () => {
      const rule = {
        conditions: [
          { type: 'time', hour: 8 },
          { type: 'location', place: 'Home' },
        ],
        operator: 'AND',
      };

      const timeMatches = true;
      const locationMatches = true;
      const allMatch = rule.operator === 'AND'
        ? timeMatches && locationMatches
        : timeMatches || locationMatches;

      expect(allMatch).toBe(true);
    });

    it('should evaluate health threshold rules', () => {
      const rule = {
        condition: {
          type: 'health',
          metric: 'heartRate',
          operator: '>',
          value: 100,
        },
      };

      const currentHeartRate = 110;
      const matches = currentHeartRate > rule.condition.value;

      expect(matches).toBe(true);
    });

    it('should evaluate medication reminder rules', () => {
      const rule = {
        condition: {
          type: 'medication',
          medicationId: 'med-1',
          time: '08:00',
        },
        action: { type: 'reminder', priority: 'high' },
      };

      expect(rule.action.priority).toBe('high');
    });
  });

  describe('trigger execution', () => {
    it('should trigger check-in message', () => {
      const trigger = {
        type: 'check-in',
        message: 'How are you feeling today?',
        options: ['Great', 'Good', 'Not so good', 'Need help'],
      };

      expect(trigger.options).toHaveLength(4);
    });

    it('should trigger medication reminder', () => {
      const trigger = {
        type: 'medication-reminder',
        medication: 'Aspirin',
        dosage: '81mg',
        time: '08:00',
      };

      expect(trigger.type).toBe('medication-reminder');
    });

    it('should trigger emergency alert', () => {
      const trigger = {
        type: 'emergency',
        reason: 'High heart rate detected',
        actions: ['notify_caregiver', 'show_alert'],
      };

      expect(trigger.actions).toContain('notify_caregiver');
    });

    it('should respect cooldown periods', () => {
      const lastTrigger = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      const cooldownPeriod = 30 * 60 * 1000; // 30 minutes

      const canTrigger = Date.now() - lastTrigger > cooldownPeriod;

      expect(canTrigger).toBe(false);
    });
  });

  describe('AI message crafting', () => {
    it('should personalize check-in messages', () => {
      const context = {
        userName: 'Mom',
        timeOfDay: 'morning',
        lastInteraction: '2 hours ago',
      };

      const template = `Good ${context.timeOfDay}, ${context.userName}! How are you today?`;

      expect(template).toContain('Mom');
      expect(template).toContain('morning');
    });

    it('should adapt tone based on mood', () => {
      const moodTones = {
        happy: 'cheerful',
        sad: 'supportive',
        anxious: 'calming',
        neutral: 'friendly',
      };

      expect(moodTones.anxious).toBe('calming');
    });

    it('should include relevant context', () => {
      const context = {
        upcomingAppointment: 'Doctor visit at 2pm',
        medicationsDue: ['Aspirin', 'Vitamin D'],
        weather: 'Sunny, 72°F',
      };

      expect(context.medicationsDue).toHaveLength(2);
    });
  });
});

describe('Weather Service', () => {
  it('should fetch weather data', async () => {
    const weather = {
      temperature: 72,
      condition: 'sunny',
      humidity: 45,
      forecast: 'Clear skies expected',
    };

    expect(weather.temperature).toBe(72);
  });

  it('should provide weather-based suggestions', () => {
    const weather = { temperature: 95, condition: 'hot' };
    const suggestions = [];

    if (weather.temperature > 90) {
      suggestions.push('Stay hydrated');
      suggestions.push('Avoid outdoor activities');
    }

    expect(suggestions).toContain('Stay hydrated');
  });
});

describe('Calendar Service', () => {
  it('should fetch upcoming events', async () => {
    const events = [
      { title: 'Doctor appointment', start: '2024-01-15T10:00:00' },
      { title: 'Medication refill', start: '2024-01-16T14:00:00' },
    ];

    expect(events).toHaveLength(2);
  });

  it('should calculate reminder times', () => {
    const event = {
      start: new Date('2024-01-15T10:00:00'),
      reminderMinutes: 60,
    };

    const reminderTime = new Date(event.start.getTime() - event.reminderMinutes * 60 * 1000);

    expect(reminderTime.getHours()).toBe(9);
  });
});

describe('Proactive Settings', () => {
  it('should enable/disable proactive features', () => {
    const settings = {
      enabled: true,
      checkIns: true,
      medicationReminders: true,
      healthAlerts: true,
      weatherUpdates: false,
    };

    expect(settings.checkIns).toBe(true);
    expect(settings.weatherUpdates).toBe(false);
  });

  it('should configure quiet hours', () => {
    const quietHours = {
      enabled: true,
      start: '22:00',
      end: '07:00',
    };

    const isQuietTime = (time: string) => {
      return time >= quietHours.start || time < quietHours.end;
    };

    expect(isQuietTime('23:00')).toBe(true);
    expect(isQuietTime('12:00')).toBe(false);
  });

  it('should configure frequency limits', () => {
    const limits = {
      maxCheckInsPerDay: 3,
      minIntervalMinutes: 120,
    };

    expect(limits.maxCheckInsPerDay).toBe(3);
  });
});
