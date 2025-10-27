import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getSessionFromCookie } from "@/utils/auth";
import { getTranslationJobWithRelations } from "@/server/translation/jobs";
import { JOB_STAGE, JOB_STATUS, TRANSLATION_ENGINE } from "@/db/schema";
import { CancelJobButton } from "../_components/cancel-job-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: {
    jobId: string;
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatDate(value?: Date | null) {
  if (!value) return "—";
  return formatDistanceToNow(value, { addSuffix: true });
}

const stageLabels: Record<string, string> = {
  [JOB_STAGE.PREPARE]: "Preparing",
  [JOB_STAGE.OCR]: "OCR",
  [JOB_STAGE.SEGMENT]: "Segmenting",
  [JOB_STAGE.TRANSLATE]: "Translating",
  [JOB_STAGE.LAYOUT]: "Laying out",
  [JOB_STAGE.RENDER]: "Rendering",
  [JOB_STAGE.PUBLISH]: "Publishing",
};

const statusLabels: Record<string, string> = {
  [JOB_STATUS.QUEUED]: "Queued",
  [JOB_STATUS.PREPARING]: "Preparing",
  [JOB_STATUS.PROCESSING]: "Processing",
  [JOB_STATUS.COMPLETED]: "Completed",
  [JOB_STATUS.FAILED]: "Failed",
  [JOB_STATUS.CANCELLED]: "Cancelled",
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case JOB_STATUS.COMPLETED:
      return "default";
    case JOB_STATUS.PROCESSING:
    case JOB_STATUS.PREPARING:
      return "secondary";
    case JOB_STATUS.FAILED:
    case JOB_STATUS.CANCELLED:
      return "destructive";
    default:
      return "outline";
  }
}

function resolveEngineLabel(engine: string | null) {
  switch (engine) {
    case TRANSLATION_ENGINE.DEEPL:
      return "DeepL";
    case TRANSLATION_ENGINE.GOOGLE:
      return "Google Translate";
    case TRANSLATION_ENGINE.OPENAI:
      return "OpenAI";
    case TRANSLATION_ENGINE.CUSTOM:
      return "Custom";
    default:
      return "Auto";
  }
}

export default async function TranslationJobPublicPage({ params }: PageProps) {
  const { jobId } = params;

  const session = await getSessionFromCookie();
  if (!session?.user?.id) {
    redirect(`/sign-in?next=/translations/${jobId}`);
  }

  const teamIds = session.teams?.map((team) => team.id) ?? [];

  const job = await getTranslationJobWithRelations(jobId, {
    userId: session.user.id,
    teamIds,
  });

  if (!job) {
    notFound();
  }

  const createdAt = job.createdAt instanceof Date ? job.createdAt : new Date(job.createdAt);
  const updatedAt = job.updatedAt instanceof Date ? job.updatedAt : new Date(job.updatedAt);
  const startedAt = job.startedAt instanceof Date ? job.startedAt : job.startedAt ? new Date(job.startedAt) : null;
  const completedAt = job.completedAt instanceof Date ? job.completedAt : job.completedAt ? new Date(job.completedAt) : null;
  const cancelledAt = job.cancelledAt instanceof Date ? job.cancelledAt : job.cancelledAt ? new Date(job.cancelledAt) : null;
  const ocrEnabled = Boolean(job.ocrEnabled);

  const recentEvents = job.events.slice(0, 6);
  const canCancel = [JOB_STATUS.QUEUED, JOB_STATUS.PREPARING, JOB_STATUS.PROCESSING].includes(job.status);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/#upload" className="text-sm text-muted-foreground hover:text-primary">
              ← Back to uploader
            </Link>
            <span className="text-sm text-muted-foreground">Job ID: {job.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant(job.status)}>{statusLabels[job.status] ?? job.status}</Badge>
            <Badge variant="outline">{stageLabels[job.currentStage] ?? job.currentStage}</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {job.title ?? job.sourceFileName ?? `Job ${job.id}`}
            </h1>
            <p className="text-muted-foreground">
              {job.sourceFileName ?? "Uploaded document"} · {formatBytes(job.sourceFileSize)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canCancel ? <CancelJobButton jobId={job.id} /> : null}
            <Button variant="outline" asChild>
              <Link href="/#upload">Translate another PDF</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Job details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Target language</span>
                  <p className="text-base font-medium uppercase">{job.targetLanguage}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Source language</span>
                  <p className="text-base font-medium uppercase">
                    {job.sourceLanguage ? job.sourceLanguage : "Auto-detect"}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Engine</span>
                  <p className="text-base font-medium">{resolveEngineLabel(job.enginePreference)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">OCR</span>
                  <p className="text-base font-medium">{ocrEnabled ? "Enabled" : "Disabled"}</p>
                </div>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Created</span>
                  <p className="text-base font-medium">{formatDate(createdAt)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Last updated</span>
                  <p className="text-base font-medium">{formatDate(updatedAt)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Started</span>
                  <p className="text-base font-medium">{formatDate(startedAt ?? null)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Completed</span>
                  <p className="text-base font-medium">{formatDate(completedAt ?? null)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Pages detected</span>
                <p className="text-base font-medium">{job.pageCount ?? "—"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Segments</span>
                <p className="text-base font-medium">{job.segmentCount ?? "—"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Industry</span>
                <p className="text-base font-medium">{job.industry ?? "General"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Cancelled</span>
                <p className="text-base font-medium">{formatDate(cancelledAt)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent events</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events logged yet.</p>
              ) : (
                <ul className="space-y-3">
                  {recentEvents.map((event) => {
                    const eventDate =
                      event.createdAt instanceof Date
                        ? event.createdAt
                        : new Date(event.createdAt);
                    return (
                      <li
                        key={event.id}
                        className="flex items-start justify-between gap-3 rounded-md border p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {stageLabels[event.stage] ?? event.stage}
                          </p>
                          {event.message ? (
                            <p className="text-sm text-muted-foreground">{event.message}</p>
                          ) : null}
                        </div>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDistanceToNow(eventDate, { addSuffix: true })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Artifacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Source file</span>
                <p className="truncate text-sm font-medium">
                  {job.sourceFileName ?? job.sourceFileKey}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Source key</span>
                <code className="block truncate rounded bg-muted px-2 py-1 text-xs">
                  {job.sourceFileKey}
                </code>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Output key</span>
                <code className="block truncate rounded bg-muted px-2 py-1 text-xs">
                  {job.outputFileKey ?? "Pending"}
                </code>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Download links will appear once rendering completes and the PDF is published.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
