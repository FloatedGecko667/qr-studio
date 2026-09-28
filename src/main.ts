import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { registerFonts } from './lib/render/font';

registerFonts();

const app = mount(App, { target: document.getElementById('app')! });

export default app;
