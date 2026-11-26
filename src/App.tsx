/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/public/Navbar';
import { Hero } from './components/public/Hero';
import { HowItWorks } from './components/public/HowItWorks';
import { Requirements } from './components/public/Requirements';
import { QualityControl } from './components/public/QualityControl';
import { AmapianoFocus } from './components/public/AmapianoFocus';
import { ContactSection } from './components/public/ContactSection';
import { Policies } from './components/public/Policies';
import { Footer } from './components/public/Footer';
import { ReleasesShowcase } from './components/public/ReleasesShowcase';

// Modals & Dashboards
import { AuthModal, AuthTabMode } from './components/auth/AuthModal';
import { ReleaseDetailModal } from './components/client/ReleaseDetailModal';
import { ClientDashboard } from './components/client/ClientDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { PublicSharePage } from './components/public/PublicSharePage';
import { NotificationCenterModal } from './components/client/NotificationCenterModal';
import { Release } from './types';

function ThemeControl() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem('stbacademy-theme') as 'dark' | 'light') || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('stbacademy-theme', theme); } catch { /* private browsing */ }
  }, [theme]);
  return <button type="button" className="ma-theme-toggle" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
    {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}<span>{theme === 'dark' ? 'LIGHT MODE' : 'DARK MODE'}</span>
  </button>;
}

function MotionSystem() {
  useEffect(() => {
    const reveal = () => {
      const candidates = document.querySelectorAll<HTMLElement>('main section, body > #root section, .max-w-7xl > div, [class*="rounded-xl"], [class*="rounded-2xl"], [class*="shadow"]');
      candidates.forEach((el, i) => {
        if (el.closest('.ma-theme-toggle') || el.hasAttribute('data-motion-ready')) return;
        el.setAttribute('data-motion-ready', 'true');
        el.classList.add('ma-motion-item');
        el.dataset.motionDirection = i % 3 === 0 ? 'left' : i % 3 === 1 ? 'up' : 'right';
      });
      const items = document.querySelectorAll<HTMLElement>('.ma-motion-item:not(.ma-motion-visible)');
      if (!('IntersectionObserver' in window)) { items.forEach(el => el.classList.add('ma-motion-visible')); return; }
      items.forEach(el => observer.observe(el));
    };
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('ma-motion-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.08, rootMargin: '0px 0px -25px 0px' });
    reveal();
    const mutation = new MutationObserver(() => reveal());
    mutation.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutation.disconnect(); };
  }, []);
  return null;
}

function BrandCopyright() {
  return <div className="stb-copyright">{new Date().getFullYear()} (C) STB Academy</div>;
}

function MainContent() {
  const { user, isLoading, isImpersonating } = useAuth();

  // Navigation view state
  const [currentView, setCurrentView] = useState<'public' | 'client' | 'admin' | 'share'>('public');
  const [shareRefNumber, setShareRefNumber] = useState<string | null>(null);

  // Modals state
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<AuthTabMode>('signin');
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const openAuth = (tab: AuthTabMode = 'signin') => {
    setAuthTab(tab);
    setIsAuthOpen(true);
  };

  // Check URL parameters on mount (?ref=..., ?auth=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get('ref');
    const authParam = params.get('auth');

    if (refParam) {
      setShareRefNumber(refParam.toUpperCase());
      setCurrentView('share');
    } else if (authParam) {
      openAuth('signin');
    }
  }, []);

  // When user signs in, automatically switch to appropriate portal view if still on public
  useEffect(() => {
    // Authentication is the source of truth for portal routing. This also fixes the
    // stale-view bug where an admin could inherit a previous client's dashboard.
    if (currentView === 'share') return;
    if (user) {
      setCurrentView(user.role === 'admin' ? 'admin' : 'client');
    } else {
      setCurrentView('public');
    }
  }, [user]);

  const handleOpenShare = (refNumber: string) => {
    setShareRefNumber(refNumber);
    setCurrentView('share');
    setSelectedRelease(null);
    window.history.pushState({}, '', `?ref=${refNumber}`);
  };

  const handleBackToPublic = () => {
    setShareRefNumber(null);
    if (user) {
      setCurrentView(user.role === 'admin' ? 'admin' : 'client');
    } else {
      setCurrentView('public');
    }
    window.history.pushState({}, '', window.location.pathname);
  };

  const handleGoToDashboard = () => {
    if (!user) {
      openAuth('signin');
    } else if (user.role === 'admin') {
      setCurrentView('admin');
    } else {
      setCurrentView('client');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-neutral-400 space-y-4">
        <div className="w-10 h-10 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono tracking-wider">INITIALIZING STB ACADEMY - DISTRIBUTION...</span>
      </div>
    );
  }

  // 1. Shareable Release Showcase view
  if (currentView === 'share' && shareRefNumber) {
    return (
      <PublicSharePage
        refNumber={shareRefNumber}
        onBack={handleBackToPublic}
      />
    );
  }

  // 2. Admin Portal view
  if (user?.role === 'admin' && currentView === 'admin') {
    return (
      <>
        <AdminDashboard
          onSelectRelease={(rel) => setSelectedRelease(rel)}
          onOpenSharePage={handleOpenShare}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
          onGoHome={() => setCurrentView('public')}
          onStatusUpdated={(updated) => {
            setSelectedRelease(updated);
            window.dispatchEvent(new CustomEvent('stbacademy:release-status-updated', { detail: updated }));
          }}
        />

        {/* Release Detail Inspector */}
        <ReleaseDetailModal
          release={selectedRelease}
          isOpen={selectedRelease !== null}
          onClose={() => setSelectedRelease(null)}
          onOpenSharePage={handleOpenShare}
          isAdmin={true}
          isSuperAdmin={user.isPlatformOwner === true}
          allowClientActions={!isImpersonating}
          onStatusUpdated={(updated) => {
            setSelectedRelease(updated);
            window.dispatchEvent(new CustomEvent('stbacademy:release-status-updated', { detail: updated }));
          }}
        />

        {/* Notification Center */}
        <NotificationCenterModal
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
        />
        <BrandCopyright />
      </>
    );
  }

  // 3. Client Dashboard view
  if (user && currentView === 'client') {
    return (
      <>
        <ClientDashboard
          onSelectRelease={(rel) => setSelectedRelease(rel)}
          onOpenSharePage={handleOpenShare}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
          onGoHome={() => setCurrentView('public')}
        />

        {/* Release Detail View */}
        <ReleaseDetailModal
          release={selectedRelease}
          isOpen={selectedRelease !== null}
          onClose={() => setSelectedRelease(null)}
          onOpenSharePage={handleOpenShare}
          isAdmin={false}
          allowClientActions={!isImpersonating}
        />

        {/* Notification Center */}
        <NotificationCenterModal
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
        />
        <BrandCopyright />
      </>
    );
  }

  // 4. Default Public Website Landing Page
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-between selection:bg-orange-600 selection:text-white">
      <div>
        {/* Navigation bar */}
        <Navbar
          onOpenSignIn={() => openAuth('signin')}
        onOpenSignUp={() => openAuth('signup')}
          onOpenContact={() => {
            const el = document.getElementById('contact');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          onGoToDashboard={handleGoToDashboard}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
        />

        {/* Hero Section */}
        <Hero
          onOpenSignIn={() => openAuth('signin')}
          onOpenContact={() => {
            const el = document.getElementById('contact');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          onLookupRef={handleOpenShare}
        />

        <section className="relative overflow-hidden border-y border-orange-900/40 bg-gradient-to-br from-orange-950/50 via-neutral-950 to-neutral-900 py-16"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="mb-8 max-w-3xl"><p className="text-xs font-black uppercase tracking-[.25em] text-orange-400">The STB Academy artist offer</p><h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Your sound. Your rights. A worldwide release pathway.</h2><p className="mt-3 text-sm leading-6 text-neutral-400">One label relationship for audio, video, royalties and catalogue administration.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[{v:'80 / 20',t:'Artist / STB Academy royalty split'},{v:'100%',t:'Artist master ownership retained'},{v:'300+',t:'Music stores in the distribution network'},{v:'100+',t:'Video stores and platforms'},{v:'FREE',t:'YouTube Official Artist Channel requests'},{v:'FREE',t:'Eligible YouTube Content ID submissions'},{v:'FREE',t:'Video distribution submissions, including eligible VEVO delivery'},{v:'UNLIMITED',t:'Artist profiles and release submissions'}].map(x=><div key={x.t} className="rounded-2xl border border-orange-900/40 bg-neutral-900/70 p-5"><strong className="block text-2xl font-black text-orange-300">{x.v}</strong><span className="mt-2 block text-xs leading-5 text-neutral-300">{x.t}</span></div>)}</div><p className="mt-5 max-w-4xl text-[10px] leading-5 text-neutral-500">Third-party store counts, free service availability, YouTube OAC / Content ID eligibility, VEVO and all platform deliveries are subject to the external distribution partner's current coverage, terms, technical requirements and approval. Submission does not guarantee acceptance or placement.</p></div></section>

        {/* Public client releases catalogue */}
        <ReleasesShowcase />

        {/* How It Works Section */}
        <HowItWorks />


        {/* Technical Requirements Section */}
        <Requirements />

        {/* Review & Quality Control Process */}
        <QualityControl />

        {/* Amapiano & Afro independent artist focus */}
        <AmapianoFocus />

        {/* Public Policies */}
        <Policies />

        {/* Contact / Enquiries Form */}
        <ContactSection />
      </div>

      {/* Professional Footer */}
      <Footer
        onOpenSignIn={() => openAuth('signin')}
        onOpenContact={() => {
          const el = document.getElementById('contact');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
        onGoToDashboard={handleGoToDashboard}
      />
      <BrandCopyright />

      {/* Secure OTP Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        initialTab={authTab}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={() => {
          // Handled via user state effect
        }}
      />

      {/* Notifications Modal */}
      <NotificationCenterModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />
    </div>
  );
}

function AppRoute() {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const reserved = ['', 'index.html', 'favicon.ico', 'robots.txt'];
  return <><MotionSystem /><ThemeControl /><MainContent /></>;
}

export default function App() {
  return <AuthProvider><AppRoute /></AuthProvider>;
}
