import React from 'react';
import { createRoot } from 'react-dom/client';
import MechaMindApp from './MechaMindApp';
import './mechamind.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(error => {
      console.warn('App installation support could not be enabled:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><MechaMindApp /></React.StrictMode>);
