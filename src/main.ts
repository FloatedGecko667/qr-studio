import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { app as state } from './lib/app.svelte';
import { loadLocale } from './lib/i18n/index.svelte';
import { registerFonts } from './lib/render/font';

registerFonts();

// The dictionary is its own chunk; mount once it has arrived so no raw keys are shown.
await loadLocale(state.settings.locale);
const app = mount(App, { target: document.getElementById('app')! });

export default app;
