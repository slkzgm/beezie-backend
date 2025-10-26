import { z } from 'zod';

export const transferSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(
      /^(?!0+(?:\.0+)?$)\d+(?:\.\d{1,6})?$/,
      'Amount must be a positive number with up to 6 decimal places',
    ),
  destinationAddress: z
    .string()
    .length(42, 'Destination address must be a valid EVM address')
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Destination address must be a valid EVM address'),
});

export type TransferInput = z.infer<typeof transferSchema>;
