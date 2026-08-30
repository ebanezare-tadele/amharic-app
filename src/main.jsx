import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './lib/windowStorage.js'
// Imported here, before anything else, so its beforeinstallprompt
// listener is registered as early as possible — see the comment atop
// the module for why that matters.
import './lib/installPrompt.js'
import './index.css'
import App from './App.jsx'

// With registerType: 'autoUpdate' (vite.config.js), this reloads the page
// automatically the moment a new version's service worker activates —
// no "update available" prompt, no manual re-save to the home screen.
// The gap this closes: on its own, a browser only checks a service
// worker's own script for changes around once a day at most, which is
// far slower than "every time you open a PWA you use every day or two."
// registration.update() on every foreground forces that check to happen
// on each actual app open instead of waiting on that clock.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => registration.update().catch(() => {})
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    window.addEventListener('focus', check)
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
