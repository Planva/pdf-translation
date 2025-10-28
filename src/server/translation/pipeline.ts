import { TextDecoder, TextEncoder } from "util";

import { getDB } from "@/db";
import {
  JOB_STAGE,
  JOB_STATUS,
  TRANSLATION_ENGINE,
  TRANSLATION_SEGMENT_TYPE,
  translationGlossaryEntryTable,
  translationJobEventTable,
  translationJobPageTable,
  translationJobTable,
  translationSegmentTable,
  translationSegmentTranslationTable,
  type TranslationJob,
} from "@/db/schema";
import { deleteSegmentsForJob } from "./jobs";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";

const DEFAULT_PAGE_WIDTH = 612;
const DEFAULT_PAGE_HEIGHT = 792;
const DEFAULT_FONT_SIZE = 12;

const STAGE_SEQUENCE = [
  JOB_STAGE.PREPARE,
  JOB_STAGE.OCR,
  JOB_STAGE.SEGMENT,
  JOB_STAGE.TRANSLATE,
  JOB_STAGE.LAYOUT,
  JOB_STAGE.RENDER,
  JOB_STAGE.PUBLISH,
] as const;

type StageName = (typeof STAGE_SEQUENCE)[number];

const STAGE_LABELS: Record<StageName, string> = {
  [JOB_STAGE.PREPARE]: "Prepare",
  [JOB_STAGE.OCR]: "OCR",
  [JOB_STAGE.SEGMENT]: "Segment",
  [JOB_STAGE.TRANSLATE]: "Translate",
  [JOB_STAGE.LAYOUT]: "Layout",
  [JOB_STAGE.RENDER]: "Render",
  [JOB_STAGE.PUBLISH]: "Publish",
};

const STAGE_START_MESSAGES: Record<StageName, string> = {
  [JOB_STAGE.PREPARE]: "Preparing source document",
  [JOB_STAGE.OCR]: "Running OCR for scanned content",
  [JOB_STAGE.SEGMENT]: "Generating translation segments",
  [JOB_STAGE.TRANSLATE]: "Translating text",
  [JOB_STAGE.LAYOUT]: "Reconstructing translated layout",
  [JOB_STAGE.RENDER]: "Rendering translated PDF",
  [JOB_STAGE.PUBLISH]: "Publishing translated artifacts",
};

type EngineValue = (typeof TRANSLATION_ENGINE)[keyof typeof TRANSLATION_ENGINE];

interface PreparedPage {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  dpi?: number | null;
  backgroundDataUri?: string | null;
  backgroundAssetKey?: string | null;
  pageId?: string;
  textContent?: string | null;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

interface SegmentBlueprint {
  pageNumber: number;
  blockId?: string;
  text: string;
  boundingBox?: BoundingBox | null;
  metadata?: Record<string, unknown>;
}

interface PipelineSegment {
  id: string;
  pageId: string;
  pageNumber: number;
  blockId: string;
  sequence: number;
  type: string;
  sourceText: string;
  normalizedSourceText: string;
  boundingBox?: BoundingBox | null;
  metadata?: Record<string, unknown>;
}

interface OcrArtifact {
  pageNumber: number;
  pageId: string;
  jsonKey: string;
}

interface GlossaryEntry {
  source: string;
  target: string;
}

interface GlossaryMatch {
  source: string;
  target: string;
}

interface TranslatedSegment {
  segmentId: string;
  pageId: string;
  pageNumber: number;
  targetText: string;
  engine: EngineValue;
  glossaryMatches: GlossaryMatch[];
  rawResponse?: unknown;
}

interface PipelineState {
  sourcePdf?: Uint8Array;
  pages: PreparedPage[];
  pageIdByNumber: Map<number, string>;
  segmentBlueprints: SegmentBlueprint[];
  segments: PipelineSegment[];
  translations: TranslatedSegment[];
  ocrArtifacts: OcrArtifact[];
  requiresOcr: boolean;
  layoutHtml?: string | null;
  previewKey?: string | null;
  outputKey?: string | null;
  glossary: GlossaryEntry[];
}

interface StageContext {
  jobId: string;
  job: TranslationJob;
  env: any;
  db: ReturnType<typeof getDB>;
  state: PipelineState;
  checkCancelled: () => Promise<void>;
}

interface StageResult {
  updates?: Partial<PipelineState>;
  skipped?: boolean;
  skipReason?: string;
  message?: string;
  quietCompletion?: boolean;
}

interface PrepareServiceResponse {
  pageCount?: number;
  requiresOcr?: boolean;
  pages?: Array<{
    pageNumber?: number;
    width?: number;
    height?: number;
    rotation?: number;
    dpi?: number;
    backgroundImage?: {
      data?: string;
      dataUri?: string;
      contentType?: string;
    } | null;
    textContent?: string;
    blocks?: Array<{
      id?: string;
      blockId?: string;
      text?: string;
      bbox?: BoundingBox | null;
      boundingBox?: BoundingBox | null;
      metadata?: Record<string, unknown>;
    }>;
  }>;
}

interface OcrServiceResult {
  pages: Array<{
    pageNumber: number;
    json?: unknown;
    blocks?: Array<{
      id?: string;
      blockId?: string;
      text?: string;
      boundingBox?: BoundingBox | null;
      bbox?: BoundingBox | null;
      metadata?: Record<string, unknown>;
    }>
  }>;
}

class JobCancelledError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} was cancelled`);
    this.name = "JobCancelledError";
  }
}

type StageHandler = (ctx: StageContext) => Promise<StageResult>;

const STAGE_HANDLERS: Record<StageName, StageHandler> = {
  [JOB_STAGE.PREPARE]: stagePrepare,
  [JOB_STAGE.OCR]: stageOcr,
  [JOB_STAGE.SEGMENT]: stageSegment,
  [JOB_STAGE.TRANSLATE]: stageTranslate,
  [JOB_STAGE.LAYOUT]: stageLayout,
  [JOB_STAGE.RENDER]: stageRender,
  [JOB_STAGE.PUBLISH]: stagePublish,
};

export async function runTranslationPipeline(jobId: string) {
  const { env } = getCloudflareContext();
  const db = getDB();

  const jobRecord = await db.query.translationJobTable.findFirst({
    where: eq(translationJobTable.id, jobId),
  });

  if (!jobRecord) {
    return;
  }

  if ([JOB_STATUS.CANCELLED, JOB_STATUS.COMPLETED].includes(jobRecord.status)) {
    return;
  }

  const glossary = await loadGlossary(jobRecord.glossaryId);

  const state: PipelineState = {
    pages: [],
    pageIdByNumber: new Map(),
    segmentBlueprints: [],
    segments: [],
    translations: [],
    ocrArtifacts: [],
    requiresOcr: Boolean(jobRecord.ocrEnabled),
    layoutHtml: null,
    previewKey: jobRecord.previewBundleKey ?? null,
    outputKey: jobRecord.outputFileKey ?? null,
    glossary,
  };

  const checkCancelled = async () => {
    if (await isJobCancelled(db, jobId)) {
      throw new JobCancelledError(jobId);
    }
  };

  const context: StageContext = {
    jobId,
    job: jobRecord,
    env,
    db,
    state,
    checkCancelled,
  };

  const now = new Date();

  await db
    .update(translationJobTable)
    .set({
      status: JOB_STATUS.PROCESSING,
      startedAt: jobRecord.startedAt ?? now,
      updatedAt: now,
    })
    .where(eq(translationJobTable.id, jobId));

  let completedStages = 0;
  let lastStage: StageName | null = null;

  try {
    for (const stage of STAGE_SEQUENCE) {
      lastStage = stage;
      const startMessage = STAGE_START_MESSAGES[stage] ?? `Starting ${STAGE_LABELS[stage]}`;
      await setJobStage(db, jobId, stage, JOB_STATUS.PROCESSING, startMessage);
      await checkCancelled();

      const handler = STAGE_HANDLERS[stage];
      const result = await handler(context);

      mergePipelineState(state, result.updates);

      const completionMessage = result?.message
        ?? (result?.skipped
          ? `${STAGE_LABELS[stage]} skipped${result.skipReason ? `: ${result.skipReason}` : ""}`
          : `${STAGE_LABELS[stage]} complete`);

      if (!result?.quietCompletion) {
        await logEvent(db, jobId, stage, JOB_STATUS.PROCESSING, completionMessage);
      }

      completedStages += 1;
      await updateJobProgress(db, jobId, completedStages);
      await checkCancelled();
    }
  } catch (error) {
    if (error instanceof JobCancelledError) {
      await logEvent(db, jobId, lastStage ?? JOB_STAGE.PREPARE, JOB_STATUS.CANCELLED, "Job cancelled during processing");
      return;
    }

    console.error("Pipeline error", error);

    const message = (error as Error)?.message ?? "Translation pipeline failed";
    const truncatedMessage = message.slice(0, 2000);

    await db
      .update(translationJobTable)
      .set({
        status: JOB_STATUS.FAILED,
        currentStage: lastStage ?? JOB_STAGE.PREPARE,
        errorMessage: truncatedMessage,
        updatedAt: new Date(),
      })
      .where(eq(translationJobTable.id, jobId));

    await logEvent(db, jobId, lastStage ?? JOB_STAGE.PREPARE, JOB_STATUS.FAILED, truncatedMessage);
  }
}

async function stagePrepare(ctx: StageContext): Promise<StageResult> {
  const pdfBytes = ctx.state.sourcePdf ?? (await loadSourcePdf(ctx.env, ctx.job));
  ctx.state.sourcePdf = pdfBytes;

  await ctx.checkCancelled();

  let serviceResult: PrepareServiceResponse | null = null;
  if (ctx.env.DOCUMENT_PREPARE_SERVICE_URL) {
    try {
      serviceResult = await callDocumentPrepareService(ctx.env, ctx.job, pdfBytes);
    } catch (error) {
      console.warn("[pipeline] document prepare service failed", error);
    }
  }

  let preparedPages = serviceResult?.pages?.length ? normalizePreparedPages(serviceResult.pages) : [];
  let segmentBlueprints = serviceResult?.pages
    ? collectBlueprintsFromPreparedPages(serviceResult.pages)
    : [];

  let requiresOcr = ctx.state.requiresOcr ?? Boolean(ctx.job.ocrEnabled);
  if (typeof serviceResult?.requiresOcr === "boolean") {
    requiresOcr = serviceResult.requiresOcr;
  }

  if (!preparedPages.length) {
    preparedPages = buildFallbackPages(pdfBytes);
    segmentBlueprints = collectBlueprintsFromFallback(preparedPages);
  }

  if (!segmentBlueprints.length) {
    segmentBlueprints = collectBlueprintsFromFallback(preparedPages);
  }

  const pageIdByNumber = await persistPages(ctx.db, ctx.env, ctx.job, preparedPages);

  return {
    updates: {
      pages: preparedPages,
      pageIdByNumber,
      segmentBlueprints,
      requiresOcr,
      sourcePdf: pdfBytes,
    },
    message: `Detected ${preparedPages.length} page(s).`,
  };
}

async function stageOcr(ctx: StageContext): Promise<StageResult> {
  if (!ctx.state.requiresOcr) {
    return {
      skipped: true,
      skipReason: "OCR not requested",
      updates: { requiresOcr: false },
    };
  }

  const pdfBytes = ctx.state.sourcePdf ?? (await loadSourcePdf(ctx.env, ctx.job));
  ctx.state.sourcePdf = pdfBytes;

  await ctx.checkCancelled();

  let ocrResult: OcrServiceResult | null = null;
  try {
    ocrResult = await performOcr(ctx.env, ctx.job, pdfBytes, ctx.state.pages);
  } catch (error) {
    console.warn("[pipeline] OCR failed", error);
  }

  if (!ocrResult || !ocrResult.pages.length) {
    return {
      skipped: true,
      skipReason: "No OCR provider configured or no OCR data returned",
      updates: { requiresOcr: false },
    };
  }

  const now = new Date();
  const ocrArtifacts: OcrArtifact[] = [];
  const blueprints: SegmentBlueprint[] = [];

  for (const page of ocrResult.pages) {
    const pageId = ctx.state.pageIdByNumber.get(page.pageNumber);
    if (!pageId) continue;

    if (page.json !== undefined) {
      const jsonKey = await uploadJsonArtifact(
        ctx.env,
        ctx.job,
        pageId,
        page.json,
        buildPageAssetKey(ctx.job, page.pageNumber, `${pageId}-ocr.json`, "ocr"),
      );
      if (jsonKey) {
        ocrArtifacts.push({ pageNumber: page.pageNumber, pageId, jsonKey });
        await ctx.db
          .update(translationJobPageTable)
          .set({ ocrJsonAssetKey: jsonKey, updatedAt: now })
          .where(eq(translationJobPageTable.id, pageId));
      }
    }

    if (Array.isArray(page.blocks)) {
      page.blocks.forEach((block, index) => {
        const text = block.text?.trim();
        if (!text) return;
        blueprints.push({
          pageNumber: page.pageNumber,
          blockId: block.blockId ?? block.id ?? `ocr_${page.pageNumber}_${index}`,
          text,
          boundingBox: normalizeBoundingBox(block.boundingBox ?? block.bbox ?? null),
          metadata: block.metadata ?? undefined,
        });
      });
    }
  }

  return {
    updates: {
      segmentBlueprints: blueprints.length ? blueprints : ctx.state.segmentBlueprints,
      ocrArtifacts,
      requiresOcr: false,
    },
    message: `OCR completed for ${ocrArtifacts.length || ocrResult.pages.length} page(s).`,
  };
}

async function stageSegment(ctx: StageContext): Promise<StageResult> {
  let blueprints = ctx.state.segmentBlueprints;
  if (!blueprints.length) {
    blueprints = collectBlueprintsFromFallback(ctx.state.pages);
  }

  if (!blueprints.length) {
    return {
      skipped: true,
      skipReason: "No textual content detected",
    };
  }

  await deleteSegmentsForJob(ctx.jobId);

  const segments: PipelineSegment[] = [];
  let sequence = 0;
  const now = new Date();

  for (const blueprint of blueprints) {
    const pageId = ctx.state.pageIdByNumber.get(blueprint.pageNumber);
    if (!pageId) continue;

    const sourceText = blueprint.text?.trim();
    if (!sourceText) continue;

    const id = crypto.randomUUID();
    const normalized = normalizeWhitespace(sourceText);
    const blockId = blueprint.blockId ?? `block_${blueprint.pageNumber}_${sequence}`;

    segments.push({
      id,
      pageId,
      pageNumber: blueprint.pageNumber,
      blockId,
      sequence,
      type: TRANSLATION_SEGMENT_TYPE.TEXT,
      sourceText,
      normalizedSourceText: normalized,
      boundingBox: blueprint.boundingBox
        ? clampBoundingBox(blueprint.boundingBox, ctx.state.pages.find((p) => p.pageNumber === blueprint.pageNumber))
        : undefined,
      metadata: blueprint.metadata ?? undefined,
    });

    sequence += 1;
    if (sequence % 50 === 0) {
      await ctx.checkCancelled();
    }
  }

  if (!segments.length) {
    return { skipped: true, skipReason: "No segments persisted" };
  }

  await persistSegmentsToDb(ctx.db, ctx.jobId, segments, now);

  return {
    updates: {
      segments,
      segmentBlueprints: blueprints,
    },
    message: `Persisted ${segments.length} segment(s).`,
  };
}

async function stageTranslate(ctx: StageContext): Promise<StageResult> {
  if (!ctx.state.segments.length) {
    return { skipped: true, skipReason: "No segments available for translation" };
  }

  const engineOrder = determineEngineOrder(ctx.job);
  const translations: TranslatedSegment[] = [];

  for (const segment of ctx.state.segments) {
    await ctx.checkCancelled();
    const translationResult = await translateSegmentWithEngines(
      ctx.env,
      ctx.job,
      segment,
      engineOrder,
      ctx.state.glossary,
    );

    translations.push({
      segmentId: segment.id,
      pageId: segment.pageId,
      pageNumber: segment.pageNumber,
      targetText: translationResult.text,
      engine: translationResult.engine,
      glossaryMatches: translationResult.glossaryMatches,
      rawResponse: translationResult.rawResponse,
    });
  }

  await persistTranslations(ctx.db, ctx.jobId, ctx.job.targetLanguage, translations);

  const enginesUsed = new Set(translations.map((item) => item.engine));

  return {
    updates: {
      translations,
    },
    message: `Translated ${translations.length} segment(s) via ${Array.from(enginesUsed).join(", ") || "auto"}.`,
  };
}

async function stageLayout(ctx: StageContext): Promise<StageResult> {
  if (!ctx.state.translations.length) {
    return { skipped: true, skipReason: "Translations not ready" };
  }

  const html = buildHtmlLayout(ctx.state.pages, ctx.state.segments, ctx.state.translations);
  const previewKey = await uploadPreview(ctx.env, ctx.job, html);

  return {
    updates: {
      layoutHtml: html,
      previewKey: previewKey ?? ctx.state.previewKey ?? null,
    },
    message: previewKey ? "Generated HTML preview and uploaded to R2" : "Generated HTML preview",
  };
}

async function stageRender(ctx: StageContext): Promise<StageResult> {
  const html = ctx.state.layoutHtml ?? buildHtmlLayout(ctx.state.pages, ctx.state.segments, ctx.state.translations);
  const translatedText = ctx.state.translations.map((item) => item.targetText).join("\n\n");

  const renderedPdf = (await renderWithBrowser(ctx.env, html)) ?? createSimplePdf(translatedText);
  const outputKey = await uploadOutputPdf(ctx.env, ctx.job, renderedPdf);

  return {
    updates: {
      outputKey,
    },
    message: outputKey ? "Rendered PDF uploaded" : "Rendered PDF (local fallback)",
  };
}

async function stagePublish(ctx: StageContext): Promise<StageResult> {
  const now = new Date();
  const outputKey = ctx.state.outputKey ?? ctx.job.outputFileKey ?? null;
  const previewKey = ctx.state.previewKey ?? ctx.job.previewBundleKey ?? null;

  await ctx.db
    .update(translationJobTable)
    .set({
      status: JOB_STATUS.COMPLETED,
      currentStage: JOB_STAGE.PUBLISH,
      progress: 100,
      updatedAt: now,
      completedAt: now,
      outputFileKey: outputKey,
      previewBundleKey: previewKey,
      pageCount: ctx.state.pages.length,
      segmentCount: ctx.state.segments.length,
    })
    .where(eq(translationJobTable.id, ctx.jobId));

  await logEvent(ctx.db, ctx.jobId, JOB_STAGE.PUBLISH, JOB_STATUS.COMPLETED, "Translation published");

  return {
    quietCompletion: true,
    message: "Job completed",
  };
}

function mergePipelineState(state: PipelineState, updates?: Partial<PipelineState>) {
  if (!updates) return;

  if (updates.sourcePdf) state.sourcePdf = updates.sourcePdf;
  if (updates.pages) state.pages = updates.pages;
  if (updates.pageIdByNumber) state.pageIdByNumber = updates.pageIdByNumber;
  if (updates.segmentBlueprints) state.segmentBlueprints = updates.segmentBlueprints;
  if (updates.segments) state.segments = updates.segments;
  if (updates.translations) state.translations = updates.translations;
  if (updates.ocrArtifacts) state.ocrArtifacts = updates.ocrArtifacts;
  if (typeof updates.requiresOcr === "boolean") state.requiresOcr = updates.requiresOcr;
  if (updates.layoutHtml !== undefined) state.layoutHtml = updates.layoutHtml;
  if (updates.previewKey !== undefined) state.previewKey = updates.previewKey;
  if (updates.outputKey !== undefined) state.outputKey = updates.outputKey;
  if (updates.glossary) state.glossary = updates.glossary;
}

async function updateJobProgress(db: ReturnType<typeof getDB>, jobId: string, completedStages: number) {
  const progress = Math.min(100, Math.round((completedStages / STAGE_SEQUENCE.length) * 100));
  await db
    .update(translationJobTable)
    .set({ progress, updatedAt: new Date() })
    .where(eq(translationJobTable.id, jobId));
}

async function isJobCancelled(db: ReturnType<typeof getDB>, jobId: string) {
  const job = await db.query.translationJobTable.findFirst({
    where: eq(translationJobTable.id, jobId),
    columns: { status: true },
  });
  return job?.status === JOB_STATUS.CANCELLED;
}

async function loadSourcePdf(env: any, job: TranslationJob) {
  if (!env?.PDF_SOURCE_BUCKET) {
    throw new Error("PDF source bucket not configured");
  }
  if (!job.sourceFileKey) {
    throw new Error("Source file key missing");
  }
  const object = await env.PDF_SOURCE_BUCKET.get(job.sourceFileKey);
  if (!object) {
    throw new Error("PDF not found in R2");
  }
  const arrayBuffer = await object.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function normalizePreparedPages(pages: PrepareServiceResponse["pages"] | undefined): PreparedPage[] {
  if (!pages) return [];
  return pages.map((page, index) => {
    const background = page?.backgroundImage;
    const dataUri = background?.dataUri
      ?? (background?.data ? buildDataUri(background.contentType ?? "image/png", background.data) : null);

    return {
      pageNumber: page?.pageNumber ?? index + 1,
      width: page?.width ?? DEFAULT_PAGE_WIDTH,
      height: page?.height ?? DEFAULT_PAGE_HEIGHT,
      rotation: page?.rotation ?? 0,
      dpi: page?.dpi ?? null,
      backgroundDataUri: dataUri,
      textContent: page?.textContent ?? null,
    } satisfies PreparedPage;
  });
}

function collectBlueprintsFromPreparedPages(pages: PrepareServiceResponse["pages"] | undefined): SegmentBlueprint[] {
  if (!pages) return [];
  const results: SegmentBlueprint[] = [];

  pages.forEach((page, pageIndex) => {
    const pageNumber = page?.pageNumber ?? pageIndex + 1;
    if (!Array.isArray(page?.blocks)) {
      return;
    }

    page!.blocks!.forEach((block, blockIndex) => {
      const text = block?.text?.trim();
      if (!text) return;
      results.push({
        pageNumber,
        blockId: block?.blockId ?? block?.id ?? `blk_${pageNumber}_${blockIndex}`,
        text,
        boundingBox: normalizeBoundingBox(block?.bbox ?? block?.boundingBox ?? null),
        metadata: block?.metadata ?? undefined,
      });
    });
  });

  return results;
}

function buildFallbackPages(pdfBytes: Uint8Array): PreparedPage[] {
  const segments = extractTextSegments(pdfBytes);
  return [
    {
      pageNumber: 1,
      width: DEFAULT_PAGE_WIDTH,
      height: DEFAULT_PAGE_HEIGHT,
      rotation: 0,
      dpi: null,
      backgroundDataUri: null,
      textContent: segments.join("\n\n"),
    },
  ];
}

function collectBlueprintsFromFallback(pages: PreparedPage[]): SegmentBlueprint[] {
  const results: SegmentBlueprint[] = [];
  pages.forEach((page) => {
    const content = page.textContent ?? "";
    const blocks = splitIntoBlocks(content);
    blocks.forEach((block, index) => {
      if (!block.trim()) return;
      results.push({
        pageNumber: page.pageNumber,
        blockId: `page${page.pageNumber}_block_${index}`,
        text: block,
        boundingBox: createFallbackBoundingBox(index, page),
      });
    });
  });
  return results;
}

async function callDocumentPrepareService(env: any, job: TranslationJob, pdfBytes: Uint8Array): Promise<PrepareServiceResponse> {
  const response = await fetch(env.DOCUMENT_PREPARE_SERVICE_URL, {
    method: "POST",
    headers: buildServiceHeaders(env.DOCUMENT_PREPARE_SERVICE_TOKEN),
    body: JSON.stringify({
      jobId: job.id,
      fileName: job.sourceFileName ?? `${job.id}.pdf`,
      fileBase64: arrayBufferToBase64(pdfBytes),
      ocrPreferred: Boolean(job.ocrEnabled),
    }),
  });

  if (!response.ok) {
    const body = await safeParseJson(response);
    throw new Error(`Document prepare service failed (${response.status}): ${JSON.stringify(body)}`);
  }

  return (await response.json()) as PrepareServiceResponse;
}

async function performOcr(env: any, job: TranslationJob, pdfBytes: Uint8Array, pages: PreparedPage[]): Promise<OcrServiceResult | null> {
  if (env.OCR_SERVICE_URL) {
    const response = await fetch(env.OCR_SERVICE_URL, {
      method: "POST",
      headers: buildServiceHeaders(env.OCR_SERVICE_TOKEN),
      body: JSON.stringify({
        jobId: job.id,
        fileName: job.sourceFileName ?? job.id,
        fileBase64: arrayBufferToBase64(pdfBytes),
        pageCount: pages.length,
      }),
    });

    if (!response.ok) {
      const body = await safeParseJson(response);
      throw new Error(`Custom OCR service failed (${response.status}): ${JSON.stringify(body)}`);
    }

    const json = await response.json();
    const normalized = normalizeExternalOcr(json);
    if (normalized) {
      return normalized;
    }
  }

  const googleKey = env.GOOGLE_VISION_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_CLOUD_VISION_KEY;
  if (googleKey) {
    return await performGoogleOcr(pdfBytes, googleKey);
  }

  return null;
}

function normalizeExternalOcr(input: any): OcrServiceResult | null {
  if (!input) return null;
  if (Array.isArray(input.pages)) {
    return {
      pages: input.pages.map((page: any, index: number) => ({
        pageNumber: page?.pageNumber ?? page?.number ?? index + 1,
        json: page?.json ?? page?.raw ?? page,
        blocks: Array.isArray(page?.blocks)
          ? page.blocks
          : Array.isArray(page?.segments)
          ? page.segments
          : undefined,
      })),
    } satisfies OcrServiceResult;
  }
  return null;
}

async function performGoogleOcr(pdfBytes: Uint8Array, apiKey: string): Promise<OcrServiceResult | null> {
  const requestBody = {
    requests: [
      {
        inputConfig: {
          content: arrayBufferToBase64(pdfBytes),
          mimeType: "application/pdf",
        },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      },
    ],
  };

  const response = await fetch(`https://vision.googleapis.com/v1/files:annotate?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const body = await safeParseJson(response);
    throw new Error(`Google Vision OCR failed (${response.status}): ${JSON.stringify(body)}`);
  }

  const json = await response.json();
  return normalizeGoogleOcr(json);
}

function normalizeGoogleOcr(response: any): OcrServiceResult | null {
  const annotation = response?.responses?.[0]?.fullTextAnnotation;
  if (!annotation) return null;

  if (!Array.isArray(annotation.pages) || !annotation.pages.length) {
    const text = annotation?.text ?? "";
    const blocks = splitIntoBlocks(text).map((entry, index) => ({
      text: entry,
      blockId: `gcv_fallback_${index}`,
    }));
    return {
      pages: [
        {
          pageNumber: 1,
          json: response,
          blocks,
        },
      ],
    } satisfies OcrServiceResult;
  }

  const pages: OcrServiceResult["pages"] = annotation.pages.map((page: any, pageIndex: number) => {
    const blocks: Array<{ text: string; blockId: string; boundingBox?: BoundingBox | null }> = [];

    (page.blocks ?? []).forEach((block: any, blockIndex: number) => {
      (block.paragraphs ?? []).forEach((paragraph: any, paragraphIndex: number) => {
        const text = extractGoogleParagraphText(paragraph);
        if (!text.trim()) return;
        blocks.push({
          text,
          blockId: `gcv_${pageIndex + 1}_${blockIndex}_${paragraphIndex}`,
          boundingBox: boundingBoxFromGoogleVertices(paragraph?.boundingBox?.vertices),
        });
      });
    });

    return {
      pageNumber: page?.pageNumber ?? pageIndex + 1,
      json: {
        confidence: page?.confidence,
        blockCount: page?.blocks?.length ?? 0,
      },
      blocks,
    };
  });

  return { pages } satisfies OcrServiceResult;
}

function extractGoogleParagraphText(paragraph: any): string {
  if (!paragraph?.words) return "";
  const words = paragraph.words.map((word: any) => (word?.symbols ?? []).map((symbol: any) => symbol?.text ?? "").join(""));
  return words.filter(Boolean).join(" ");
}

function boundingBoxFromGoogleVertices(vertices: any): BoundingBox | null {
  if (!Array.isArray(vertices) || !vertices.length) return null;
  const xs = vertices.map((vertex) => Number(vertex?.x ?? 0));
  const ys = vertices.map((vertex) => Number(vertex?.y ?? 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  } satisfies BoundingBox;
}

async function uploadJsonArtifact(env: any, job: TranslationJob, pageId: string, json: unknown, key?: string) {
  if (!env?.PDF_PREVIEW_BUCKET) return null;
  const finalKey = key ?? `ocr/${job.userId ?? "anonymous"}/${job.id}/${pageId}-${Date.now()}.json`;
  await env.PDF_PREVIEW_BUCKET.put(finalKey, JSON.stringify(json ?? {}), {
    httpMetadata: {
      contentType: "application/json",
    },
  });
  return finalKey;
}

function buildServiceHeaders(token?: string, extra?: Record<string, string>) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }
  return { ...headers, ...(extra ?? {}) };
}

async function persistPages(
  db: ReturnType<typeof getDB>,
  env: any,
  job: TranslationJob,
  pages: PreparedPage[],
): Promise<Map<number, string>> {
  await db.delete(translationJobPageTable).where(eq(translationJobPageTable.jobId, job.id));
  const map = new Map<number, string>();
  const now = new Date();

  for (const page of pages) {
    const pageId = crypto.randomUUID();
    let backgroundKey: string | null = null;

    if (page.backgroundDataUri) {
      const parsed = parseDataUri(page.backgroundDataUri);
      if (parsed) {
        backgroundKey = await uploadBinaryAsset(
          env.PDF_PREVIEW_BUCKET,
          buildPageAssetKey(job, page.pageNumber, `${pageId}.png`, "backgrounds"),
          parsed.data,
          parsed.contentType,
        );
      }
    }

    await db.insert(translationJobPageTable).values({
      id: pageId,
      jobId: job.id,
      pageNumber: page.pageNumber,
      width: Math.round(page.width),
      height: Math.round(page.height),
      dpi: page.dpi ?? null,
      rotation: page.rotation ?? 0,
      originalAssetKey: job.sourceFileKey,
      backgroundAssetKey: backgroundKey,
      createdAt: now,
      updatedAt: now,
    });

    page.pageId = pageId;
    page.backgroundAssetKey = backgroundKey;
    map.set(page.pageNumber, pageId);
  }

  return map;
}

function buildPageAssetKey(job: TranslationJob, pageNumber: number, fileName: string, scope: string) {
  const userId = job.userId ?? "anonymous";
  return `${scope}/${userId}/${job.id}/page-${pageNumber}/${fileName}`;
}

async function uploadBinaryAsset(bucket: any, key: string, data: Uint8Array, contentType: string) {
  if (!bucket) return null;
  await bucket.put(key, data, {
    httpMetadata: {
      contentType,
    },
  });
  return key;
}

function parseDataUri(dataUri: string): { contentType: string; data: Uint8Array } | null {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUri);
  if (!match) return null;
  const [, contentType, base64] = match;
  return {
    contentType,
    data: Uint8Array.from(Buffer.from(base64, "base64")),
  };
}

function buildDataUri(contentType: string, base64: string) {
  return `data:${contentType};base64,${base64}`;
}

function normalizeBoundingBox(input: any): BoundingBox | null {
  if (!input) return null;
  const rawX = Number(input.x ?? input.left ?? 0);
  const rawY = Number(input.y ?? input.top ?? 0);
  const rawWidth = Number(input.width ?? input.w ?? 0);
  const rawHeight = Number(input.height ?? input.h ?? 0);

  if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawWidth) || !Number.isFinite(rawHeight)) {
    return null;
  }

  return {
    x: Math.max(0, rawX),
    y: Math.max(0, rawY),
    width: Math.max(1, rawWidth),
    height: Math.max(1, rawHeight),
    rotation: Number.isFinite(input.rotation) ? Number(input.rotation) : undefined,
  };
}

function clampBoundingBox(box: BoundingBox, page?: PreparedPage): BoundingBox {
  if (!page) return box;
  const maxWidth = page.width ?? DEFAULT_PAGE_WIDTH;
  const maxHeight = page.height ?? DEFAULT_PAGE_HEIGHT;
  const x = Math.max(0, Math.min(box.x, maxWidth));
  const y = Math.max(0, Math.min(box.y, maxHeight));
  const width = Math.min(box.width, Math.max(0, maxWidth - x));
  const height = Math.min(box.height, Math.max(0, maxHeight - y));
  return { ...box, x, y, width, height };
}

function createFallbackBoundingBox(index: number, page?: PreparedPage): BoundingBox {
  const pageWidth = page?.width ?? DEFAULT_PAGE_WIDTH;
  const pageHeight = page?.height ?? DEFAULT_PAGE_HEIGHT;
  const topPadding = 72;
  const lineHeight = DEFAULT_FONT_SIZE * 1.8;
  const y = Math.min(pageHeight - lineHeight - 24, topPadding + index * (lineHeight + 6));
  const width = Math.max(100, pageWidth - 96);

  return {
    x: 48,
    y,
    width,
    height: lineHeight,
  };
}

async function persistSegmentsToDb(
  db: ReturnType<typeof getDB>,
  jobId: string,
  segments: PipelineSegment[],
  timestamp: Date,
) {
  for (const segment of segments) {
    await db.insert(translationSegmentTable).values({
      id: segment.id,
      jobId,
      pageId: segment.pageId,
      pageNumber: segment.pageNumber,
      blockId: segment.blockId,
      sequence: segment.sequence,
      type: TRANSLATION_SEGMENT_TYPE.TEXT,
      sourceLocale: null,
      sourceText: segment.sourceText,
      normalizedSourceText: segment.normalizedSourceText,
      boundingBox: segment.boundingBox ?? null,
      metadata: segment.metadata ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

function determineEngineOrder(job: TranslationJob): EngineValue[] {
  const preference = (job.enginePreference ?? TRANSLATION_ENGINE.AUTO) as EngineValue;
  const order: EngineValue[] = [];

  const pushUnique = (engine: EngineValue) => {
    if (!order.includes(engine)) {
      order.push(engine);
    }
  };

  if (preference !== TRANSLATION_ENGINE.AUTO) {
    pushUnique(preference);
  } else {
    if (job.industry) {
      pushUnique(TRANSLATION_ENGINE.OPENAI);
    }
    pushUnique(TRANSLATION_ENGINE.DEEPL);
    pushUnique(TRANSLATION_ENGINE.GOOGLE);
  }

  pushUnique(TRANSLATION_ENGINE.OPENAI);
  pushUnique(TRANSLATION_ENGINE.DEEPL);
  pushUnique(TRANSLATION_ENGINE.GOOGLE);
  pushUnique(TRANSLATION_ENGINE.CUSTOM);
  pushUnique(TRANSLATION_ENGINE.AUTO);

  return order;
}

interface TranslationEngineResponse {
  text: string;
  engine: EngineValue;
  rawResponse?: unknown;
  glossaryMatches: GlossaryMatch[];
}

async function translateSegmentWithEngines(
  env: any,
  job: TranslationJob,
  segment: PipelineSegment,
  engineOrder: EngineValue[],
  glossary: GlossaryEntry[],
): Promise<TranslationEngineResponse> {
  const sourceLanguage = job.sourceLanguage ?? "auto";
  const targetLanguage = job.targetLanguage;
  const attempts = engineOrder.length ? engineOrder : [TRANSLATION_ENGINE.AUTO];
  let lastError: unknown = null;

  for (const engine of attempts) {
    try {
      const result = await translateUsingEngine(
        env,
        engine,
        segment.sourceText,
        sourceLanguage,
        targetLanguage,
        job.industry,
        glossary,
      );
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
      console.warn(`[pipeline] translate ${engine} failed`, error);
    }
  }

  if (lastError) {
    console.warn("[pipeline] all translation engines failed, falling back to source text");
  }

  const fallback = enforceGlossary(segment.sourceText, glossary);
  return {
    text: fallback.text,
    engine: TRANSLATION_ENGINE.AUTO,
    rawResponse: { fallback: true, reason: lastError ? (lastError as Error).message : "no-engine" },
    glossaryMatches: fallback.matches,
  };
}

async function translateUsingEngine(
  env: any,
  engine: EngineValue,
  text: string,
  sourceLanguage: string | null,
  targetLanguage: string,
  industry: string | null | undefined,
  glossary: GlossaryEntry[],
): Promise<TranslationEngineResponse | null> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      text: trimmed,
      engine,
      rawResponse: null,
      glossaryMatches: [],
    };
  }

  switch (engine) {
    case TRANSLATION_ENGINE.OPENAI:
      if (env.OPENAI_API_KEY) {
        return await translateWithOpenAI(env, trimmed, sourceLanguage, targetLanguage, industry, glossary);
      }
      return null;
    case TRANSLATION_ENGINE.DEEPL:
      if (env.DEEPL_API_KEY) {
        return await translateWithDeepL(env, trimmed, sourceLanguage, targetLanguage, glossary);
      }
      return null;
    case TRANSLATION_ENGINE.GOOGLE:
      if (env.GOOGLE_TRANSLATE_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_CLOUD_TRANSLATE_KEY) {
        return await translateWithGoogle(env, trimmed, sourceLanguage, targetLanguage, glossary);
      }
      return null;
    case TRANSLATION_ENGINE.CUSTOM:
      if (env.CUSTOM_TRANSLATION_ENDPOINT) {
        return await translateWithCustomEndpoint(env, trimmed, sourceLanguage, targetLanguage, glossary, industry);
      }
      return null;
    case TRANSLATION_ENGINE.AUTO:
    default: {
      const autoResult =
        (env.OPENAI_API_KEY && (await translateWithOpenAI(env, trimmed, sourceLanguage, targetLanguage, industry, glossary)))
        || (env.DEEPL_API_KEY && (await translateWithDeepL(env, trimmed, sourceLanguage, targetLanguage, glossary)))
        || (env.GOOGLE_TRANSLATE_API_KEY && (await translateWithGoogle(env, trimmed, sourceLanguage, targetLanguage, glossary)))
        || (await translateWithLibre(env, trimmed, sourceLanguage, targetLanguage, glossary));
      return autoResult;
    }
  }
}

async function translateWithOpenAI(
  env: any,
  text: string,
  sourceLanguage: string | null,
  targetLanguage: string,
  industry: string | null | undefined,
  glossary: GlossaryEntry[],
): Promise<TranslationEngineResponse | null> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = env.OPENAI_MODEL ?? "gpt-4o-mini";
  const glossaryDirective = glossary.length
    ? `Enforce the following terminology replacements where appropriate: ${glossary
        .map((entry) => `${entry.source} -> ${entry.target}`)
        .join("; ")}.`
    : "";
  const industryInstruction = industry ? `Translate using terminology appropriate for the ${industry} industry.` : "";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: [
            "You are a professional PDF translation assistant.",
            industryInstruction,
            glossaryDirective,
            "Return only the translated text without additional commentary.",
          ]
            .filter(Boolean)
            .join(" "),
        },
        {
          role: "user",
          content: text,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await safeParseJson(response);
    throw new Error(`OpenAI translation failed (${response.status}): ${JSON.stringify(body)}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content?.trim();
  if (!content) return null;

  const enforced = enforceGlossary(content, glossary);

  return {
    text: enforced.text,
    engine: TRANSLATION_ENGINE.OPENAI,
    rawResponse: { id: json?.id, model: json?.model },
    glossaryMatches: enforced.matches,
  };
}

async function translateWithDeepL(
  env: any,
  text: string,
  sourceLanguage: string | null,
  targetLanguage: string,
  glossary: GlossaryEntry[],
): Promise<TranslationEngineResponse | null> {
  const apiKey = env.DEEPL_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams();
  params.set("text", text);
  params.set("target_lang", targetLanguage.toUpperCase());
  if (sourceLanguage && sourceLanguage !== "auto") {
    params.set("source_lang", sourceLanguage.toUpperCase());
  }

  const response = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `DeepL-Auth-Key ${apiKey}`,
    },
    body: params,
  });

  if (!response.ok) {
    const body = await safeParseJson(response);
    throw new Error(`DeepL translation failed (${response.status}): ${JSON.stringify(body)}`);
  }

  const json = await response.json();
  const output = json?.translations?.[0]?.text?.trim();
  if (!output) return null;

  const enforced = enforceGlossary(output, glossary);

  return {
    text: enforced.text,
    engine: TRANSLATION_ENGINE.DEEPL,
    rawResponse: { detectedSourceLanguage: json?.translations?.[0]?.detected_source_language },
    glossaryMatches: enforced.matches,
  };
}

async function translateWithGoogle(
  env: any,
  text: string,
  sourceLanguage: string | null,
  targetLanguage: string,
  glossary: GlossaryEntry[],
): Promise<TranslationEngineResponse | null> {
  const apiKey = env.GOOGLE_TRANSLATE_API_KEY ?? env.GOOGLE_API_KEY ?? env.GOOGLE_CLOUD_TRANSLATE_KEY;
  if (!apiKey) return null;

  const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      target: targetLanguage,
      source: sourceLanguage && sourceLanguage !== "auto" ? sourceLanguage : undefined,
      format: "text",
    }),
  });

  if (!response.ok) {
    const body = await safeParseJson(response);
    throw new Error(`Google Translate failed (${response.status}): ${JSON.stringify(body)}`);
  }

  const json = await response.json();
  const output = json?.data?.translations?.[0]?.translatedText;
  if (!output) return null;

  const enforced = enforceGlossary(output, glossary);

  return {
    text: enforced.text,
    engine: TRANSLATION_ENGINE.GOOGLE,
    rawResponse: { detectedSourceLanguage: json?.data?.translations?.[0]?.detectedSourceLanguage },
    glossaryMatches: enforced.matches,
  };
}

async function translateWithCustomEndpoint(
  env: any,
  text: string,
  sourceLanguage: string | null,
  targetLanguage: string,
  glossary: GlossaryEntry[],
  industry: string | null | undefined,
): Promise<TranslationEngineResponse | null> {
  const endpoint = env.CUSTOM_TRANSLATION_ENDPOINT;
  if (!endpoint) return null;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildServiceHeaders(env.CUSTOM_TRANSLATION_TOKEN),
    body: JSON.stringify({
      text,
      sourceLanguage,
      targetLanguage,
      industry,
      glossary,
    }),
  });

  if (!response.ok) {
    const body = await safeParseJson(response);
    throw new Error(`Custom translation endpoint failed (${response.status}): ${JSON.stringify(body)}`);
  }

  const json = await response.json();
  const output = (json?.translation ?? json?.text ?? "").trim();
  if (!output) return null;

  const enforced = enforceGlossary(output, glossary);

  return {
    text: enforced.text,
    engine: TRANSLATION_ENGINE.CUSTOM,
    rawResponse: json,
    glossaryMatches: enforced.matches,
  };
}

async function translateWithLibre(
  env: any,
  text: string,
  sourceLanguage: string | null,
  targetLanguage: string,
  glossary: GlossaryEntry[],
): Promise<TranslationEngineResponse | null> {
  const libreUrl = env.LIBRE_TRANSLATE_URL ?? "https://libretranslate.com";
  const response = await fetch(`${libreUrl.replace(/\/$/, "")}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: sourceLanguage && sourceLanguage !== "auto" ? sourceLanguage : "auto",
      target: targetLanguage,
      format: "text",
    }),
  });

  if (!response.ok) {
    return null;
  }

  const json = await response.json();
  const output = (json?.translatedText ?? "").trim();
  if (!output) return null;

  const enforced = enforceGlossary(output, glossary);

  return {
    text: enforced.text,
    engine: TRANSLATION_ENGINE.AUTO,
    rawResponse: json,
    glossaryMatches: enforced.matches,
  };
}

function enforceGlossary(text: string, glossary: GlossaryEntry[]): { text: string; matches: GlossaryMatch[] } {
  if (!glossary.length || !text) {
    return { text, matches: [] };
  }

  let output = text;
  const matches: GlossaryMatch[] = [];

  for (const entry of glossary) {
    if (!entry.source || !entry.target) continue;
    const source = entry.source.trim();
    const target = entry.target.trim();
    if (!source || !target) continue;

    const regex = new RegExp(`\\b${escapeRegex(source)}\\b`, "gi");
    if (!regex.test(output)) continue;

    output = output.replace(regex, target);
    matches.push({ source, target });
  }

  return { text: output, matches };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function persistTranslations(
  db: ReturnType<typeof getDB>,
  jobId: string,
  targetLanguage: string,
  translations: TranslatedSegment[],
) {
  await db
    .delete(translationSegmentTranslationTable)
    .where(eq(translationSegmentTranslationTable.jobId, jobId));

  const now = new Date();

  for (const translation of translations) {
    await db.insert(translationSegmentTranslationTable).values({
      id: crypto.randomUUID(),
      jobId,
      segmentId: translation.segmentId,
      engine: translation.engine,
      targetLocale: targetLanguage,
      targetText: translation.targetText,
      rawResponse: translation.rawResponse ? JSON.stringify(translation.rawResponse).slice(0, 2000) : null,
      glossaryMatches: translation.glossaryMatches.length ? { matches: translation.glossaryMatches } : null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function buildHtmlLayout(
  pages: PreparedPage[],
  segments: PipelineSegment[],
  translations: TranslatedSegment[],
): string {
  const pageMap = new Map<number, PreparedPage>();
  pages.forEach((page) => pageMap.set(page.pageNumber, page));

  const translationsMap = new Map<string, TranslatedSegment>();
  translations.forEach((translation) => translationsMap.set(translation.segmentId, translation));

  const segmentsByPage = new Map<number, PipelineSegment[]>();
  segments.forEach((segment) => {
    if (!segmentsByPage.has(segment.pageNumber)) {
      segmentsByPage.set(segment.pageNumber, []);
    }
    segmentsByPage.get(segment.pageNumber)!.push(segment);
  });

  const pageHtml = Array.from(pageMap.values()).map((page) => {
    const pageSegments = segmentsByPage.get(page.pageNumber) ?? [];
    const hasBoundingBoxes = pageSegments.every((segment) => Boolean(segment.boundingBox));

    const segmentHtml = hasBoundingBoxes
      ? pageSegments
          .map((segment) => {
            const translation = translationsMap.get(segment.id);
            if (!translation || !segment.boundingBox) return "";
            const box = segment.boundingBox;
            return `<div class="page__textbox" style="left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;">${escapeHtml(
              translation.targetText,
            )}</div>`;
          })
          .join("\n")
      : pageSegments
          .map((segment) => {
            const translation = translationsMap.get(segment.id);
            if (!translation) return "";
            return `<p class="page__paragraph">${escapeHtml(translation.targetText)}</p>`;
          })
          .join("\n");

    const background = page.backgroundDataUri
      ? `<img class="page__background" src="${page.backgroundDataUri}" alt="Page ${page.pageNumber} background" />`
      : "";

    const overlayClass = hasBoundingBoxes ? "page__overlay" : "page__overlay page__overlay--flow";

    return `<section class="page" data-page="${page.pageNumber}" style="width:${page.width}px;height:${page.height}px;">
  ${background}
  <div class="${overlayClass}">
    ${segmentHtml}
  </div>
</section>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Translated PDF Preview</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px;
      background: #f3f4f6;
      font-family: "Inter", "Helvetica", sans-serif;
    }
    main {
      max-width: 960px;
      margin: 0 auto;
    }
    .page {
      position: relative;
      margin: 24px auto;
      background: #fff;
      border-radius: 6px;
      box-shadow: 0 15px 45px rgba(15, 23, 42, 0.15);
      overflow: hidden;
    }
    .page__background {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: opacity(0.2);
    }
    .page__overlay {
      position: absolute;
      inset: 0;
      padding: 48px 56px;
      font-size: 14px;
      line-height: 1.6;
      color: #111827;
    }
    .page__overlay--flow {
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
    }
    .page__textbox {
      position: absolute;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .page__paragraph {
      margin: 0;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <main>
    ${pageHtml.join("\n")}
  </main>
</body>
</html>`;
}

async function renderWithBrowser(env: any, html: string): Promise<Uint8Array | null> {
  if (!html) return null;

  if (env.BROWSER_RENDER_SERVICE_URL) {
    const response = await fetch(env.BROWSER_RENDER_SERVICE_URL, {
      method: "POST",
      headers: buildServiceHeaders(env.BROWSER_RENDER_SERVICE_TOKEN),
      body: JSON.stringify({ html }),
    });
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    }
  }

  const accountId = env.CF_BROWSER_RENDER_ACCOUNT_ID ?? env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CF_BROWSER_RENDER_TOKEN ?? env.CLOUDFLARE_API_TOKEN;

  if (accountId && token) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser_rendering/render/html`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          html,
          wait_until: ["load", "networkidle"],
          response_type: "pdf",
        }),
      },
    );

    if (response.ok) {
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } else {
      const body = await safeParseJson(response);
      console.warn("[pipeline] Cloudflare browser rendering failed", body);
    }
  }

  return null;
}

async function uploadOutputPdf(env: any, job: TranslationJob, bytes: Uint8Array) {
  const inlineKey = `inline-pdf:${Buffer.from(bytes).toString("base64")}`;
  if (!env?.PDF_OUTPUT_BUCKET?.put) {
    return inlineKey;
  }

  const key = `outputs/${job.userId ?? "anonymous"}/${job.id}/${Date.now()}.pdf`;
  try {
    await env.PDF_OUTPUT_BUCKET.put(key, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
      httpMetadata: {
        contentType: "application/pdf",
        contentDisposition: `attachment; filename="${encodeURIComponent(job.title ?? job.sourceFileName ?? "translated.pdf")}"`,
      },
    });
    return key;
  } catch (error) {
    console.warn("[pipeline] Failed to upload output PDF to R2, using inline artifact", error);
    return inlineKey;
  }
}

async function uploadPreview(env: any, job: TranslationJob, html: string) {
  const inlineKey = `inline-html:${Buffer.from(html, "utf-8").toString("base64")}`;
  if (!env?.PDF_PREVIEW_BUCKET?.put) {
    return inlineKey;
  }

  const key = `previews/${job.userId ?? "anonymous"}/${job.id}/${Date.now()}.html`;
  try {
    await env.PDF_PREVIEW_BUCKET.put(key, html, {
      httpMetadata: {
        contentType: "text/html; charset=utf-8",
      },
    });
    return key;
  } catch (error) {
    console.warn("[pipeline] Failed to upload preview HTML to R2, using inline artifact", error);
    return inlineKey;
  }
}

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    try {
      return await response.clone().text();
    } catch {
      return null;
    }
  }
}

async function loadGlossary(glossaryId: string | null) {
  if (!glossaryId) return [] as GlossaryEntry[];
  const db = getDB();
  const entries = await db.query.translationGlossaryEntryTable.findMany({
    where: eq(translationGlossaryEntryTable.glossaryId, glossaryId),
  });
  return entries.map((entry) => ({ source: entry.sourceTerm, target: entry.targetTerm } satisfies GlossaryEntry));
}

function extractTextSegments(pdfBytes: Uint8Array): string[] {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(pdfBytes);

  const regex = /\(([^()]*)\)\s*Tj/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const value = match[1]
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r");
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (cleaned) {
      matches.push(cleaned);
    }
  }

  if (matches.length === 0) {
    const fallback = raw.replace(/[^\x20-\x7E\n]+/g, " ").trim();
    return fallback ? [fallback] : ["(no extractable text)"];
  }

  return matches;
}

function splitIntoBlocks(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/(?<!\.)\.(?!\d)/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paragraphs.length) {
    return [normalized];
  }
  return paragraphs.map((p) => (p.endsWith(".") ? p : `${p}.`));
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createSimplePdf(translatedText: string): Uint8Array {
  const encoder = new TextEncoder();
  const objects: string[] = [];
  const offsets: number[] = [];

  const header = "%PDF-1.4\n";
  let body = "";

  const addObject = (content: string) => {
    offsets.push(header.length + body.length);
    body += content + "\n";
  };

  addObject("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  addObject("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  addObject("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");

  const streamLines = ["BT", "/F1 12 Tf", "50 750 Td"];
  translatedText.split(/\r?\n/).forEach((line) => {
    streamLines.push(`0 -${DEFAULT_FONT_SIZE + 4} Td (${sanitizePdfLiteral(line)}) Tj`);
  });
  streamLines.push("ET");
  const stream = streamLines.join("\n");
  const streamBytes = encoder.encode(stream);
  addObject(
    `4 0 obj << /Length ${streamBytes.length} >> stream\n${stream}\nendstream endobj`,
  );
  addObject(
    "3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj",
  );

  const bodyBytes = encoder.encode(body);
  const xrefOffset = header.length + bodyBytes.length;
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  const trailer = `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const xrefBytes = encoder.encode(xref + trailer);
  const output = new Uint8Array(header.length + bodyBytes.length + xrefBytes.length);
  output.set(encoder.encode(header), 0);
  output.set(bodyBytes, header.length);
  output.set(xrefBytes, header.length + bodyBytes.length);
  return output;
}

function sanitizePdfLiteral(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function arrayBufferToBase64(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString("base64");
}

async function logEvent(
  db: ReturnType<typeof getDB>,
  jobId: string,
  stage: StageName,
  status: (typeof JOB_STATUS)[keyof typeof JOB_STATUS],
  message: string,
) {
  await db.insert(translationJobEventTable).values({
    id: crypto.randomUUID(),
    jobId,
    stage,
    status,
    message,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function setJobStage(
  db: ReturnType<typeof getDB>,
  jobId: string,
  stage: StageName,
  status: (typeof JOB_STATUS)[keyof typeof JOB_STATUS],
  message: string,
) {
  await db
    .update(translationJobTable)
    .set({ currentStage: stage, status, updatedAt: new Date() })
    .where(eq(translationJobTable.id, jobId));

  await logEvent(db, jobId, stage, status, message);
}
