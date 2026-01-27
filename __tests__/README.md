# Karuna Platform Test Suite

Comprehensive testing for the Karuna AI companion platform including mobile app, web dashboard, and server components.

## 📁 Test Structure

```
__tests__/
├── jest.config.js           # Jest configuration
├── setup/
│   └── setupTests.ts        # Global test setup
├── utils/
│   └── testUtils.tsx        # Test utilities and helpers
├── services/                # Service unit tests
│   ├── openai.test.ts       # AI/OpenAI integration
│   ├── tts.test.ts          # Text-to-speech
│   ├── storage.test.ts      # Data persistence
│   ├── encryption.test.ts   # Security/encryption
│   ├── healthData.test.ts   # Health tracking
│   ├── vault.test.ts        # Secure vault
│   ├── careCircle.test.ts   # Care circle management
│   ├── language.test.ts     # i18n/multilingual
│   └── proactive.test.ts    # Proactive features
├── hooks/                   # Hook unit tests
│   ├── useChat.test.ts      # Chat functionality
│   ├── useVoiceInput.test.ts # Voice recording
│   └── useTTS.test.ts       # TTS functionality
├── components/              # Component tests
│   ├── ChatScreen.test.tsx  # Chat interface
│   ├── HealthDashboard.test.tsx # Health display
│   ├── SettingsScreen.test.tsx  # Settings UI
│   └── VaultScreen.test.tsx # Vault UI
├── context/                 # Context tests
│   ├── SettingsContext.test.tsx # Settings state
│   └── ChatContext.test.tsx # Chat state
├── integration/             # Integration tests
│   ├── voicePipeline.test.ts    # Voice->STT->AI->TTS
│   └── healthTracking.test.ts   # Health data flow
├── e2e/                     # End-to-end scenarios
│   ├── scenarios.test.ts    # User journey tests
│   └── accessibility.test.ts # A11y compliance
└── server/                  # Server tests
    └── gateway.test.ts      # Gateway API tests
```

## 🚀 Running Tests

### Install Dependencies
```bash
npm install --save-dev jest @testing-library/react @testing-library/jest-dom @types/jest
```

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- __tests__/services/openai.test.ts
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Run E2E Tests Only
```bash
npm test -- __tests__/e2e/
```

### Run Integration Tests Only
```bash
npm test -- __tests__/integration/
```

## 📊 Test Categories

### Unit Tests
- **Services**: Core business logic
- **Hooks**: React hooks functionality
- **Components**: UI component behavior
- **Context**: State management

### Integration Tests
- **Voice Pipeline**: Complete voice conversation flow
- **Health Tracking**: Health data through the system
- **Care Circle**: Data sharing and sync

### E2E Tests
- **User Journeys**: Complete user scenarios
- **Accessibility**: WCAG compliance
- **Elderly UX**: Senior-friendly features

### Server Tests
- **Gateway API**: HTTP/WebSocket endpoints
- **Care Circle Server**: Authentication and sync

## 🎯 Coverage Thresholds

The test suite enforces minimum coverage:
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

## 🔧 Test Configuration

### Jest Config (jest.config.js)
- Uses `react-native` preset with `jsdom` environment
- Mocks all React Native and Expo modules
- Transforms TypeScript and JSX
- Collects coverage excluding mocks and types

### Setup File (setup/setupTests.ts)
- Configures global mocks for:
  - Fetch API
  - WebSocket
  - IndexedDB
  - localStorage/sessionStorage
  - Audio APIs (AudioContext, MediaRecorder)
  - Speech Synthesis
  - Navigator mediaDevices

## 📝 Writing New Tests

### Service Test Template
```typescript
describe('MyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('should do something', async () => {
      // Arrange
      const input = 'test';

      // Act
      const result = await myService.methodName(input);

      // Assert
      expect(result).toBe(expectedValue);
    });
  });
});
```

### Component Test Template
```tsx
import { render, fireEvent } from '../utils/testUtils';

describe('MyComponent', () => {
  it('should render correctly', () => {
    const { getByText } = render(<MyComponent />);
    expect(getByText('Expected Text')).toBeTruthy();
  });

  it('should handle user interaction', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<MyComponent onPress={onPress} />);

    fireEvent.press(getByTestId('button'));

    expect(onPress).toHaveBeenCalled();
  });
});
```

## 🏷️ Test Naming Conventions

- Use descriptive test names: `should [action] when [condition]`
- Group related tests with `describe` blocks
- Use `it` for individual test cases
- Prefix integration tests with service names

## ✅ Test Checklist

### Before Merging
- [ ] All tests pass
- [ ] Coverage thresholds met
- [ ] No console errors/warnings
- [ ] E2E scenarios validated
- [ ] Accessibility tests pass

### For New Features
- [ ] Unit tests for new services/hooks
- [ ] Component tests for new UI
- [ ] Integration tests for data flow
- [ ] E2E tests for user journeys

## 🔍 Debugging Tests

### Verbose Output
```bash
npm test -- --verbose
```

### Debug Single Test
```bash
npm test -- --testNamePattern="should handle voice input"
```

### View Test Output
```bash
npm test -- --verbose --no-coverage
```

## 📚 Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/)
- [React Native Testing](https://reactnative.dev/docs/testing-overview)
