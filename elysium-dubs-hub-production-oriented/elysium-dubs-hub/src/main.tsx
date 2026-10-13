import React from 'react';
import { createRoot } from 'react-dom/client';
import MechaMindApp from './MechaMindApp';
import './mechamind.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><MechaMindApp /></React.StrictMode>);
