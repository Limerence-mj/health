"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HEALTH_CONSENT_VERSION, MODEL_SCOPE_VERSION, STEPS, type StepKey } from "@/contracts/constants";
import { hasAnswer, type QuestionnaireAnswers, type StageAnswers } from "@/contracts/questionnaire";
import { api, jsonRequest } from "@/lib/api";
import { STAGE_META, STAGE_SCREENS, TOTAL_QUESTION_COUNT, type QuestionScreen } from "@/components/assessment/questionnaire-config";
import { DemoSafetyNotice } from "@/components/DemoSafetyNotice";

type Assessment = {
  assessmentId: string;
  status: string;
  revision: number;
  answers: { age: number | null; sex: string | null; goal: string | null; heightCm: number | null; weightKg: number | null; targetWeightKg: number | null; activityLevel: string | null };
  questionnaireAnswers: QuestionnaireAnswers;
  scope: { confirmed: boolean };
  progress: { completedSteps: StepKey[]; percent: number; nextStep: StepKey | null; canSubmit: boolean };
  eligibility: { status: string; reasonCodes: string[]; allowedTargetRange?: { min: number; max: number } | null };
};

type SaveRequest = { patch: StageAnswers; nextIndex: number; finishStage: boolean };

function isAnswered(screen: QuestionScreen, answers: StageAnswers): boolean {
  if (screen.kind === "info") return true;
  if (screen.kind === "consent") return answers.healthDataConsent === true && answers.modelScopeConfirmed === true;
  return hasAnswer(answers[screen.key]);
}

function stageQuestionNumber(step: StepKey, index: number): number {
  const stepIndex = STEPS.indexOf(step);
  return STEPS.slice(0, stepIndex).reduce((sum, item) => sum + STAGE_SCREENS[item].filter((screen) => screen.kind !== "info").length, 0)
    + STAGE_SCREENS[step].slice(0, index + 1).filter((screen) => screen.kind !== "info").length;
}

function previousRoute(step: StepKey): string {
  const index = STEPS.indexOf(step);
  return index === 0 ? "/" : `/assessment/${STEPS[index - 1]}`;
}

function nextRoute(step: StepKey): string {
  const index = STEPS.indexOf(step);
  return index === STEPS.length - 1 ? "/assessment/review" : `/assessment/${STEPS[index + 1]}`;
}

export function AssessmentFlow({ step }: { step: StepKey }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const assessment = useQuery({ queryKey: ["assessment", "current"], queryFn: () => api<Assessment>("/api/v1/assessments/current") });
  const screens = useMemo(() => STAGE_SCREENS[step], [step]);
  const [screenIndex, setScreenIndex] = useState(0);
  const [draft, setDraft] = useState<StageAnswers>({});
  const [dirty, setDirty] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [analysisDoneCount, setAnalysisDoneCount] = useState(0);
  const savedDraft = assessment.data?.questionnaireAnswers[step] ?? {};
  const activeDraft = dirty ? draft : savedDraft;
  const firstMissing = screens.findIndex((item) => item.kind !== "info" && !isAnswered(item, savedDraft));
  const completedStageIndex = screens.at(-1)?.kind === "info" ? screens.length - 1 : 0;
  const activeIndex = dirty ? screenIndex : firstMissing >= 0 ? firstMissing : completedStageIndex;
  const screen = screens[activeIndex] ?? screens[0]!;
  const meta = STAGE_META[step];
  const analysisSteps = screen.kind === "info" ? screen.analysisSteps ?? [] : [];

  useEffect(() => {
    if (!assessment.data) return;
    if (assessment.data.status === "COMPLETED") {
      router.replace(`/results/${assessment.data.assessmentId}`);
      return;
    }
    if (assessment.data.progress.nextStep && STEPS.indexOf(step) > STEPS.indexOf(assessment.data.progress.nextStep)) {
      router.replace(`/assessment/${assessment.data.progress.nextStep}`);
      return;
    }
  }, [assessment.data, router, step]);

  useEffect(() => {
    if (analysisSteps.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const immediate = window.setTimeout(() => setAnalysisDoneCount(analysisSteps.length), 0);
      return () => window.clearTimeout(immediate);
    }
    const timer = window.setInterval(() => {
      setAnalysisDoneCount((current) => {
        const next = Math.min(analysisSteps.length, current + 1);
        if (next >= analysisSteps.length) window.clearInterval(timer);
        return next;
      });
    }, 480);
    return () => window.clearInterval(timer);
  }, [screen.id, analysisSteps.length]);

  const save = useMutation({
    mutationFn: async (request: SaveRequest) => {
      if (!assessment.data) throw new Error("测评尚未加载");
      return api<Assessment>(`/api/v1/assessments/${assessment.data.assessmentId}/steps/${step}`, jsonRequest("PUT", {
        expectedRevision: assessment.data.revision,
        data: request.patch,
      }, true));
    },
    onSuccess: (data, request) => {
      queryClient.setQueryData(["assessment", "current"], data);
      setDraft((current) => ({ ...(dirty ? current : savedDraft), ...request.patch }));
      setDirty(true);
      setLocalError(null);
      if (request.finishStage) router.push(nextRoute(step));
      else setScreenIndex(request.nextIndex);
    },
  });

  if (assessment.isPending || !screen) return <div className="shell narrow"><div className="loading">正在恢复你的进度…</div></div>;
  if (assessment.isError) return <div className="shell narrow"><div className="panel"><p className="form-error">{assessment.error.message}</p><Link className="button button-secondary" href="/">返回首页</Link></div></div>;

  const goBack = () => {
    if (activeIndex > 0) { setDirty(true); setDraft(activeDraft); setScreenIndex(activeIndex - 1); }
    else router.push(previousRoute(step));
  };
  const finishStageAt = () => activeIndex >= screens.length - 1;
  const persist = (patch: StageAnswers, next = activeIndex + 1) => {
    save.mutate({ patch, nextIndex: next, finishStage: finishStageAt() });
  };
  const chooseSingle = (key: string, value: string) => persist({ [key]: value });
  const currentProgress = Math.max(1, stageQuestionNumber(step, activeIndex));
  const progressPercent = Math.min(100, Math.round(currentProgress / TOTAL_QUESTION_COUNT * 100));
  const visibleImage = screen.image ?? meta.image;
  const visibleImageAlt = screen.imageAlt ?? meta.imageAlt;
  const analysisComplete = analysisSteps.length === 0 || analysisDoneCount >= analysisSteps.length;

  const continueMulti = () => {
    if (screen.kind !== "multi") return;
    const selected = activeDraft[screen.key];
    if (!Array.isArray(selected) || selected.length === 0) {
      setLocalError("请至少选择一项");
      return;
    }
    persist({ [screen.key]: selected });
  };

  const continueNumber = () => {
    if (screen.kind !== "number") return;
    const value = Number(activeDraft[screen.key]);
    if (!Number.isFinite(value) || value < screen.min || value > screen.max || (screen.integer && !Number.isInteger(value))) {
      setLocalError(screen.integer ? "请输入有效的整数年龄" : "请检查输入数值是否正确");
      return;
    }
    persist({ [screen.key]: screen.integer ? value : Math.round(value * 10) / 10 });
  };

  const continueConsent = () => {
    if (activeDraft.healthDataConsent !== true || activeDraft.modelScopeConfirmed !== true) {
      setLocalError("请确认两项说明后继续");
      return;
    }
    persist({
      healthDataConsent: true,
      consentVersion: HEALTH_CONSENT_VERSION,
      modelScopeConfirmed: true,
      scopeVersion: MODEL_SCOPE_VERSION,
    });
  };

  const continueInfo = () => {
    if (activeIndex >= screens.length - 1) router.push(nextRoute(step));
    else { setDirty(true); setDraft(activeDraft); setScreenIndex(activeIndex + 1); }
  };

  const toggleMulti = (key: string, value: string, noneValue?: string) => {
    const selected = Array.isArray(activeDraft[key]) ? activeDraft[key] as string[] : [];
    let next: string[];
    if (value === noneValue) next = selected.includes(value) ? [] : [value];
    else {
      const withoutNone = noneValue ? selected.filter((item) => item !== noneValue) : selected;
      next = withoutNone.includes(value) ? withoutNone.filter((item) => item !== value) : [...withoutNone, value];
    }
    setScreenIndex(activeIndex);
    setDraft({ ...activeDraft, [key]: next });
    setDirty(true);
    setLocalError(null);
  };

  const renderChoices = () => {
    if (screen.kind !== "single" && screen.kind !== "multi") return null;
    const selected = screen.kind === "multi"
      ? (Array.isArray(activeDraft[screen.key]) ? activeDraft[screen.key] as string[] : [])
      : [String(activeDraft[screen.key] ?? "")];
    const hasThumbnails = screen.options.some((option) => option.thumbnail);
    return <div className={`choice-grid ${hasThumbnails ? "visual-choice-grid" : ""}`}>
      {screen.options.map((option) => {
        const active = selected.includes(option.value);
        return <button
          key={option.value}
          type="button"
          className={`choice ${option.thumbnail ? "visual-choice" : ""} ${active ? "selected" : ""}`}
          aria-pressed={active}
          disabled={save.isPending}
          onClick={() => {
            if (screen.kind === "single") chooseSingle(screen.key, option.value);
            else toggleMulti(screen.key, option.value, screen.noneValue);
          }}
        >
          {option.thumbnail && <span className="choice-thumbnail" style={{ backgroundImage: `url(${option.thumbnail.src})`, backgroundPosition: option.thumbnail.position, backgroundSize: option.thumbnail.size ?? "200% 200%" }} />}
          <span className="choice-copy"><strong>{option.label}</strong>{option.hint && <small>{option.hint}</small>}</span>
          <span className="choice-check" aria-hidden="true">{screen.kind === "multi" ? (active ? "✓" : "+") : "›"}</span>
        </button>;
      })}
    </div>;
  };

  return (
    <div className="quiz-shell">
      <DemoSafetyNotice compact />
      <div className="quiz-progress" aria-label={`总进度 ${progressPercent}%`}>
        <div className="quiz-progress-meta"><span>{meta.label}</span><span>{progressPercent}%</span></div>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${progressPercent}%` }} /></div>
        <div className="stage-rail" aria-label="测评阶段">
          {STEPS.map((item, index) => {
            const currentStepIndex = STEPS.indexOf(step);
            const state = index < currentStepIndex ? "done" : index === currentStepIndex ? "active" : "upcoming";
            return <span key={item} className={`stage-rail-item ${state}`} aria-current={state === "active" ? "step" : undefined}>
              <i aria-hidden="true">{state === "done" ? "✓" : index + 1}</i>{STAGE_META[item].label}
            </span>;
          })}
        </div>
      </div>

      <section className={`quiz-card ${screen.kind === "info" ? "quiz-card-info" : ""}`}>
        <div className="quiz-visual">
          <Image src={visibleImage} alt={visibleImageAlt} fill sizes="(max-width: 820px) 100vw, 42vw" priority={activeIndex === 0} />
          <div className="quiz-visual-shade" />
          <div className="quiz-stage-chip">{meta.eyebrow}</div>
        </div>

        <div className="quiz-content">
          <div className="question">
            <p className="eyebrow">{screen.kind === "info" ? "结合你的选择" : `第 ${currentProgress} 题`}</p>
            <h1>{screen.title}</h1>
            {screen.hint && <p>{screen.hint}</p>}
          </div>

          {(screen.kind === "single" || screen.kind === "multi") && renderChoices()}

          {screen.kind === "number" && <div className="metric-input-wrap">
            <label className="metric-input-label" htmlFor={`answer-${screen.key}`}>{screen.title}</label>
            <div className="metric-input">
              <input
                id={`answer-${screen.key}`}
                aria-label={screen.title}
                type="number"
                inputMode={screen.integer ? "numeric" : "decimal"}
                step={screen.integer ? "1" : "0.1"}
                min={screen.min}
                max={screen.max}
                placeholder={screen.placeholder}
                value={typeof activeDraft[screen.key] === "number" || typeof activeDraft[screen.key] === "string" ? String(activeDraft[screen.key]) : ""}
                onChange={(event) => { setScreenIndex(activeIndex); setDraft({ ...activeDraft, [screen.key]: event.target.value }); setDirty(true); setLocalError(null); }}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); continueNumber(); } }}
              />
              <span>{screen.unit}</span>
            </div>
          </div>}

          {screen.kind === "consent" && <div className="check-list consent-list">
            <label className="check-row"><input type="checkbox" checked={activeDraft.healthDataConsent === true} onChange={(event) => { setScreenIndex(activeIndex); setDraft({ ...activeDraft, healthDataConsent: event.target.checked }); setDirty(true); }} /><span><strong>演示数据处理确认</strong><br />我确认只填写虚构资料，并同意系统临时保存本次选择以生成演示报告；可随时在数据说明页删除。</span></label>
            <label className="check-row"><input type="checkbox" checked={activeDraft.modelScopeConfirmed === true} onChange={(event) => { setScreenIndex(activeIndex); setDraft({ ...activeDraft, modelScopeConfirmed: event.target.checked }); setDirty(true); }} /><span><strong>理解适用范围</strong><br />这是一般成年人自助健康情景，不适用于孕哺期、临床治疗或紧急健康决策。</span></label>
          </div>}

          {screen.kind === "info" && <div className="info-copy">
            <p>{screen.body}</p>
            {analysisSteps.length > 0 ? <div className="analysis-progress" aria-live="polite">
              <div className="analysis-progress-head">
                <span>答案整理进度</span>
                <strong>{Math.round(analysisDoneCount / analysisSteps.length * 100)}%</strong>
              </div>
              <div className="progress-track" role="progressbar" aria-label="答案摘要整理进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(analysisDoneCount / analysisSteps.length * 100)}>
                <div className="progress-fill" style={{ width: `${analysisDoneCount / analysisSteps.length * 100}%` }} />
              </div>
              <ol className="analysis-checklist">
                {analysisSteps.map((item, index) => <li className={index < analysisDoneCount ? "done" : index === analysisDoneCount ? "active" : ""} key={item}><span aria-hidden="true">{index < analysisDoneCount ? "✓" : index + 1}</span>{item}</li>)}
              </ol>
            </div> : <div className="info-points">{(screen.points ?? ["逐题保存", "按生活节律调整", "可随时删除"]).map((item) => <span key={item}>✓ {item}</span>)}</div>}
          </div>}

          {(localError || save.isError) && <p className="form-error" role="alert">{localError ?? save.error!.message}</p>}

          <div className="quiz-actions">
            <button type="button" className="quiz-back" onClick={goBack} disabled={save.isPending} aria-label="返回上一题">←</button>
            {screen.kind === "single" && <p className="auto-hint">选择后自动保存并继续</p>}
            {screen.kind === "multi" && <button type="button" className="button button-primary" onClick={continueMulti} disabled={save.isPending}>{save.isPending ? "正在保存…" : "继续"}</button>}
            {screen.kind === "number" && <button type="button" className="button button-primary" onClick={continueNumber} disabled={save.isPending}>{save.isPending ? "正在保存…" : "继续"}</button>}
            {screen.kind === "consent" && <button type="button" className="button button-primary" onClick={continueConsent} disabled={save.isPending}>{save.isPending ? "正在保存…" : "同意并继续"}</button>}
            {screen.kind === "info" && <button type="button" className="button button-primary" onClick={continueInfo} disabled={!analysisComplete}>{analysisComplete ? screen.cta : "正在整理答案…"}</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
