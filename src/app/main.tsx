import { createRoot } from 'react-dom/client';
import { startBackground } from '../background';
import { CONTENT_CSS } from '../core/richtext';
import { platform } from '../platform';
import { App } from './App';
import { initStore } from './store';
import './styles.css';

const root = document.documentElement;
root.dataset.surface = new URLSearchParams(location.search).get('surface') ?? root.dataset.surface ?? 'tab';

const style = document.createElement('style');
style.textContent = CONTENT_CSS;
document.head.append(style);

// Opened as a plain web page (development): there is no service worker, so
// the background logic runs in the page.
if (platform.name === 'web') startBackground();
platform.sidePanel.prepare();

createRoot(document.getElementById('root')!).render(<App />);
void initStore();
