import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle, Menu, X } from 'lucide-react';
import { PROJECT_FACTS } from '../config/projectFacts';
import { useAppData } from '../context/AppDataContext';
import { FactValue } from './FactValue';

const PRIMARY_NAV = [
  { to: '/twin', label: 'Twin' },
  { to: '/lab', label: 'Lab' },
  { to: '/impact', label: 'Impact' },
  { to: '/model', label: 'Model' },
  { to: '/method', label: 'Method' },
] as const;

const MOBILE_NAV = [
  { to: '/', label: 'Overview' },
  { to: '/twin', label: 'Climate Twin' },
  { to: '/lab', label: 'Experiment Lab' },
  { to: '/impact', label: 'Impact Lens' },
  { to: '/status', label: 'Backend Status' },
  { to: '/model', label: 'Model' },
  { to: '/method', label: 'Methodology' },
  { to: '/about', label: 'About' },
] as const;

export function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { cancelSimulation, loadedIc, baselineRun, clearSyntheticFixture } =
    useAppData();
  const prevPathRef = useRef(location.pathname);

  const isSyntheticFixtureActive = Boolean(
    loadedIc?.isSyntheticFixture || baselineRun?.isSyntheticFixture,
  );

  useEffect(() => {
    setMobileMenuOpen(false);
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      cancelSimulation();
    }
  }, [location.pathname, cancelSimulation]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen flex flex-col bg-[#060B14] text-[#E6EDF7]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xs focus:bg-[#5CC8E0] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#08101D]"
      >
        Skip to main content
      </a>

      {/* Precision 56px 3-zone Top Command Bar */}
      <header className="sticky top-0 z-40 border-b border-[#1E2F4A] bg-[#060B14]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Single-line brand mark */}
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 font-sans text-[15px] font-semibold tracking-[-0.02em] text-[#E6EDF7] hover:text-[#BFE6F2] transition-colors duration-150 whitespace-nowrap shrink-0 py-2"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-[#5CC8E0]"
            >
              <rect
                x="1.5"
                y="1.5"
                width="17"
                height="17"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeOpacity="0.8"
              />
              <path
                d="M1.5 10H18.5M10 1.5V18.5"
                stroke="currentColor"
                strokeWidth="0.9"
                strokeOpacity="0.35"
              />
              <path
                d="M3.5 13.5C6.5 10.8 9.2 12.2 12.2 8.8C13.8 7 15.6 6.2 17 6.6"
                stroke="#BFE6F2"
                strokeWidth="1.5"
                strokeLinecap="square"
              />
            </svg>
            <span>Multiverse of Monsoon</span>
          </Link>

          {/* Zone 2: 5 concise single-line text links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7"
          >
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative inline-flex items-center h-14 text-[13px] font-medium tracking-[0.01em] transition-colors duration-150 whitespace-nowrap shrink-0 border-b-2 ${
                    isActive
                      ? 'border-[#5CC8E0] text-[#E6EDF7]'
                      : 'border-transparent text-[#93A4BD] hover:text-[#E6EDF7] hover:border-[#2C4366]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Zone 3: Single primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <NavLink
              to="/status"
              className={({ isActive }) =>
                `hidden md:inline-flex items-center justify-center min-h-[36px] rounded-xs px-3.5 py-1.5 font-mono text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 border ${
                  isActive
                    ? 'border-[#5CC8E0] bg-[#142238] text-[#BFE6F2]'
                    : 'border-[#2C4366] bg-[#08101D] text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2]'
                }`
              }
            >
              Backend Status
            </NavLink>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation-drawer"
              aria-label={
                mobileMenuOpen
                  ? 'Close navigation menu'
                  : 'Open navigation menu'
              }
              className="inline-flex md:hidden items-center justify-center h-10 w-10 rounded-xs border border-[#1E2F4A] bg-[#08101D] text-[#E6EDF7] hover:border-[#5CC8E0] transition-colors duration-150"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav
            id="mobile-navigation-drawer"
            aria-label="Mobile navigation"
            className="md:hidden border-t border-[#1E2F4A] bg-[#08101D] px-4 py-2"
          >
            <ul className="divide-y divide-[#1E2F4A]/60">
              {MOBILE_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center min-h-[44px] px-2 text-sm font-medium transition-colors duration-150 ${
                        isActive
                          ? 'text-[#5CC8E0]'
                          : 'text-[#E6EDF7] hover:text-[#BFE6F2]'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      {isSyntheticFixtureActive && (
        <div
          role="status"
          data-testid="synthetic-fixture-banner"
          className="border-b border-[#F2A93B] bg-[#142238] px-4 py-2 text-xs text-[#F2A93B]"
        >
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 sm:px-2 lg:px-4">
            <div className="flex items-center gap-2 font-mono font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>SYNTHETIC FIXTURE — NOT MODEL OUTPUT</span>
              <span className="hidden sm:inline font-sans font-normal text-[#E6EDF7]">
                Development test mode active. Exports are watermarked and
                results are not real climate forecasts.
              </span>
            </div>
            <button
              type="button"
              onClick={clearSyntheticFixture}
              className="min-h-[34px] rounded-xs border border-[#F2A93B] bg-[#08101D] px-3 py-1 font-mono text-xs text-[#F2A93B] hover:bg-[#F2A93B] hover:text-[#08101D] transition-colors duration-150 whitespace-nowrap"
            >
              Unload fixture
            </button>
          </div>
        </div>
      )}

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <div key={location.pathname} className="atlas-page-enter">
          <Outlet />
        </div>
      </main>

      {/* Restrained Institutional Colophon Footer */}
      <footer className="border-t border-[#1E2F4A] bg-[#060B14]">
        <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:items-start">
            <div className="md:col-span-5 space-y-2.5">
              <p className="font-sans text-sm font-semibold tracking-tight text-[#E6EDF7]">
                {PROJECT_FACTS.projectTitle} — {PROJECT_FACTS.projectSubtitle}
              </p>
              <p className="text-xs leading-relaxed text-[#93A4BD] max-w-md">
                Offline-first atmospheric visualization workstation for the
                Round 1 1° Indian climate grid contract (32 × 36 cells, 6 raw
                physical channels). Experimental perturbations are exploratory
                sensitivity tests, not validated climate projections.
              </p>
            </div>

            <div className="md:col-span-3 space-y-2">
              <h2 className="font-mono text-[11px] font-medium text-[#93A4BD]">
                Navigation
              </h2>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                {[
                  { to: '/', label: 'Overview' },
                  { to: '/status', label: 'Backend Status' },
                  { to: '/twin', label: 'Climate Twin' },
                  { to: '/lab', label: 'Experiment Lab' },
                  { to: '/impact', label: 'Impact Lens' },
                  { to: '/model', label: 'Model' },
                  { to: '/method', label: 'Methodology' },
                  { to: '/about', label: 'About' },
                ].map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="inline-flex min-h-[32px] items-center text-[#93A4BD] hover:text-[#E6EDF7] transition-colors duration-150"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-4 space-y-2 text-xs text-[#93A4BD]">
              <h2 className="font-mono text-[11px] font-medium text-[#93A4BD]">
                Provenance
              </h2>
              <dl className="space-y-1.5">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-[#93A4BD]">Team:</dt>
                  <dd>
                    <FactValue value={PROJECT_FACTS.teamName} />
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-[#93A4BD]">Repository:</dt>
                  <dd>
                    <FactValue value={PROJECT_FACTS.repositoryUrl} mono />
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-[#93A4BD]">Dataset:</dt>
                  <dd>
                    <FactValue value={PROJECT_FACTS.datasetAttribution} />
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-[#93A4BD]">Licence:</dt>
                  <dd>
                    <FactValue value={PROJECT_FACTS.licence} />
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
