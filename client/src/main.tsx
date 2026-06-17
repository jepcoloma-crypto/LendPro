import React from 'react';
import ReactDOM from 'react-dom/client';
import { toaster } from 'rsuite';
import App from './App';
import './index.css';

const origPush = toaster.push.bind(toaster);
toaster.push = (message: any, options?: any) => origPush(message, options, ReactDOM.createRoot);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
