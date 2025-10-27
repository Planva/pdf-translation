export const TRANSLATION_ENGINE_OPTIONS = [
  { value: "auto", label: "Auto select" },
  { value: "deepl", label: "DeepL" },
  { value: "google", label: "Google Translate" },
  { value: "openai", label: "OpenAI" },
  { value: "custom", label: "Custom" },
] as const;

export type TranslationEngineValue = (typeof TRANSLATION_ENGINE_OPTIONS)[number]["value"];

export const TARGET_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
] as const;

export const SOURCE_LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto detect" },
  ...TARGET_LANGUAGE_OPTIONS,
] as const;

export const INDUSTRY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "legal", label: "Legal" },
  { value: "medical", label: "Medical" },
  { value: "finance", label: "Finance" },
  { value: "marketing", label: "Marketing" },
  { value: "technical", label: "Technical" },
  { value: "academic", label: "Academic" },
] as const;
