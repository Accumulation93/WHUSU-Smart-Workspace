import { createApp } from 'vue';
import App from './App.vue';
import AppLoading from './components/AppLoading.vue';
import PersonLink from './components/PersonLink.vue';
import router from './router/index.js';
import './styles/tokens.css';
import './styles/components.css';
import './styles/parity.css';

createApp(App).component('AppLoading', AppLoading).component('PersonLink', PersonLink).use(router).mount('#app');
