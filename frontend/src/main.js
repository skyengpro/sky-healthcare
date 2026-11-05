import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { registerServiceWorker } from './pwa'
import { ready } from './api'
import './theme'
import './style.css'

// wait (briefly) for what the device kept from earlier visits, so waiting changes show from the first screen
Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]).then(() => {
  createApp(App).use(router).mount('#app')
  registerServiceWorker()
})
