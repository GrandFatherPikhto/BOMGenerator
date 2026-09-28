import { useState } from 'react';

import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';

import { useAuth } from '../AuthContext.jsx';

/** Sign-in screen shown while authentication is enabled and nobody is signed in. */
export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (loginError) {
      setError(
        loginError.status === 401
          ? 'Неверное имя пользователя или пароль'
          : loginError.message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
      <Paper variant="outlined" sx={{ p: 3, width: 360 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          BOM Generator
        </Typography>
        <form onSubmit={submit}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Имя пользователя"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoFocus
              autoComplete="username"
              required
            />
            <TextField
              label="Пароль"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            <Button type="submit" variant="contained" disabled={busy}>
              Войти
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
