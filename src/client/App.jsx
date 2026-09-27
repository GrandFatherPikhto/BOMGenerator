import { AppBar, Box, Container, Tab, Tabs, Toolbar, Typography } from '@mui/material';
import { Link as RouterLink, Route, Routes, useLocation } from 'react-router-dom';

import { PAGE_WIDTH, useSettings } from './SettingsContext.jsx';

import BoardPage from './pages/BoardPage.jsx';
import BoardsPage from './pages/BoardsPage.jsx';
import CategoriesPage from './pages/CategoriesPage.jsx';
import CommonPurchasesPage from './pages/CommonPurchasesPage.jsx';
import ManualPage from './pages/ManualPage.jsx';
import PurchasesPage from './pages/PurchasesPage.jsx';
import SellersPage from './pages/SellersPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const TABS = [
  { label: 'Платы', value: '/', to: '/' },
  { label: 'Закупки', value: '/purchases', to: '/purchases' },
  { label: 'Общие закупки', value: '/common', to: '/common' },
  { label: 'Докупить', value: '/manual', to: '/manual' },
  { label: 'Продавцы/Товары', value: '/sellers', to: '/sellers' },
  { label: 'Категории разбора', value: '/categories', to: '/categories' },
  { label: 'Настройки', value: '/settings', to: '/settings' },
];

function activeTab(pathname) {
  if (pathname.startsWith('/boards')) {
    return '/';
  }
  return pathname;
}

export default function App() {
  const location = useLocation();
  const current = activeTab(location.pathname);
  const { settings } = useSettings();
  const maxWidth = PAGE_WIDTH[settings?.pageWidth] ?? PAGE_WIDTH.normal;

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#f5f6f8' }}>
      <AppBar position="static" color="primary">
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ mr: 4 }}>
            BOM Generator
          </Typography>
          <Tabs
            value={TABS.some((tab) => tab.value === current) ? current : false}
            textColor="inherit"
            indicatorColor="secondary"
            variant="scrollable"
            scrollButtons="auto"
          >
            {TABS.map((tab) => (
              <Tab
                key={tab.value}
                label={tab.label}
                value={tab.value}
                component={RouterLink}
                to={tab.to}
              />
            ))}
          </Tabs>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ maxWidth, mx: 'auto', py: 3 }}>
        <Routes>
          <Route path="/" element={<BoardsPage />} />
          <Route path="/boards/:id" element={<BoardPage />} />
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/manual" element={<ManualPage />} />
          <Route path="/common" element={<CommonPurchasesPage />} />
          <Route path="/sellers" element={<SellersPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Container>
    </Box>
  );
}
