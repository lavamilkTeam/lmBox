import { createApp } from 'vue'
import { createPinia } from 'pinia'
import WebAgent from './app/WebAgent.vue'
createApp(WebAgent).use(createPinia()).mount('#app')
