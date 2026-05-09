/**
 * Email template helpers for auth magic links.
 * No AI language per brand rules.
 */

export interface EmailContent {
  subject: string;
  html: string;
}

/**
 * Builds the magic link email content.
 * @param verifyUrl - Full URL to the verify endpoint (e.g., https://opinionated-imagen.nqh.workers.dev/auth/verify?token=xxx)
 */
export function buildMagicLinkEmail(verifyUrl: string): EmailContent {
  return {
    subject: 'Sign in to Opinionated Imagen',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:420px;background:#fff;border-radius:12px;padding:40px 32px;text-align:center;">
          <tr>
            <td>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#1a1a1a;letter-spacing:-0.3px;">Opinionated Imagen</h1>
              <p style="margin:0 0 28px;font-size:14px;color:#666;line-height:1.5;">Click the button below to sign in. This link expires in 15 minutes.</p>
              <a href="${verifyUrl}" style="display:inline-block;padding:12px 32px;background:#1a1a1a;color:#fff;border-radius:8px;font-size:15px;font-weight:500;text-decoration:none;">Sign in</a>
              <p style="margin:28px 0 0;font-size:12px;color:#999;line-height:1.5;">If you didn't request this email, you can safely ignore it.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:28px 0 0;">
              <p style="margin:16px 0 0;font-size:11px;color:#bbb;">Designed by <a href="https://bybrandr.com" style="color:#bbb;text-decoration:none;">brandr</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}
