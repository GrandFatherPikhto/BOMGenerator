import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import App from './App.jsx';
import { SettingsProvider } from './SettingsContext.jsx';

const theme = createTheme({
  palette: { mode: 'light', primary: { main: '#1565c0' } },
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
