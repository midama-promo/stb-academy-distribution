import React, { useEffect, useState } from 'react';
import { Logo } from '../common/Logo';
import { Mail, Shield, Lock, ArrowUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface FooterProps {
  onOpenSignIn: () => void;
  onOpenContact: () => void;
  onGoToDashboard: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenSignIn,
  onOpenContact,
  onGoToDashboard,
}) => {
  const { user } = useAuth();
  const [socialLinks, setSocialLinks] = useState<Array<{ platform: string; url: string }>>([]);
  useEffect(() => { let alive = true; const load = () => fetch('/api/site-settings', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => { if (alive) setSocialLinks(data?.settings?.socialLinks || []); }).catch(() => {}); const update = (event: Event) => setSocialLinks((event as CustomEvent).detail?.socialLinks || []); void load(); window.addEventListener('stbacademy:site-settings-updated', update); return () => { alive = false; window.removeEventListener('stbacademy:site-settings-updated', update); }; }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="bg-neutral-950 text-neutral-400 text-xs border-t border-neutral-900 pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-neutral-900">
          
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <Logo size="md" showTagline={true} onClick={scrollToTop} />
            <p className="text-neutral-400 text-xs leading-relaxed max-w-sm mt-3">
              STB Academy - Distribution provides artist release administration, royalty tracking and release support.
            </p>
            <div className="flex items-center gap-2 text-neutral-300 pt-2">
              <Mail className="w-3.5 h-3.5 text-orange-500" />
              <a href="mailto:support@stbacademy.co.za" className="hover:text-white transition-colors">
                support@stbacademy.co.za
              </a>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="space-y-3">
            <h4 className="text-neutral-200 font-bold uppercase tracking-wider font-mono text-[11px]">
              Platform
            </h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => scrollTo('how-it-works')} className="hover:text-white transition-colors">
                  How It Works
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('requirements')} className="hover:text-white transition-colors">
                  Audio & Artwork Specs
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('quality-control')} className="hover:text-white transition-colors">
                  Review & QC Process
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('amapiano-focus')} className="hover:text-white transition-colors">
                  Amapiano & Afro Sound
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('policies')} className="hover:text-white transition-colors">
                  Royalty & Platform Policies
                </button>
              </li>
            </ul>
          </div>

          {/* Portals & Access */}
          <div className="space-y-3">
            <h4 className="text-neutral-200 font-bold uppercase tracking-wider font-mono text-[11px]">
              Portals
            </h4>
            <ul className="space-y-2">
              {user ? (
                <li>
                  <button onClick={onGoToDashboard} className="text-orange-400 hover:text-orange-300 font-semibold flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    <span>{user.role === 'admin' ? 'Admin Portal' : 'Client Dashboard'}</span>
                  </button>
                </li>
              ) : (
                <>
                  <li>
                    <button onClick={onOpenSignIn} className="hover:text-white transition-colors flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-orange-500" />
                      <span>Sign In</span>
                    </button>
                  </li>
                  <li>
                    <a href="/" target="_blank" rel="noreferrer" className="text-orange-400 hover:text-orange-300 font-semibold transition-colors">
                      New Artist Portal
                    </a>
                  </li>
                </>
              )}
              <li>
                <button onClick={onOpenContact} className="hover:text-white transition-colors">
                  Contact Management
                </button>
              </li>
            </ul>
          </div>

          {/* Compliance & Standards */}
          <div className="space-y-3">
            <h4 className="text-neutral-200 font-bold uppercase tracking-wider font-mono text-[11px]">
              Compliance
            </h4>
            <p className="text-[11px] text-neutral-400 leading-normal">
              Audio: MP3 masters only.
            </p>
            <p className="text-[11px] text-neutral-400 leading-normal">
              Artwork: 3000×3000 to 4000×4000 pixels square JPG/PNG.
            </p>
            <p className="text-[11px] text-neutral-400 leading-normal">
              Master ownership: Artists retain 100% ownership of their masters.
            </p>
          </div>

        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-neutral-400 text-[11px]">
          <div>
            {new Date().getFullYear()} (C) STB Academy
          </div>
          <div className="flex items-center gap-6">
            <span>South Africa</span>
            <span>·</span>
            <button onClick={scrollToTop} className="flex items-center gap-1 text-neutral-300 hover:text-white transition-colors">
              <span>Back to Top</span>
              <ArrowUp className="w-3 h-3" />
            </button>
          </div>
        </div>

        {socialLinks.length > 0 && <div className="flex flex-wrap justify-center gap-3 border-t border-neutral-900 pt-6">{socialLinks.map((link, index) => <a key={`${link.platform}-${index}`} href={link.url} target="_blank" rel="noreferrer" className="rounded-full border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-300 transition hover:border-orange-700 hover:text-white">{link.platform}</a>)}</div>}
      </div>
    </footer>
  );
};
