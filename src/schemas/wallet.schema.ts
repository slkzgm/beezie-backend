import { z } from "zod";

export const transferSchema = z.object({
  amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "Amount must be a positive number")
    .transform((value) => value.trim()),
  destinationAddress: z
    .string()
    .length(42, "Destination address must be a valid EVM address")
    .regex(/^0x[a-fA-F0-9]{40}$/, "Destination address must be a valid EVM address")
});

export type TransferInput = z.infer<typeof transferSchema>;
