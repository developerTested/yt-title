import { z } from "zod";

export const channelSubmitSchema = z.object({
  email: z.object({
    email: z.string().email("Invalid Email Address"),
  }),
  channel: z.string(),
  jobId: z.string().optional(),
});
