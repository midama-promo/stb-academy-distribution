import React from 'react';
import { FileText, ShieldCheck, ArrowUpRight } from 'lucide-react';

const PolicyLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a href={href} className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-200 transition hover:border-orange-400 hover:bg-orange-500/20 hover:text-white">
    {children}<ArrowUpRight className="h-4 w-4" />
  </a>
);

export const Policies: React.FC = () => (
  <section id="policies" className="border-t border-neutral-900 bg-neutral-950 py-20">
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="mb-10 max-w-3xl">
        <p className="text-xs font-mono uppercase tracking-widest text-orange-500">STB Academy · Legal information</p>
        <h2 className="mt-2 font-['Space_Grotesk'] text-3xl font-extrabold text-white sm:text-4xl">Terms & Conditions and Privacy Policy</h2>
        <p className="mt-3 text-sm leading-6 text-neutral-400">Please read these documents before creating an account or submitting music. They explain the rules for using the platform and how personal information is handled.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <PolicyLink href="#terms-and-conditions"><FileText className="h-4 w-4" />Terms & Conditions</PolicyLink>
          <PolicyLink href="#privacy-policy"><ShieldCheck className="h-4 w-4" />Privacy Policy</PolicyLink>
        </div>
      </div>

      <article id="terms-and-conditions" className="scroll-mt-24 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-orange-400" />
          <h3 className="text-2xl font-extrabold text-white">Terms & Conditions</h3>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Last updated: 27 November 2026</p>
        <div className="mt-6 space-y-6 text-sm leading-7 text-neutral-300">
          <section><h4 className="font-bold text-white">1. About the platform</h4><p>STB Academy – Distribution provides an online service for independent artists and labels to submit sound recordings and related release information for distribution administration. STB Academy is a distribution service and is not the owner of the music submitted by clients.</p></section>
          <section><h4 className="font-bold text-white">2. Accounts and accurate information</h4><p>You must provide accurate, current account, artist, release, contributor and payment information, keep your login credentials secure, and promptly correct information that becomes inaccurate. You are responsible for activity carried out through your account. You must be authorised to act for any artist, label or rights holder you represent.</p></section>
          <section><h4 className="font-bold text-white">3. Rights, permissions and content</h4><p>You must own or control, or have obtained all permissions needed for, every recording, composition, sample, performance, name, image, artwork and other material you submit. You are responsible for obtaining sample clearances, cover-song permissions, contributor consents and any required publishing or other rights clearances. Do not submit infringing, unlawful, misleading, unauthorised or deceptive material.</p><p className="mt-2">You retain ownership of your master recordings. By submitting a release, you grant STB Academy the limited, non-exclusive permission necessary to review, process, deliver, administer, promote as applicable, update and request removal of that release through its distribution partners and service providers. This permission lasts while the release is being administered and for the reasonable period needed to complete delivery, reporting or takedown processes.</p></section>
          <section><h4 className="font-bold text-white">4. Review, delivery and platform decisions</h4><p>Every submission is subject to technical, metadata, rights and quality checks. STB Academy may request corrections, reject or suspend a submission, or request a takedown where information is incomplete, rights are unclear, content breaches these terms, or a partner or digital service provider requires action. Submission does not guarantee acceptance, a release date, playlist placement, monetisation, Content ID eligibility or availability in every territory. Third-party platforms control their own review, availability and removal timelines.</p></section>
          <section><h4 className="font-bold text-white">5. Royalties and ownership</h4><p>For accepted releases, net royalties actually received and attributable to the release are allocated 80% to the Artist and 20% to STB Academy, after applicable upstream deductions, reversals, taxes, adjustments or other amounts charged or withheld by relevant partners. Statements and balances depend on data received from distribution partners. Artists retain 100% ownership of their master recordings; this does not transfer or include publishing ownership.</p></section>
          <section><h4 className="font-bold text-white">6. Payouts</h4><p>Eligible available balances may be requested through the client dashboard using the payout method supported there. Payout requests are subject to review, identity or account checks where appropriate, minimums or processing requirements shown on the platform, and the availability of cleared funds. A dashboard request is not confirmation that payment has been made.</p></section>
          <section><h4 className="font-bold text-white">7. Takedowns and corrections</h4><p>You may request corrections or removal of a release through the platform. Processing times depend on partner systems and digital service providers. A takedown does not erase royalty accounting or obligations relating to activity before removal. Any applicable fee or special release condition must be disclosed to you before it applies.</p></section>
          <section><h4 className="font-bold text-white">8. Prohibited use and suspension</h4><p>You may not misuse the platform, interfere with its security, upload malicious files, impersonate another person, manipulate streams or reporting, submit content without the necessary rights, or use the service for unlawful purposes. We may restrict or suspend access while investigating suspected misuse or a rights complaint.</p></section>
          <section><h4 className="font-bold text-white">9. Service availability and liability</h4><p>We aim to keep the platform available and records accurate, but access may be interrupted for maintenance, security, technical issues or circumstances outside our reasonable control. To the extent permitted by South African law, STB Academy is not responsible for decisions, outages, reporting delays or removal timelines controlled by third-party platforms. Nothing in these terms limits rights or remedies that cannot lawfully be excluded.</p></section>
          <section><h4 className="font-bold text-white">10. Changes and contact</h4><p>We may update these terms as the service changes. The current version will be published on this page with its revision date. Continued use after an update means the updated terms apply to future use, subject to applicable law. Questions can be sent to <a className="text-orange-300 underline" href="mailto:support@stbacademy.co.za">support@stbacademy.co.za</a>.</p></section>
        </div>
      </article>

      <article id="privacy-policy" className="mt-8 scroll-mt-24 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-orange-400" />
          <h3 className="text-2xl font-extrabold text-white">Privacy Policy</h3>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Last updated: 27 November 2026</p>
        <div className="mt-6 space-y-6 text-sm leading-7 text-neutral-300">
          <section><h4 className="font-bold text-white">1. Who is responsible</h4><p>This policy explains how STB Academy – Distribution handles personal information when you visit the public website, create an account, use the client or admin portal, submit a release or contact the team. For privacy questions, contact <a className="text-orange-300 underline" href="mailto:support@stbacademy.co.za">support@stbacademy.co.za</a>.</p></section>
          <section><h4 className="font-bold text-white">2. Information we may collect</h4><p>Depending on how you use the service, information may include your name, email address, account and authentication details, artist or label details, profile links, release metadata, contributor information, audio files, artwork, lyrics and other files you choose to submit. We may also process OAC request details, messages sent to support, payout details you provide, and technical information such as log records, browser/device information and security events.</p></section>
          <section><h4 className="font-bold text-white">3. How we use information</h4><p>We use information to create and secure accounts, verify access, process and administer releases, communicate about submissions and account activity, handle OAC requests and support queries, maintain royalty and payout records, prevent fraud or misuse, improve platform reliability, meet legal obligations and protect our rights and the rights of users.</p></section>
          <section><h4 className="font-bold text-white">4. Sharing and service providers</h4><p>We share only information reasonably needed to operate the service with relevant distribution partners, digital service providers, hosting and storage providers, email delivery providers, payment or payout providers, and professional or legal advisers where necessary. Information may also be disclosed where required by law, to respond to a valid legal request, or to protect users, the platform or another person's rights. We do not publish private account information for general public viewing.</p></section>
          <section><h4 className="font-bold text-white">5. Cross-border processing</h4><p>Some service providers or distribution partners may process information in countries outside South Africa. Where this happens, we take steps intended to ensure that the transfer is permitted under applicable data-protection law and that appropriate safeguards are used.</p></section>
          <section><h4 className="font-bold text-white">6. Security and retention</h4><p>We use reasonable technical and organisational measures designed to protect information against unauthorised access, loss, misuse or alteration. No online system can be guaranteed completely secure. We retain information for as long as reasonably necessary for the purposes described in this policy, including account administration, release delivery, royalty accounting, dispute handling, security and legal or regulatory obligations.</p></section>
          <section><h4 className="font-bold text-white">7. Your choices and rights</h4><p>Subject to applicable law, including the Protection of Personal Information Act (POPIA), you may ask to access, correct or delete personal information, object to or restrict certain processing, or withdraw consent where processing is based on consent. Some records may need to be retained to meet legal, contractual, accounting or distribution obligations. We may need to verify your identity before responding.</p></section>
          <section><h4 className="font-bold text-white">8. Cookies and technical data</h4><p>The website and portal may use essential browser storage, session technologies or similar technical tools to support sign-in, security and core functionality. Your browser may provide controls for managing some of these technologies; disabling them may affect the service.</p></section>
          <section><h4 className="font-bold text-white">9. Children</h4><p>The service is intended for people who can lawfully enter into the relevant arrangements. If you are under the age required to contract in your circumstances, you should use the service only with the involvement and permission of a parent or legal guardian.</p></section>
          <section><h4 className="font-bold text-white">10. Updates and complaints</h4><p>We may update this policy and publish the latest version here. If you have a privacy concern, contact us first at <a className="text-orange-300 underline" href="mailto:support@stbacademy.co.za">support@stbacademy.co.za</a>. You may also have the right to lodge a complaint with the Information Regulator of South Africa.</p></section>
        </div>
      </article>

      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
        <article className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5"><h3 className="font-bold text-white">Royalty split</h3><p className="mt-2 text-sm leading-6 text-neutral-400">For each accepted release, net royalties actually received are allocated 80% to the Artist and 20% to STB Academy after applicable upstream deductions and adjustments.</p></article>
        <article className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5"><h3 className="font-bold text-white">Master ownership</h3><p className="mt-2 text-sm leading-6 text-neutral-400">The Artist retains 100% ownership of the master recording. Publishing rights remain separate and must be cleared by the relevant rights holders.</p></article>
      </div>
      <p className="mt-6 text-xs leading-5 text-neutral-500">These website policies are general platform information and are not a substitute for legal advice. Please review them with a South African legal professional before relying on them as final legal documents.</p>
    </div>
  </section>
);
