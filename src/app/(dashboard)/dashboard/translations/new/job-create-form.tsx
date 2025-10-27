"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  INDUSTRY_OPTIONS,
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  TRANSLATION_ENGINE_OPTIONS,
} from "@/constants/translation";

const formSchema = z.object({
  sourceLanguage: z.string().optional(),
  targetLanguage: z.string().min(2, "Please select a target language"),
  industry: z.string().optional(),
  glossaryId: z.string().optional(),
  teamId: z.string().optional(),
  enginePreference: z
    .enum(["auto", "deepl", "google", "openai", "custom"])
    .default("auto"),
  ocrEnabled: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

interface TeamOption {
  id: string;
  name: string;
}

interface GlossaryOption {
  id: string;
  name: string;
}

interface JobCreateFormProps {
  teamOptions: TeamOption[];
  glossaryOptions?: GlossaryOption[];
  targetLanguageOptions?: ReadonlyArray<{ value: string; label: string }>;
  sourceLanguageOptions?: ReadonlyArray<{ value: string; label: string }>;
  industryOptions?: ReadonlyArray<{ value: string; label: string }>;
  maxUploadBytes: number;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function JobCreateForm({
  teamOptions,
  glossaryOptions = [],
  targetLanguageOptions = TARGET_LANGUAGE_OPTIONS,
  sourceLanguageOptions = SOURCE_LANGUAGE_OPTIONS,
  industryOptions = INDUSTRY_OPTIONS,
  maxUploadBytes,
}: JobCreateFormProps) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sourceLanguage:
        sourceLanguageOptions.length > 0 ? sourceLanguageOptions[0].value : "auto",
      targetLanguage:
        targetLanguageOptions.length > 0 ? targetLanguageOptions[0].value : "en",
      industry: industryOptions.length > 0 ? industryOptions[0].value : "general",
      glossaryId: "",
      teamId: "",
      enginePreference: "auto",
      ocrEnabled: false,
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) {
      setFile(null);
      return;
    }

    if (selected.type !== "application/pdf") {
      setFile(null);
      setFileError("Only PDF files are supported at the moment.");
      return;
    }

    if (selected.size > maxUploadBytes) {
      setFile(null);
      setFileError(`File is too large. Maximum size is ${formatBytes(maxUploadBytes)}.`);
      return;
    }

    setFileError(null);
    setFile(selected);
  };

  const onSubmit = async (values: FormValues) => {
    if (!file) {
      setFileError("Please upload a PDF file to translate.");
      return;
    }
    setFileError(null);

    const formData = new FormData();
    formData.append("file", file);
    const derivedTitle = file.name.replace(/\.[^/.]+$/, "");

    const normalizedSource =
      values.sourceLanguage && values.sourceLanguage !== "auto"
        ? values.sourceLanguage
        : undefined;

    const normalizedIndustry =
      values.industry && values.industry !== "general" ? values.industry : undefined;

    const normalizedGlossary = values.glossaryId || undefined;
    const normalizedTeam = values.teamId || undefined;

    const entries: Record<string, string | boolean | undefined> = {
      title: derivedTitle,
      targetLanguage: values.targetLanguage,
      sourceLanguage: normalizedSource,
      industry: normalizedIndustry,
      glossaryId: normalizedGlossary,
      teamId: normalizedTeam,
      enginePreference: values.enginePreference,
      ocrEnabled: values.ocrEnabled,
    };

    for (const [key, entryValue] of Object.entries(entries)) {
      if (entryValue === undefined) continue;
      if (typeof entryValue === "boolean") {
        formData.append(key, entryValue ? "true" : "false");
      } else {
        formData.append(key, entryValue);
      }
    }

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/translation-jobs", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const errorMessage =
          errorBody?.error === "INVALID_INPUT"
            ? "Some fields are invalid. Please review the form."
            : errorBody?.error
            ? `Unable to create job (${errorBody.error}).`
            : "Unable to create job. Please try again.";
        toast.error(errorMessage);
        return;
      }

      const body = await response.json();
      const jobId: string | undefined = body?.job?.id;

      toast.success("Translation job created. We will start processing shortly.");

      if (jobId) {
        router.push(`/dashboard/translations/${jobId}`);
      } else {
        router.push("/dashboard/translations");
      }
    } catch (error) {
      console.error("Failed to create translation job", error);
      toast.error("Unexpected error while creating job. Please retry.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const errors = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2 space-y-2">
          <Label htmlFor="pdf-file">PDF document</Label>
          <Input
            id="pdf-file"
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={isSubmitting}
          />
          <p className="text-sm text-muted-foreground">
            Upload a PDF file up to {formatBytes(maxUploadBytes)}. Scanned documents are supported when OCR is enabled.
          </p>
          {file ? (
            <p className="text-sm text-muted-foreground">Selected file: {file.name}</p>
          ) : null}
          {fileError ? (
            <p className="text-sm font-medium text-destructive">{fileError}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="targetLanguage">Target language</Label>
          <select
            id="targetLanguage"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            defaultValue={
              targetLanguageOptions.length > 0 ? targetLanguageOptions[0].value : ""
            }
            {...form.register("targetLanguage", {
              required: "Please select a target language",
            })}
            disabled={isSubmitting}
          >
            {targetLanguageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.targetLanguage ? (
            <p className="text-sm font-medium text-destructive">
              {errors.targetLanguage.message}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select the language you want to translate into.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="sourceLanguage">Source language</Label>
          <select
            id="sourceLanguage"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            defaultValue={
              sourceLanguageOptions.length > 0 ? sourceLanguageOptions[0].value : "auto"
            }
            {...form.register("sourceLanguage")}
            disabled={isSubmitting}
          >
            {sourceLanguageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            Choose the original language or leave on auto detect for mixed-language PDFs.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <select
            id="industry"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            defaultValue={industryOptions.length > 0 ? industryOptions[0].value : "general"}
            {...form.register("industry")}
            disabled={isSubmitting}
          >
            {industryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            We tailor terminology and tone based on the industry you select.
          </p>
        </div>

        {teamOptions.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="teamId">Team</Label>
            <select
              id="teamId"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              defaultValue=""
              {...form.register("teamId")}
              disabled={isSubmitting}
            >
              <option value="">Personal workspace</option>
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">
              Jobs created under a team are visible to members with the right permissions.
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="enginePreference">Preferred engine</Label>
          <select
            id="enginePreference"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            defaultValue="auto"
            {...form.register("enginePreference")}
            disabled={isSubmitting}
          >
            {TRANSLATION_ENGINE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            Choose a specific provider or let the system pick the best option automatically.
          </p>
        </div>

        <div className="lg:col-span-2 space-y-2">
          <Label htmlFor="glossaryId">Glossary</Label>
          <select
            id="glossaryId"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            defaultValue=""
            {...form.register("glossaryId")}
            disabled={isSubmitting}
          >
            <option value="">No glossary</option>
            {glossaryOptions.map((glossary) => (
              <option key={glossary.id} value={glossary.id}>
                {glossary.name}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            Select a glossary to enforce terminology consistency. Manage glossaries from the dashboard.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="flex items-center gap-2" htmlFor="ocr-toggle">
          <input
            id="ocr-toggle"
            type="checkbox"
            className="h-4 w-4 rounded border border-input text-primary focus:ring-primary"
            checked={form.watch("ocrEnabled")}
            onChange={(event) => form.setValue("ocrEnabled", event.target.checked)}
            disabled={isSubmitting}
          />
          Enable OCR for scanned PDFs
        </Label>
        <p className="text-sm text-muted-foreground">
          OCR extracts text from scanned pages and images. Additional processing time may apply.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting || !form.watch("targetLanguage")}>
          {isSubmitting ? "Creating…" : "Create translation job"}
        </Button>
        <Button
          type="reset"
          variant="ghost"
          disabled={isSubmitting}
          onClick={() => {
            form.reset({
              sourceLanguage:
                sourceLanguageOptions.length > 0 ? sourceLanguageOptions[0].value : "auto",
              targetLanguage:
                targetLanguageOptions.length > 0 ? targetLanguageOptions[0].value : "en",
              industry: industryOptions.length > 0 ? industryOptions[0].value : "general",
              glossaryId: "",
              teamId: "",
              enginePreference: "auto",
              ocrEnabled: false,
            });
            setFile(null);
            setFileError(null);
          }}
        >
          Reset
        </Button>
      </div>
    </form>
  );
}
