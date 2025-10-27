import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createId } from "@paralleldrive/cuid2";

import { JOB_STATUS, TRANSLATION_ENGINE, type TranslationJob } from "@/db/schema";
import { createTranslationJobSchema } from "@/schemas/translation-job.schema";
import { createTranslationJobRecord } from "@/server/translation/jobs";
import { getSessionFromCookie } from "@/utils/auth";

const DEFAULT_MAX_UPLOAD_BYTES = 75 * 1024 * 1024; // 75MB

function sanitizeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9.\-_]+/g, "-").replace(/-+/g, "-");
  const trimmed = base.replace(/^-+|-+$/g, "") || "document.pdf";
  return trimmed.slice(0, 120);
}

function resolveBoolean(value: FormDataEntryValue | null): boolean {
  if (value === null) return false;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (normalized === "on") return true;
    return false;
  }
  return Boolean(value);
}

function serializeJob(job: TranslationJob) {
  const toIso = (val: Date | number | null | undefined) =>
    val instanceof Date ? val.toISOString() : val ? new Date(val).toISOString() : null;

  return {
    ...job,
    ocrEnabled: Boolean(job.ocrEnabled),
    createdAt: toIso(job.createdAt),
    updatedAt: toIso(job.updatedAt),
    startedAt: toIso(job.startedAt),
    completedAt: toIso(job.completedAt),
    cancelledAt: toIso(job.cancelledAt),
  };
}

export async function POST(req: Request) {
  const session = await getSessionFromCookie();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  }

  const maxUploadBytes = Number(process.env.NEXT_PUBLIC_MAX_PDF_SIZE_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES);
  if (Number.isFinite(maxUploadBytes) && file.size > maxUploadBytes) {
    return NextResponse.json(
      { error: "FILE_TOO_LARGE", maxBytes: maxUploadBytes },
      { status: 413 },
    );
  }

  const payload = {
    title: formData.get("title")?.toString(),
    sourceLanguage: formData.get("sourceLanguage")?.toString(),
    targetLanguage: formData.get("targetLanguage")?.toString() ?? "",
    industry: formData.get("industry")?.toString(),
    glossaryId: formData.get("glossaryId")?.toString(),
    teamId: formData.get("teamId")?.toString(),
    enginePreference: formData.get("enginePreference")?.toString(),
    ocrEnabled: resolveBoolean(formData.get("ocrEnabled")),
  };

  const parsed = createTranslationJobSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const { env } = getCloudflareContext();

  if (!env.PDF_SOURCE_BUCKET) {
    throw new Error("PDF_SOURCE_BUCKET binding is not configured");
  }

  const safeName = sanitizeFileName(file.name || "document.pdf");
  const objectKey = [
    "sources",
    session.user.id,
    new Date().toISOString().slice(0, 10),
    `${Date.now()}-${createId()}-${safeName}`,
  ].join("/");

  const contentType = file.type || "application/pdf";

  const fileBuffer = await file.arrayBuffer();

  await env.PDF_SOURCE_BUCKET.put(objectKey, fileBuffer, {
    httpMetadata: {
      contentType,
      contentDisposition: `inline; filename="${safeName}"`,
    },
  });

  let teamId: string | null = null;
  if (data.teamId) {
    const allowedTeam = session.teams?.find((team) => team.id === data.teamId);
    if (!allowedTeam) {
      return NextResponse.json({ error: "TEAM_FORBIDDEN" }, { status: 403 });
    }
    teamId = allowedTeam.id;
  }

  const job = await createTranslationJobRecord({
    userId: session.user.id,
    teamId,
    title: data.title ?? safeName,
    sourceLanguage: data.sourceLanguage ?? null,
    targetLanguage: data.targetLanguage,
    industry: data.industry ?? null,
    glossaryId: data.glossaryId ?? null,
    enginePreference: data.enginePreference ?? TRANSLATION_ENGINE.AUTO,
    ocrEnabled: data.ocrEnabled ?? false,
    sourceFileKey: objectKey,
    sourceFileName: file.name,
    sourceFileSize: file.size,
    sourceFileMime: contentType,
  });

  return NextResponse.json({ job: serializeJob(job) }, { status: 201 });
}
