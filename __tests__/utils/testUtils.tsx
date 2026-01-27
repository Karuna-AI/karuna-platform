/**
 * Test Utilities
 * Common helpers for testing React components and hooks
 */

import React, { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { SettingsProvider } from '../../src/context/SettingsContext';
import { ChatProvider } from '../../src/context/ChatContext';

// All providers wrapper
interface AllProvidersProps {
  children: ReactNode;
}

const AllProviders: React.FC<AllProvidersProps> = ({ children }) => {
  return (
    <SettingsProvider>
      <ChatProvider>
        {children}
      </ChatProvider>
    </SettingsProvider>
  );
};

// Custom render with providers
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllProviders, ...options });

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };

// Mock data generators
export const createMockMessage = (overrides = {}) => ({
  id: `msg-${Date.now()}`,
  role: 'user' as const,
  content: 'Test message',
  timestamp: new Date().toISOString(),
  ...overrides,
});

export const createMockContact = (overrides = {}) => ({
  id: `contact-${Date.now()}`,
  name: 'Test Contact',
  phone: '+1234567890',
  email: 'test@example.com',
  relationship: 'friend',
  ...overrides,
});

export const createMockMedication = (overrides = {}) => ({
  id: `med-${Date.now()}`,
  name: 'Test Medication',
  dosage: '10mg',
  frequency: 'daily',
  times: ['08:00', '20:00'],
  startDate: new Date().toISOString(),
  ...overrides,
});

export const createMockHealthRecord = (overrides = {}) => ({
  id: `health-${Date.now()}`,
  type: 'vitals',
  date: new Date().toISOString(),
  data: {
    bloodPressure: { systolic: 120, diastolic: 80 },
    heartRate: 72,
    temperature: 98.6,
  },
  ...overrides,
});

export const createMockVaultEntry = (overrides = {}) => ({
  id: `vault-${Date.now()}`,
  type: 'account',
  title: 'Test Account',
  data: {
    username: 'testuser',
    password: 'encrypted',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

export const createMockCareCircleMember = (overrides = {}) => ({
  id: `member-${Date.now()}`,
  name: 'Test Member',
  role: 'caregiver',
  permissions: ['view_health', 'view_medications'],
  status: 'active',
  ...overrides,
});

// Wait utilities
export const waitForAsync = (ms = 100) =>
  new Promise(resolve => setTimeout(resolve, ms));

export const flushPromises = () =>
  new Promise(resolve => setImmediate(resolve));

// Mock API response helper
export const mockApiResponse = (data: any, status = 200) => {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
};

// Mock error response
export const mockApiError = (message: string, status = 500) => {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ error: message }),
    text: () => Promise.resolve(message),
  });
};
