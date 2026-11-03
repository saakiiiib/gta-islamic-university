import './style.css';
import './ui/reactions.css';
import './ui/touch.css';
import './landing.css';
import { createLanding } from './ui/startup.js';

export const landing = createLanding(document);
document.body.dataset.menuReadyMs = String(Math.round(performance.now()));
// Let the small, usable menu paint before evaluating the heavy game module.
// The poster and baked portraits are normal HTML images, independent of WebGL.
try {
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') {
      document.body.dataset.menuPaintMs = String(Math.round(entry.startTime));
    }
  }).observe({ type: 'paint', buffered: true });
} catch { /* Paint timing is optional. */ }
const start = () => import('./main.js').catch(error => landing.fail(error));
if (document.hidden) start();
else requestAnimationFrame(() => setTimeout(start, 0));
