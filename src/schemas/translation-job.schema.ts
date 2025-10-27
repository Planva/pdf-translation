import { z } from "zod";
import { TRANSLATION_ENGINE } from "@/db/schema";

const engineEnum = z.enum(Object.values(TRANSLATION_ENGINE) as [string, ...string[]]);

export const createTranslationJobSchema = z.object({
  title: z.string().max(255).optional(),
  sourceLanguage: z.string().min(2).max(16).optional(),
  targetLanguage: z.string().min(2).max(16),
  industry: z.string().max(100).optional(),
  glossaryId: z.string().min(10).max(128).optional(),
  teamId: z.string().min(10).max(128).optional(),
  enginePreference: engineEnum.optional().default(TRANSLATION_ENGINE.AUTO),
  ocrEnabled: z.coerce.boolean().optional().default(false),
});

export type CreateTranslationJobInput = z.infer<typeof createTranslationJobSchema>;
