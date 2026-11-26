const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || '';

/**
 * Sends the published STB Academy welcome template after a newly registered
 * artist successfully verifies their email. This is deliberately separate
 * from the OTP sender and from other announcement/notification workflows.
 */
export async function sendNewArtistWelcomeEmail(email: string, firstName: string, userId: string): Promise<void> {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    throw new Error('Resend is not configured. Set RESEND_API_KEY and EMAIL_FROM.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `stb-academy-welcome-${userId}`.slice(0, 256),
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      template: {
        id: process.env.RESEND_WELCOME_TEMPLATE_ID || '1dd50c6a-a25d-48ce-9f5b-c458dc16a30a',
        variables: {
          USER_FIRST_NAME: firstName || 'there',
          ACCOUNT_TYPE: 'Independent Artist',
          PORTAL_URL: process.env.STB_PORTAL_URL || 'https://stbacademy.midamapromo.co.za/',
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend welcome email delivery failed (${response.status}): ${await response.text()}`);
  }
}
