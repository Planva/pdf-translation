import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardTranslationJobRedirect({ params }: PageProps) {
  const { jobId } = await params;
  redirect(`/translations/${jobId}`);
}
