import React, { useEffect } from 'react';
import studioImage from '../../assets/images/midama_hero_studio_1790261726731.jpg';
import { Disc3 } from 'lucide-react';

const platforms = [
  'Spotify', 'Apple Music', 'YouTube Music', 'Audiomack', 'Deezer',
  'Amazon Music', 'TIDAL', 'Shazam', 'Boomplay', 'TikTok Music'
];

export const ReleasesShowcase: React.FC = () => {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const lane = (reverse = false) => (
    <div className={`dsp-track ${reverse ? 'dsp-track-reverse' : ''}`}>
      {[...platforms, ...platforms].map((platform, i) => (
        <span className="dsp-pill" key={`${platform}-${i}`}>
          <span className="dsp-dot" />{platform}
        </span>
      ))}
    </div>
  );

  return (
    <section id="releases" className="release-showcase relative overflow-hidden border-y border-neutral-800/80 py-20 sm:py-28">
      <div className="release-glow release-glow-one" />
      <div className="release-glow release-glow-two" />
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center" data-reveal="up">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[.18em] text-orange-300">
            <Disc3 size={14} /> The STB Academy catalogue
          </div>
          <h2 className="font-['Space_Grotesk'] text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Our artists. <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-300">Everywhere.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-neutral-400 sm:text-lg">
            Discover music released through STB Academy. One growing catalogue, built for listeners across the world.
          </p>
        </div>

        <div className="dsp-marquee mt-12 space-y-3" aria-label="Digital music platforms">
          {lane(false)}
          {lane(true)}
        </div>

        <div className="ma-artist-manifesto mt-20 grid overflow-hidden rounded-3xl border border-white/10 lg:grid-cols-[1.05fr_.95fr]" data-reveal="up">
          <div className="ma-manifesto-image relative min-h-[260px] lg:min-h-[390px]">
            <img src={studioImage} alt="Music production studio representing independent artists building their sound" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/15 via-black/20 to-black/75 lg:bg-gradient-to-r" />
            <span className="absolute bottom-5 left-5 rounded-full border border-white/25 bg-black/45 px-3 py-1.5 text-[10px] font-bold tracking-[.22em] text-white backdrop-blur-md">INDEPENDENT BY NATURE</span>
          </div>
          <div className="ma-manifesto-copy flex flex-col justify-center p-7 sm:p-10 lg:p-14">
            <span className="mb-4 text-xs font-extrabold uppercase tracking-[.24em] text-orange-400">Your sound deserves a world stage</span>
            <h3 className="max-w-xl font-['Space_Grotesk'] text-3xl font-black leading-tight text-white sm:text-4xl">Start where you are. Build what the world will hear.</h3>
            <p className="mt-5 max-w-xl leading-7 text-neutral-400">Every catalogue starts with a first release. Keep creating, keep learning, and keep your identity in the music. STB Academy is here to help independent voices move from local sessions to a global audience.</p>
            <div className="mt-7 flex items-center gap-3"><span className="h-px w-10 bg-orange-500"/><span className="text-xs font-black uppercase tracking-[.2em] text-neutral-300">Township rhythm. Global reach.</span></div>
          </div>
        </div>
      </div>
    </section>
  );
};
