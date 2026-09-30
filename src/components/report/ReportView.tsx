"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PersonalPlan, PlanPreview } from "@/domain/personal-plan";
import { api } from "@/lib/api";

type Report = {
  assessmentId: string;
  access: "PREVIEW" | "FULL";
  summary: { bmi: number; goal: string };
  wellnessProfile: {
    secondaryGoals: string[]; dreamBody: string | null; flexibility: string | null; exerciseFrequency: string | null;
    targetZones: string[]; sensitivities: string[]; workSchedule: string | null; energyLevel: string | null;
    waterIntake: string | null; sleepDuration: string | null; dietPreference: string | null; eatingHabits: string[];
  };
  planPreview: PlanPreview;
  personalPlan?: PersonalPlan;
  nutrition?: { restingEnergyKcal: number; maintenanceKcal: number; suggestedIntakeKcal: number };
  prediction?: { status: string; baseDate: string; targetDate: string | null; durationDays: number | null; weeklyChangeKg: number; curve: { date: string; weightKg: number }[] };
  lockedFeatures?: string[];
  paymentAvailable: boolean;
  subscription: { effectiveStatus: string; expiresAt: string | null };
  warnings: { code: string; message: string }[];
  notice: string;
  demo?: boolean;
  demoSessionExpiresAt?: string;
};

const goalLabels: Record<string, string> = { LOSE_WEIGHT: "减轻体重", MAINTAIN: "保持状态", GAIN_WEIGHT: "增加体重" };
const answerLabels: Record<string, string> = {
  STRENGTH: "核心力量", POSTURE: "体态", STRESS: "减压", FLEXIBILITY: "柔韧性", NONE: "无特别情况",
  FLEXIBLE: "柔韧基础较好", STARTING: "正在建立柔韧性", LIMITED: "需要温和增加活动范围", UNSURE: "需要从基础测试开始",
  ALMOST_DAILY: "几乎每天", SEVERAL_WEEKLY: "每周几次", SEVERAL_MONTHLY: "每月几次", NEVER: "刚准备开始",
  CORE: "核心", LEGS: "腿部", GLUTES: "臀部", CHEST: "胸肩体态", ARMS: "手臂", BACK: "背部",
  DAYTIME: "规律白班", NIGHT: "夜班节律", NOT_WORKING: "自主安排",
  LOW: "多数时间疲惫", AFTERNOON_SLUMP: "午后能量下降", BEFORE_MEALS: "饭前能量下降", STEADY: "精力较稳定",
  COFFEE_TEA: "饮水偏少", TWO_GLASSES: "约 2 杯", TWO_SIX: "2–6 杯", MORE_SIX: "超过 6 杯",
  UNDER_FIVE: "少于 5 小时", FIVE_SIX: "5–6 小时", SEVEN_EIGHT: "7–8 小时", OVER_EIGHT: "超过 8 小时",
  TRADITIONAL: "均衡家常", MEDITERRANEAN: "地中海式", KETO: "低碳或 Keto", PALEO: "少加工或 Paleo",
  VEGETARIAN: "蛋奶素", VEGAN: "纯植物", PESCATARIAN: "鱼素", LACTOSE_FREE: "无乳糖", GLUTEN_FREE: "无麸质",
};

function readable(value: string | null | undefined): string {
  return value ? answerLabels[value] ?? value : "待观察";
}

function WellnessSnapshot({ report }: { report: Report }) {
  const profile = report.wellnessProfile;
  return <section className="panel wellness-snapshot">
    <div className="section-heading"><div><p className="eyebrow">基于本次测评</p><h2>你的生活方式概览</h2></div><span className="section-badge">结合你的选择</span></div>
    <div className="insight-grid">
      <article className="insight-card"><span>活动起点</span><strong>{readable(profile.flexibility)}</strong><p>{readable(profile.exerciseFrequency)}运动</p></article>
      <article className="insight-card"><span>恢复基础</span><strong>睡眠 {readable(profile.sleepDuration)}</strong><p>饮水：{readable(profile.waterIntake)}</p></article>
      <article className="insight-card"><span>饮食方式</span><strong>{readable(profile.dietPreference)}</strong><p>建议围绕现有偏好做微调</p></article>
    </div>
    <div className="focus-row"><span>优先训练</span><strong>{profile.targetZones.length ? profile.targetZones.map((item) => readable(item)).join(" · ") : "全身基础"}</strong></div>
  </section>;
}

function PlanOverview({ report }: { report: Report }) {
  const plan = report.planPreview;
  return <section className="panel plan-overview">
    <div className="section-heading">
      <div><p className="eyebrow">根据你的回答生成</p><h2>{plan.title}</h2></div>
      <span className="section-badge">{plan.durationLabel}</span>
    </div>
    <p className="plan-overview-copy">这不是通用课程列表。训练频次、单次时长、器材方式、恢复和饮食节律都由本次问卷确定。</p>
    <div className="plan-facts" aria-label="方案概览">
      <div><span>训练频次</span><strong>{plan.cadenceLabel}</strong></div>
      <div><span>单次时长</span><strong>{plan.sessionLabel}</strong></div>
      <div><span>器材方式</span><strong>{plan.equipmentLabel}</strong></div>
    </div>
    <ul className="benefit-list">{plan.highlights.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
  </section>;
}

function PersonalPlanDetails({ plan }: { plan: PersonalPlan }) {
  return <>
    <section className="panel personal-plan" aria-labelledby="personal-plan-title">
      <div className="section-heading">
        <div><p className="eyebrow">你的行动方案</p><h2 id="personal-plan-title">{plan.title}</h2></div>
        <span className="section-badge">{plan.durationDays} 天</span>
      </div>
      <p className="plan-subtitle">{plan.subtitle}</p>
      <div className="cadence-grid">
        <div><strong>{plan.cadence.workoutsPerWeek}</strong><span>次主训练 / 周</span></div>
        <div><strong>{plan.cadence.sessionMinutes}</strong><span>建议单次时长</span></div>
        <div><strong>{plan.cadence.walkDays}</strong><span>天步行 / 周</span></div>
        <div><strong>{plan.cadence.equipment}</strong><span>器材配置</span></div>
      </div>
      <div className="schedule-note"><strong>时间安排：</strong>{plan.cadence.scheduleHint}</div>
      <h3>第一周节奏样例</h3>
      <div className="weekly-schedule">
        {plan.weeklySchedule.map((item) => <article key={item.day} className={`schedule-item ${item.type.toLowerCase()}`}>
          <span className="schedule-day">{item.day}</span>
          <div><strong>{item.title}</strong><p>{item.detail}</p></div>
          <span className="schedule-duration">{item.duration}</span>
        </article>)}
      </div>
    </section>

    <section className="panel plan-section">
      <p className="eyebrow">循序推进</p><h2>28 天分为三个阶段</h2>
      <div className="phase-grid">{plan.phases.map((phase, index) => <article key={phase.period}><span>{String(index + 1).padStart(2, "0")}</span><small>{phase.period}</small><strong>{phase.title}</strong><p>{phase.detail}</p></article>)}</div>
    </section>

    <div className="plan-columns">
      <section className="panel plan-section">
        <p className="eyebrow">训练原则</p><h2>为什么这样安排</h2>
        <ul className="action-list">{plan.trainingPrinciples.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section className="panel plan-section">
        <p className="eyebrow">恢复保护</p><h2>体感优先</h2>
        <ul className="action-list">{plan.recoveryActions.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
    </div>

    <section className="panel plan-section nutrition-plan">
      <div className="section-heading"><div><p className="eyebrow">饮食节律</p><h2>{plan.nutritionRhythm.pattern}</h2></div><span className="section-badge">不强制换饮食方式</span></div>
      <p className="meal-timing">{plan.nutritionRhythm.mealTiming}</p>
      <ul className="action-list">{plan.nutritionRhythm.actions.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>

    <section className="panel plan-section personalization-card">
      <p className="eyebrow">个性化依据</p><h2>这些回答改变了方案</h2>
      <div className="personalization-list">{plan.personalization.map((item, index) => <div key={item}><span>{index + 1}</span><p>{item}</p></div>)}</div>
      <p className="notice">{plan.safetyNotice}</p>
    </section>
  </>;
}

function FullDetails({ report }: { report: Report }) {
  if (!report.nutrition || !report.prediction || !report.personalPlan) return null;
  const p = report.prediction;
  return <>
    <PersonalPlanDetails plan={report.personalPlan} />
    <section className="panel" style={{ marginBottom: 22 }}>
      <h2>每日能量情景</h2>
      <p style={{ color: "var(--muted)" }}>由基础代谢估算与所选活动系数组合得到，不是个人医疗处方。</p>
      <div className="metric-grid">
        <div className="metric"><span>静息能量估算</span><strong>{report.nutrition.restingEnergyKcal}</strong><span>kcal / 天</span></div>
        <div className="metric"><span>维持水平估算</span><strong>{report.nutrition.maintenanceKcal}</strong><span>kcal / 天</span></div>
        <div className="metric"><span>目标情景摄入</span><strong>{report.nutrition.suggestedIntakeKcal}</strong><span>kcal / 天</span></div>
      </div>
    </section>
    <section className="panel">
      <h2>阶段变化时间线</h2>
      <>
        <p style={{ color: "var(--muted)" }}>{p.status === "AT_TARGET" ? "你填写的当前体重已等于阶段目标。" : `按每周 ${p.weeklyChangeKg} kg 的固定情景，长期方向约为 ${p.durationDays} 天。该日期仅用于拆分阶段，不是结果承诺。`}</p>
        <div className="chart-wrap" aria-label="体重变化情景折线图">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={p.curve} margin={{ top: 10, right: 14, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="#e7ded5" strokeDasharray="4 4" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#746b66" }} minTickGap={32} />
              <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 11, fill: "#746b66" }} />
              <Tooltip formatter={(value) => [`${value} kg`, "体重情景"]} />
              <Line type="monotone" dataKey="weightKg" stroke="#ed765f" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
      <p className="fine-print">{report.notice}</p>
    </section>
  </>;
}

export function ReportContent({ report, onUnlock, paying = false }: { report: Report; onUnlock?: () => void; paying?: boolean }) {
  return <>
    <div className="report-hero">
      <section className="panel score-card">
        <div><small>你的 BMI 估算</small><div className="big-number">{report.summary.bmi}</div></div>
        <div><small>当前方向</small><strong>{goalLabels[report.summary.goal] ?? report.summary.goal}</strong></div>
      </section>
      <section className="panel">
        <p className="eyebrow">报告已生成</p>
        <h1 style={{ fontFamily: "Georgia, 'Noto Sans SC Variable', serif", fontSize: 39, lineHeight: 1.12, fontWeight: 500 }}>这是一张起点地图，<br />不是终点承诺。</h1>
        <p style={{ color: "var(--muted)" }}>BMI 仅是群体层面的筛查指标。请结合身体感受和专业建议理解结果。</p>
        <div className="notice">本报告不诊断疾病，也不替代医生、营养师或运动专业人员。</div>
        <div className="report-photo"><Image src="/images/wellness/result-confidence-v2.png" alt="完成训练后补充水分" fill sizes="(max-width: 760px) 100vw, 52vw" /></div>
      </section>
    </div>
    <PlanOverview report={report} />
    <WellnessSnapshot report={report} />
    {report.warnings.length > 0 && <section className="report-warnings">{report.warnings.map((warning) => <p className="notice" key={warning.code}>{warning.message}</p>)}</section>}
    {report.access === "FULL" ? <FullDetails report={report} /> : <section className="panel locked plan-locked">
      <div className="locked-content" aria-hidden="true"><h2>第一周个性化安排</h2><div className="locked-schedule">{[1, 2, 3, 4].map((item) => <span key={item} />)}</div><div className="chart-wrap" /></div>
      <div className="unlock-box"><div><p className="eyebrow">完整 28 天方案</p><h2>解锁训练、恢复与饮食行动</h2><p>包含 7 天节奏样例、三阶段路线、个性化安排依据、能量情景和目标时间线。</p><ul className="unlock-benefits">{report.planPreview.highlights.map((item) => <li key={item}>✓ {item}</li>)}</ul><p className="fine-print">这是演示解锁，不显示金额，不接入订单或支付渠道，也不会产生真实扣款。</p>{report.paymentAvailable && onUnlock ? <button type="button" className="button button-coral" onClick={onUnlock} disabled={paying}>演示解锁完整报告</button> : report.demo ? <p className="notice">这是固定预览；可使用页面顶部的视图切换查看完整示例。</p> : <p className="notice" role="status">当前运行环境未开放报告解锁。基础结果仍可正常查看。</p>}</div></div>
    </section>}
  </>;
}

export function ReportView({ assessmentId }: { assessmentId: string }) {
  const queryClient = useQueryClient();
  const [showPay, setShowPay] = useState(false);
  const [paymentAttempt, setPaymentAttempt] = useState<{ eventId: string; key: string } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const paymentPendingRef = useRef(false);
  const report = useQuery({ queryKey: ["report", assessmentId], queryFn: () => api<Report>(`/api/v1/assessments/${assessmentId}/result`) });
  const pay = useMutation({
    mutationFn: () => {
      if (!paymentAttempt) throw new Error("支付请求尚未初始化");
      return api("/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": paymentAttempt.key },
        body: JSON.stringify({ assessmentId, eventId: paymentAttempt.eventId, planCode: "DEMO_30D" }),
      });
    },
    onSuccess: async () => { setShowPay(false); await queryClient.invalidateQueries({ queryKey: ["report", assessmentId] }); },
    onError: async () => { await queryClient.invalidateQueries({ queryKey: ["report", assessmentId] }); },
  });
  useEffect(() => {
    paymentPendingRef.current = pay.isPending;
  }, [pay.isPending]);
  useEffect(() => {
    if (!showPay) return;
    const modal = modalRef.current;
    const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusable = () => Array.from(modal?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !paymentPendingRef.current) {
        event.preventDefault();
        setShowPay(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [showPay]);
  if (report.isError) return <div className="shell narrow"><div className="panel"><p className="form-error">{report.error.message}</p><Link className="button button-secondary" href="/">返回首页</Link></div></div>;
  if (report.isPending || !report.data) return <div className="shell"><div className="loading">正在打开你的报告…</div></div>;
  return <div className="shell">
    <div className="page-intro"><p className="eyebrow">你的健康情景报告</p><h1>{report.data.access === "FULL" ? "完整报告已解锁" : "你的基础结果已就绪"}</h1><p>{report.data.subscription.expiresAt ? `完整权益有效至 ${new Date(report.data.subscription.expiresAt).toLocaleDateString("zh-CN")}` : "先了解基础结果，再决定是否查看完整情景。"}</p></div>
    <ReportContent report={report.data} onUnlock={() => { returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPaymentAttempt({ eventId: crypto.randomUUID(), key: crypto.randomUUID() }); setShowPay(true); }} paying={pay.isPending} />
    <div className="form-actions"><Link className="button button-secondary" href="/">返回首页</Link><Link className="button button-secondary" href="/privacy">管理我的数据</Link></div>
    {showPay && report.data.access !== "FULL" && <div className="modal-backdrop" role="presentation" onMouseDown={() => !pay.isPending && setShowPay(false)}><div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="pay-title" aria-describedby="pay-description" onMouseDown={(event) => event.stopPropagation()}><p className="eyebrow">演示解锁</p><h2 id="pay-title">确认解锁「{report.data.planPreview.title}」</h2><p id="pay-description">本操作只演示受保护内容从预览切换为完整报告。不会显示金额、跳转第三方或创建订单，也不会扣款。</p><div className="pay-summary"><span>{report.data.planPreview.cadenceLabel}</span><span>{report.data.planPreview.sessionLabel}</span><span>{report.data.planPreview.durationLabel}完整访问</span></div><div className="notice">演示权益 · 无真实价格 · 无支付渠道</div>{pay.isError && <p className="form-error">未收到演示解锁响应，正在重新读取权益。再次确认会复用同一请求，不会重复激活。</p>}<div className="modal-actions"><button type="button" className="button button-secondary" disabled={pay.isPending} onClick={() => setShowPay(false)}>取消</button><button type="button" className="button button-coral" disabled={pay.isPending} onClick={() => pay.mutate()}>{pay.isPending ? "正在激活…" : pay.isError ? "用原请求再次确认" : "确认演示解锁"}</button></div></div></div>}
  </div>;
}

export type { Report };
