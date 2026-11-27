import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppDataProvider } from './context/AppDataContext';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';

// Lazy-loaded route chunks keep the landing-page JS payload minimal.
const StatusPage = lazy(() =>
  import('./pages/StatusPage').then((m) => ({ default: m.StatusPage })),
);
const TwinPage = lazy(() =>
  import('./pages/TwinPage').then((m) => ({ default: m.TwinPage })),
);
const LabPage = lazy(() =>
  import('./pages/LabPage').then((m) => ({ default: m.LabPage })),
);
const ImpactPage = lazy(() =>
  import('./pages/ImpactPage').then((m) => ({ default: m.ImpactPage })),
);
const ModelPage = lazy(() =>
  import('./pages/ModelPage').then((m) => ({ default: m.ModelPage })),
);
const MethodPage = lazy(() =>
  import('./pages/MethodPage').then((m) => ({ default: m.MethodPage })),
);
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })),
);

function RouteLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 space-y-6"
    >
      <div className="space-y-3">
        <div className="atlas-loading-bar h-3 w-44 rounded" aria-hidden="true" />
        <div className="atlas-loading-bar h-8 w-80 max-w-full rounded" aria-hidden="true" />
        <p className="font-mono text-xs text-[#93A4BD]">
          Loading workspace module…
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12" aria-hidden="true">
        <div className="lg:col-span-5 atlas-panel rounded-lg p-6 space-y-4">
          <div className="atlas-loading-bar h-5 w-48 rounded" />
          <div className="atlas-loading-bar h-24 w-full rounded" />
        </div>
        <div className="lg:col-span-7 atlas-panel rounded-lg p-6">
          <div className="atlas-loading-bar h-64 w-full rounded" />
        </div>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/twin" element={<TwinPage />} />
          <Route path="/lab" element={<LabPage />} />
          <Route path="/impact" element={<ImpactPage />} />
          <Route path="/model" element={<ModelPage />} />
          <Route path="/method" element={<MethodPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AppDataProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppDataProvider>
  );
}
