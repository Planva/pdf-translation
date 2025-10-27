import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { getSessionFromCookie } from "@/utils/auth";
import { listTranslationJobs } from "@/server/translation/jobs";
import { JOB_STATUS, type TranslationJob } from "@/db/schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statusLabels: Record<string, string> = {
  [JOB_STATUS.QUEUED]: "Queued",
  [JOB_STATUS.PREPARING]: "Preparing",
  [JOB_STATUS.PROCESSING]: "Processing",
  [JOB_STATUS.COMPLETED]: "Completed",
  [JOB_STATUS.FAILED]: "Failed",
  [JOB_STATUS.CANCELLED]: "Cancelled",
};

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
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

function formatDateDistance(date: Date | null | undefined) {
  if (!date) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

function formatJob(job: TranslationJob) {
  return {
    ...job,
    createdAt: job.createdAt instanceof Date ? job.createdAt : new Date(job.createdAt),
    updatedAt: job.updatedAt instanceof Date ? job.updatedAt : new Date(job.updatedAt),
    startedAt: job.startedAt ? (job.startedAt instanceof Date ? job.startedAt : new Date(job.startedAt)) : null,
    completedAt: job.completedAt ? (job.completedAt instanceof Date ? job.completedAt : new Date(job.completedAt)) : null,
  };
}

export default async function TranslationJobsPage() {
  const session = await getSessionFromCookie();
  if (!session?.user?.id) {
    redirect("/sign-in?next=/dashboard/translations");
  }

  const teamIds = session.teams?.map((team) => team.id) ?? [];

  const jobs = await listTranslationJobs({
    userId: session.user.id,
    teamIds,
    limit: 50,
  });

  const jobRows = jobs.map(formatJob);

  return (
    <>
      <PageHeader
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/dashboard/translations", label: "Translations" },
        ]}
      />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Translation Jobs</h1>
            <p className="text-muted-foreground">
              Upload PDFs and track translation progress in real time.
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/translations/new">New job</Link>
          </Button>
        </div>

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Target language</TableHead>
                <TableHead>Pages</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No translation jobs yet. Start by uploading a PDF.
                  </TableCell>
                </TableRow>
              ) : (
                jobRows.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="max-w-[220px] truncate font-medium">
                      {job.title ?? job.sourceFileName ?? job.id}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(job.status)}>
                        {statusLabels[job.status] ?? job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="uppercase">{job.targetLanguage}</TableCell>
                    <TableCell>{job.pageCount ?? "—"}</TableCell>
                    <TableCell>{formatDateDistance(job.createdAt)}</TableCell>
                    <TableCell>{formatDateDistance(job.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/dashboard/translations/${job.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableCaption>Showing the 50 most recent jobs.</TableCaption>
          </Table>
        </div>
      </div>
    </>
  );
}
