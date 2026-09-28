import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import CssBaseline from '@mui/material/CssBaseline';
import { Box, CircularProgress } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import App from './App.jsx';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { SettingsProvider } from './SettingsContext.jsx';
import { UiStateProvider } from './UiStateContext.jsx';
import LoginPage from './pages/LoginPage.jsx';

const theme = createTheme({
  palette: { mode: 'light', primary: { main: '#1565c0' } },
});

function Centered() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
      <CircularProgress />
    </Box>
  );
}

/**
 * The authenticated shell: while authentication is enabled and nobody is signed
 * in, only the login screen is rendered, so the app's providers do not fetch
 * anything on behalf of an anonymous user.
 */
function Root() {
  const { ready, authEnabled, username } = useAuth();

  if (!ready) {
    return <Centered />;
  }
  if (authEnabled && !username) {
    return <LoginPage />;
  }
  return (
    <UiStateProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </UiStateProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
