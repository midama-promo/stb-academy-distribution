# STB Academy - Distribution

A multi-label-ready artist release administration portal built with React, Express, TypeScript, Neon PostgreSQL and Cloudflare R2.

## Access model

- Platform owner account: configured privately in the server authorization layer.
- Operations administrators: `mxldiroba@gmail.com` and `external.usage8@yahoo.com`.
- Artist accounts: public self-registration with email OTP verification.

The API enforces permissions server-side. Operations administrators can review releases (approve, request corrections, deny), view artists and submissions, manage public branding/social links, and chat with artists. Owner-only controls include royalty assignment, final delivery statuses, pre-save links, ISRC/UPC assignment, payout processing, campaign sending, artwork replacement/removal, account administration, and backup/restore.

## Royalty and payout workflow

Gross royalties are split 80% artist, 10% operations administrator and 10% platform owner. The owner can assign/edit each operations administrator's payable allocation and each release's gross royalty amount. Artists see their 80% release balance. Artists and operations administrators can link PayPal payout identifiers and submit payment requests. The owner sees all linked PayPal identifiers and pending requests, transfers funds manually, then marks a request Paid.

Only PayPal email, mobile, username and PayPal.Me identifiers are accepted. Never collect PayPal passwords, PINs, OTPs or card security codes.

## Submission workflow

- Audio: at least one MP3 master and cover artwork are mandatory.
- Previously released audio: original release date, ISRC and UPC are required.
- Video: cover artwork, metadata and an accessible external video-master download URL are mandatory. Artists must make the link downloadable by the STB Academy team.
- Artists can edit submission details and replace audio/artwork within 12 hours of submission, or whenever corrections are requested.
- Artists can delete their submissions and request takedowns.
- Owner-only final release statuses: Delivered, In Distribution and Rejected. Pre-save links are owner-only and are available for Delivered/In Distribution releases.
- Owner can assign release UPC and ISRCs, including per-track ISRCs, and replace/remove cover artwork for audio and video submissions.

## Messaging and account controls

Artist and administrator dashboards include a support-message thread. Artists can delete their accounts after a two-step warning; this permanently removes their profile, submissions, payout requests and support messages. Administrators accessing an artist account cannot request withdrawals, edit PayPal payout details, or delete the artist account through impersonation.

## Fresh infrastructure

Create a dedicated Neon database and Cloudflare R2 bucket for this installation. Do not reuse another label's database or storage bucket. Configure the following Render environment variables from `.env.example`:

- `STB_DATABASE_URL`
- `STB_SESSION_SECRET`
- `OTP_HASH_SECRET`
- `DOWNLOAD_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `ADMIN_NOTIFICATION_EMAIL`
- `STB_R2_ACCOUNT_ID`
- `STB_R2_BUCKET_NAME`
- `STB_R2_ACCESS_KEY_ID`
- `STB_R2_SECRET_ACCESS_KEY`

The archive contains placeholders only. Add actual credentials privately in Render; do not commit them to GitHub or share them in chat.

## Tenant cleanup

The application uses the STB-specific Neon state table. On startup, legacy catalogue records are cleared and persisted, the retired administrator account is removed, the two operations administrator accounts are ensured, and legacy branding references are cleared. The Create Catalogue interface and write endpoints are retired. Backup import also ignores legacy catalogue records.

## Build and run

```bash
npm install
npm run lint
npm run build
npm start
```

Deploy as a Node service on Render with Node 20.19 or newer. Set a unique session secret and verify email delivery, Neon connectivity and R2 connectivity before inviting artists.

## Validation note

This archive has been syntax-checked with the TypeScript transpiler. A full `npm run lint` and Vite production build could not be run in this environment because project dependencies were not installed. Complete those checks after `npm install`, then test the owner, both operations-admin, artist, impersonation, audio, video, PayPal request and payment-processing flows in a staging deployment before production use.
