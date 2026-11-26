import type { ActionFunctionArgs } from 'react-router';
import { handleWebhook } from '~/lib/.server/payments';
import { withSecurity } from '~/lib/security';

/** POST /api/payments/webhook (see app/lib/.server/payments.ts). */
export const action = withSecurity(
  async ({ request, context }: ActionFunctionArgs) => handleWebhook(request, { env: context.cloudflare?.env }),
  {
    allowedMethods: ['POST'],

    // Razorpay retries webhooks; every request is checked by its signature instead
    rateLimit: false,
  },
);
