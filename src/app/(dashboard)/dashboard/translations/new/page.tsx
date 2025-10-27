import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { getSessionFromCookie } from "@/utils/auth";
import { JobCreateForm } from "./job-create-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_MAX_UPLOAD_BYTES = 75 * 1024 * 1024;

export default async function NewTranslationJobPage() {
  const session = await getSessionFromCookie();
  if (!session?.user?.id) {
    redirect("/sign-in?next=/dashboard/translations/new");
  }

  const teamOptions =
    session.teams?.map((team) => ({
      id: team.id,
      name: team.name,
    })) ?? [];

  const maxUploadBytes =
    Number(process.env.NEXT_PUBLIC_MAX_PDF_SIZE_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES) || DEFAULT_MAX_UPLOAD_BYTES;

  return (
    <>
      <PageHeader
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/dashboard/translations", label: "Translations" },
          { href: "/dashboard/translations/new", label: "New job" },
        ]}
      />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <Card>
          <CardHeader>
            <CardTitle>Create a translation job</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Upload a PDF document, choose the target language, and optionally select an industry glossary.
              We&apos;ll store the file securely in R2 and start processing via Cloudflare Queues.
            </p>
            <JobCreateForm teamOptions={teamOptions} maxUploadBytes={maxUploadBytes} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
