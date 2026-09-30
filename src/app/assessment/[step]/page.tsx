import { notFound } from "next/navigation";
import { STEPS, type StepKey } from "@/contracts/constants";
import { AssessmentFlow } from "@/components/assessment/AssessmentFlow";

export default async function AssessmentStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  if (!STEPS.includes(step as StepKey)) notFound();
  return <AssessmentFlow step={step as StepKey} />;
}
