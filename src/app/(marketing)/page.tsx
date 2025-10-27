import Link from "next/link";
import { Metadata } from "next";

import CreditTestButton from "@/components/credit-test-button";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { FAQ } from "@/components/landing/faq";
import { Button } from "@/components/ui/button";
import { JobCreateForm } from "@/app/(dashboard)/dashboard/translations/new/job-create-form";
import { getSessionFromCookie } from "@/utils/auth";
import { SITE_NAME, SITE_DESCRIPTION } from "@/constants";
import { listAccessibleGlossaries } from "@/server/translation/glossaries";

const DEFAULT_MAX_UPLOAD_BYTES = 75 * 1024 * 1024;

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
};

export default async function Home() {
  const session = await getSessionFromCookie();
  const isAuthenticated = Boolean(session?.user?.id);

  const teamOptions =
    session?.teams?.map((team) => ({
      id: team.id,
      name: team.name,
    })) ?? [];
  const teamIds = teamOptions.map((team) => team.id);

  const glossaryOptions = isAuthenticated && session?.user?.id
    ? await listAccessibleGlossaries(session.user.id, teamIds)
    : [];

  const maxUploadBytes =
    Number(process.env.NEXT_PUBLIC_MAX_PDF_SIZE_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES) ||
    DEFAULT_MAX_UPLOAD_BYTES;

  return (
    <main>
      <div className="mt-4">
        <CreditTestButton />
      </div>
      <Hero />

      <section id="upload" className="border-y bg-muted/30">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16 md:flex-row md:items-center md:py-20">
          <div className="flex-1 space-y-4 text-center md:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
              PDF Translation Workflow
            </div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Translate your first PDF in a few clicks
            </h2>
            <p className="text-muted-foreground">
              Upload a document, choose the target language, and we&apos;ll handle segmentation,
              translation engine selection, glossary enforcement, and layout preservation.
            </p>
            {!isAuthenticated ? (
              <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
                <Button asChild>
                  <Link href="/sign-up">Create free account</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/sign-in">Sign in</Link>
                </Button>
              </div>
            ) : null}
          </div>
          <div className="flex-1 rounded-xl border bg-background p-6 shadow-sm">
            {isAuthenticated ? (
              <JobCreateForm
                teamOptions={teamOptions}
                glossaryOptions={glossaryOptions}
                maxUploadBytes={maxUploadBytes}
              />
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Sign in to upload a PDF. Once authenticated, you can configure industry glossaries,
                enable OCR for scanned docs, and monitor progress from your dashboard.
              </p>
            )}
          </div>
        </div>
      </section>

      <Features />
      <FAQ />
    </main>
  );
}
