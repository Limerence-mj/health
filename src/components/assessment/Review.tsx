"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { QuestionnaireAnswers } from "@/contracts/questionnaire";
import { api, jsonRequest } from "@/lib/api";

type Assessment = {
  assessmentId: string; status: string; revision: number;
  answers: { age: number; sex: string; goal: string; heightCm: number; weightKg: number; targetWeightKg: number; activityLevel: string };
  questionnaireAnswers: QuestionnaireAnswers;
  progress: { percent: number; nextStep: string | null; canSubmit: boolean };
  eligibility: { status: string; reasonCodes: string[] };
};

const labels: Record<string, string> = {
  MALE: "男性", FEMALE: "女性", LOSE_WEIGHT: "减轻体重", MAINTAIN: "保持体重并塑形", GAIN_WEIGHT: "增加体重与力量",
  SEDENTARY: "入门活动量", LIGHT: "轻度活动", MODERATE: "中度活动", HIGH: "较高活动量",
  FLEXIBLE: "比较灵活", STARTING: "刚刚开始", LIMITED: "活动范围有限", UNSURE: "不太确定",
  UNDER_FIVE: "少于 5 小时", FIVE_SIX: "5–6 小时", SEVEN_EIGHT: "7–8 小时", OVER_EIGHT: "超过 8 小时",
  TRADITIONAL: "均衡家常", MEDITERRANEAN: "地中海式", KETO: "低碳或 Keto", PALEO: "少加工或 Paleo", VEGETARIAN: "蛋奶素", VEGAN: "纯植物", PESCATARIAN: "鱼素", LACTOSE_FREE: "无乳糖", GLUTEN_FREE: "无麸质",
  CORE: "核心", LEGS: "腿部", GLUTES: "臀部", CHEST: "胸肩", ARMS: "手臂", BACK: "背部",
};

function valueLabel(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => labels[String(item)] ?? String(item)).join("、");
  return labels[String(value)] ?? String(value ?? "未填写");
}

export function Review() {
  const router = useRouter();
  const query = useQuery({ queryKey: ["assessment", "current"], queryFn: () => api<Assessment>("/api/v1/assessments/current") });
  useEffect(() => {
    if (query.data?.status === "COMPLETED") router.replace(`/results/${query.data.assessmentId}`);
    else if (query.data?.progress.nextStep) router.replace(`/assessment/${query.data.progress.nextStep}`);
  }, [query.data, router]);
  const submit = useMutation({
    mutationFn: () => api<{ assessmentId: string }>(`/api/v1/assessments/${query.data!.assessmentId}/submit`, jsonRequest("POST", { expectedRevision: query.data!.revision }, true)),
    onSuccess: (data) => router.push(`/results/${data.assessmentId}`),
  });
  if (query.isError) return <div className="shell narrow"><p className="form-error">{query.error.message}</p></div>;
  if (query.isPending || !query.data) return <div className="shell narrow"><div className="loading">正在整理你的答案…</div></div>;
  const a = query.data.answers;
  const q = query.data.questionnaireAnswers;
  const unsupported = query.data.eligibility.status === "UNSUPPORTED";
  return (
    <div className="shell review-shell">
      <div className="review-heading">
        <div>
          <p className="eyebrow">你的回答已保存</p>
          <h1>准备生成你的行动建议</h1>
          <p>请确认下面的信息；如有变化，可以返回对应部分修改。</p>
        </div>
        <div className="review-image"><Image src="/images/wellness/result-confidence-v2.png" alt="完成训练后补充水分" fill sizes="(max-width: 760px) 100vw, 360px" /></div>
      </div>
      <div className={`panel ${unsupported ? "unsupported" : ""}`}>
        <div className="summary-list">
          <div className="summary-row"><span>目标方向</span><strong>{labels[a.goal]} · {valueLabel(q.profile?.dreamBody)}</strong><Link href="/assessment/profile">修改</Link></div>
          <div className="summary-row"><span>活动能力</span><strong>{valueLabel(q.activity?.flexibility)} · {labels[a.activityLevel]}</strong><Link href="/assessment/activity">修改</Link></div>
          <div className="summary-row"><span>重点部位</span><strong>{valueLabel(q.activity?.targetZones)}</strong><Link href="/assessment/activity">修改</Link></div>
          <div className="summary-row"><span>恢复与作息</span><strong>睡眠 {valueLabel(q.lifestyle?.sleepDuration)}</strong><Link href="/assessment/lifestyle">修改</Link></div>
          <div className="summary-row"><span>饮食偏好</span><strong>{valueLabel(q.nutrition?.dietPreference)}</strong><Link href="/assessment/nutrition">修改</Link></div>
          <div className="summary-row"><span>身体数据</span><strong>{a.age} 岁 · {labels[a.sex]} · {a.heightCm} cm</strong><Link href="/assessment/metrics">修改</Link></div>
          <div className="summary-row"><span>体重方向</span><strong>{a.weightKg} → {a.targetWeightKg} kg</strong><Link href="/assessment/metrics">修改</Link></div>
        </div>
        {unsupported
          ? <div className="notice"><strong>部分信息需要重新确认。</strong><br />请返回检查填写内容后再试。</div>
          : <p className="notice">我们会根据你填写的目标方向提供分阶段建议，你可以随时返回修改。</p>}
        {submit.isError && <p className="form-error">{submit.error.message}</p>}
        <div className="form-actions">
          <Link className="button button-secondary" href="/assessment/metrics">← 返回修改</Link>
          <button type="button" className="button button-primary" disabled={unsupported || submit.isPending || !query.data.progress.canSubmit} onClick={() => submit.mutate()}>{submit.isPending ? "正在生成建议…" : "生成我的行动建议 →"}</button>
        </div>
      </div>
    </div>
  );
}
