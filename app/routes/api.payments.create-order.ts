import type { ActionFunctionArgs } from 'react-router';
import { createOrder } from '~/lib/.server/payments';
import { withSecurity } from '~/lib/security';

/** POST /api/payments/create-order (see app/lib/.server/payments.ts). */
export const action = withSecurity(
  async ({ request, context }: ActionFunctionArgs) => createOrder(request, { env: context.cloudflare?.env }),
  {
    allowedMethods: ['POST'],
  },
);
