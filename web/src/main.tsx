import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SwaApp } from './SwaApp';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SwaApp />
  </StrictMode>,
);
