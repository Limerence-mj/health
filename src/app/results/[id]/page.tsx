import { ReportView } from "@/components/report/ReportView";

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportView assessmentId={id} />;
}
