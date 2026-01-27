import { AppRegistry } from 'react-native';
import App from './src/App';

AppRegistry.registerComponent('karuna', () => App);

AppRegistry.runApplication('karuna', {
  initialProps: {},
  rootTag: document.getElementById('root'),
});
