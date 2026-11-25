import React from 'react';

export const Policies: React.FC = () => (
  <section id="policies" className="py-20 border-t border-neutral-900 bg-neutral-950">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-10">
        <p className="text-xs font-mono uppercase tracking-widest text-orange-500">STB Academy Terms</p>
        <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white font-['Space_Grotesk']">Royalty, ownership, payouts & takedowns</h2>
        <p className="mt-3 text-sm text-neutral-400 max-w-3xl">The following public terms explain the current distribution arrangement. Release submissions are also subject to the release agreement and platform requirements.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <article className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/40">
          <h3 className="font-bold text-white">Royalty split</h3>
          <p className="mt-2 text-sm text-neutral-400">For each accepted release, net royalties actually received are allocated 80% to the Artist and 20% to STB Academy after applicable upstream deductions and adjustments. Audio and video earnings are combined in the artist withdrawal balance.</p>
        </article>
        <article className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/40">
          <h3 className="font-bold text-white">Master ownership</h3>
          <p className="mt-2 text-sm text-neutral-400">The Artist retains 100% ownership of the master recording. The distribution licence does not transfer ownership. Publishing rights remain separate and must be cleared by the relevant rights holders.</p>
        </article>
        <article className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/40">
          <h3 className="font-bold text-white">Takedowns</h3>
          <p className="mt-2 text-sm text-neutral-400">Takedown requests are permitted. A takedown requested within 30 days of the release date carries a processing fee only where stated in the signed release terms. Requests after 30 days are handled under the applicable release terms. Platform removal timing depends on the relevant platforms.</p>
        </article>
        <article className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/40">
          <h3 className="font-bold text-white">Payout policy</h3>
          <p className="mt-2 text-sm text-neutral-400">Available royalty funds can be requested through the artist dashboard using linked PayPal payout details. Requests are reviewed and paid manually by STB Academy. The dashboard records the request status and payment completion.</p>
        </article>
      </div>
    </div>
  </section>
);
