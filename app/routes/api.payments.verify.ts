import type { ActionFunctionArgs } from 'react-router';
import { verifyPayment } from '~/lib/.server/payments';
import { withSecurity } from '~/lib/security';

/** POST /api/payments/verify (see app/lib/.server/payments.ts). */
export const action = withSecurity(
  async ({ request, context }: ActionFunctionArgs) => verifyPayment(request, { env: context.cloudflare?.env }),
  {
    allowedMethods: ['POST'],
  },
);
