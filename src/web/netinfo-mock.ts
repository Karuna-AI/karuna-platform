// Jest mock for @react-native-community/netinfo. Tests don't need real network
// state, just the API surface used by src/components/OfflineBanner.tsx.

const fetchState = jest.fn().mockResolvedValue({
  type: 'wifi',
  isConnected: true,
  isInternetReachable: true,
  details: null,
});

const addEventListener = jest.fn(() => {
  // Subscriber callback never called by default; tests can override per-suite.
  return () => undefined; // unsubscribe function
});

const useNetInfo = jest.fn(() => ({
  type: 'wifi',
  isConnected: true,
  isInternetReachable: true,
}));

const NetInfo = {
  fetch: fetchState,
  addEventListener,
  useNetInfo,
  configure: jest.fn(),
};

export default NetInfo;
export { addEventListener, fetchState as fetch, useNetInfo };
