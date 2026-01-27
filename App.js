/**
 * Karuna App Entry Point
 *
 * This file serves as the entry point for Expo.
 * The main application logic is in src/App.tsx
 */

import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import App from './src/App';

// Register the app with Expo
registerRootComponent(App);

export default App;
