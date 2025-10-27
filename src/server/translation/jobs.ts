import "server-only";

import { getDB } from "@/db";
import { desc, eq, inArray, or } from "drizzle-orm";
import {
  JOB_STAGE,
  JOB_STATUS,
  translationJobEventTable,
  translationJobTable,
  translationSegmentTable,
} from "@/db/schema";
import type { TranslationJob, TranslationJobEvent, TranslationJobPage } from "@/db/schema";

export interface CreateJobRecordInput {
  userId: string;
  teamId?: string | null;
  title?: string | null;
  sourceLanguage?: string | null;
  targetLanguage: string;
  industry?: string | null;
  glossaryId?: string | null;
  enginePreference: string;
  ocrEnabled: boolean;
  priority?: number;
  sourceFileKey: string;
  sourceFileName?: string | null;
  sourceFileSize: number;
  sourceFileMime?: string | null;
  queueToken?: string | null;
}

export async function createTranslationJobRecord(
  input: CreateJobRecordInput,
): Promise<TranslationJob> {
  const db = getDB();

  const [job] = await db
    .insert(translationJobTable)
    .values({
      userId: input.userId,
      teamId: input.teamId ?? null,
      title: input.title ?? null,
      sourceLanguage: input.sourceLanguage ?? null,
      targetLanguage: input.targetLanguage,
      industry: input.industry ?? null,
      glossaryId: input.glossaryId ?? null,
      enginePreference: input.enginePreference,
      ocrEnabled: input.ocrEnabled ? 1 : 0,
      priority: input.priority ?? 0,
      sourceFileKey: input.sourceFileKey,
      sourceFileName: input.sourceFileName ?? null,
      sourceFileSize: input.sourceFileSize,
      sourceFileMime: input.sourceFileMime ?? null,
      queueToken: input.queueToken ?? null,
    })
    .returning();

  if (!job) {
    throw new Error("Failed to create translation job");
  }

  await db.insert(translationJobEventTable).values({
    jobId: job.id,
    stage: JOB_STAGE.PREPARE,
    status: JOB_STATUS.QUEUED,
    message: "Job created and awaiting processing",
    meta: JSON.stringify({
      userId: input.userId,
      teamId: input.teamId,
      sourceFileKey: input.sourceFileKey,
    }),
  });

  return job;
}

export async function deleteSegmentsForJob(jobId: string) {
  const db = getDB();
  await db.delete(translationSegmentTable).where(eq(translationSegmentTable.jobId, jobId));
}

export interface CancelJobResult {
  ok: boolean;
  reason?: "NOT_FOUND" | "FORBIDDEN" | "ALREADY_COMPLETED";
}

export async function cancelTranslationJob(
  jobId: string,
  userId: string,
  teamIds: string[] = [],
): Promise<CancelJobResult> {
  const db = getDB();

  const job = await db.query.translationJobTable.findFirst({
    where: eq(translationJobTable.id, jobId),
  });

  if (!job) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const isOwner = job.userId === userId;
  const isTeamMember = !!job.teamId && teamIds.includes(job.teamId);

  if (!isOwner && !isTeamMember) {
    return { ok: false, reason: "FORBIDDEN" };
  }

  if (
    job.status === JOB_STATUS.COMPLETED ||
    job.status === JOB_STATUS.CANCELLED ||
    job.status === JOB_STATUS.FAILED
  ) {
    return { ok: false, reason: "ALREADY_COMPLETED" };
  }

  const now = new Date();

  await db
    .update(translationJobTable)
    .set({
      status: JOB_STATUS.CANCELLED,
      updatedAt: now,
      cancelledAt: now,
    })
    .where(eq(translationJobTable.id, jobId));

  await db.insert(translationJobEventTable).values({
    jobId,
    stage: job.currentStage,
    status: JOB_STATUS.CANCELLED,
    message: "Job cancelled by user",
    meta: JSON.stringify({ userId }),
  });

  return { ok: true };
}

export interface ListTranslationJobsParams {
  userId: string;
  teamIds?: string[];
  limit?: number;
  offset?: number;
}

export async function listTranslationJobs({
  userId,
  teamIds = [],
  limit = 25,
  offset = 0,
}: ListTranslationJobsParams): Promise<TranslationJob[]> {
  const db = getDB();

  const filters = [eq(translationJobTable.userId, userId)];
  if (teamIds.length > 0) {
    filters.push(inArray(translationJobTable.teamId, teamIds));
  }

  const where =
    filters.length === 1
      ? filters[0]
      : or(...filters);

  return db
    .select()
    .from(translationJobTable)
    .where(where)
    .orderBy(desc(translationJobTable.createdAt))
    .limit(limit)
    .offset(offset);
}

export interface GetTranslationJobParams {
  userId: string;
  teamIds?: string[];
}

export interface TranslationJobWithRelations extends TranslationJob {
  pages: TranslationJobPage[];
  events: TranslationJobEvent[];
}

export async function getTranslationJobWithRelations(
  jobId: string,
  { userId, teamIds = [] }: GetTranslationJobParams,
): Promise<TranslationJobWithRelations | null> {
  const db = getDB();

  const job = await db.query.translationJobTable.findFirst({
    where: eq(translationJobTable.id, jobId),
    with: {
      pages: {
        columns: {
          id: true,
          jobId: true,
          pageNumber: true,
          width: true,
          height: true,
          backgroundAssetKey: true,
          textLayerAssetKey: true,
          ocrJsonAssetKey: true,
        },
        orderBy: (fields, operators) => [operators.asc(fields.pageNumber)],
      },
      events: {
        orderBy: (fields, operators) => [operators.desc(fields.createdAt)],
      },
    },
  });

  if (!job) {
    return null;
  }

  const isOwner = job.userId === userId;
  const isTeamMember = !!job.teamId && teamIds.includes(job.teamId);

  if (!isOwner && !isTeamMember) {
    return null;
  }

  return job as TranslationJobWithRelations;
}
