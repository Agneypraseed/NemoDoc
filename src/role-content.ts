import { z } from "zod";

export const roleContent = z
  .string()
  .max(32000)
  .refine(
    (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  );
