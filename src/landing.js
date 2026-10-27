import './style.css';
import './ui/reactions.css';
import './ui/touch.css';
import './landing.css';
import { createLanding } from './ui/startup.js';

export const landing = createLanding(document);
// Install selection/help immediately. The heavy game prepares behind the menu.
import('./main.js').catch(error => landing.fail(error));
