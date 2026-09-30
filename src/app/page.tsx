"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, jsonRequest } from "@/lib/api";

type Session = { nextRoute: string | null; currentAssessmentId: string | null; subscription: { effectiveStatus: string } };

export default function HomePage() {
  const router = useRouter();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<Session>("/api/v1/session"),
  });
  const start = useMutation({
    mutationFn: () => api<Session>("/api/v1/sessions", jsonRequest("POST", {})),
    onSuccess: (data) => router.push(data.nextRoute ?? "/assessment/profile"),
  });
  const hasSession = session.isSuccess && session.data.currentAssessmentId;
  const nextRoute = session.data?.nextRoute ?? "/assessment/profile";

  return (
    <section className="hero">
      <div>
        <p className="eyebrow">从了解自己开始</p>
        <h1>把计划融入日常生活。</h1>
        <p className="hero-copy">了解你的目标、活动习惯、作息与饮食节律，获得更适合当前生活方式的行动建议。</p>
        <div className="hero-proof" aria-label="测评特点">
          <span><strong>轻松完成</strong> 一次专注一个问题</span>
          <span><strong>随时继续</strong> 进度自动保留</span>
          <span><strong>贴近日常</strong> 建议结合你的选择</span>
        </div>
        <div className="hero-actions">
          {hasSession ? (
            <Link className="button button-primary" href={nextRoute}>继续我的测评 <span aria-hidden="true">→</span></Link>
          ) : (
            <button type="button" className="button button-primary" disabled={start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? "正在创建…" : "开始免费测评"} <span aria-hidden="true">→</span>
            </button>
          )}
          <Link className="button button-secondary" href="/demo">先看完整示例</Link>
        </div>
        {start.isError && <p className="form-error" role="alert">{start.error.message}</p>}
        <p className="fine-print">匿名使用 · 无需手机号 · 可随时删除全部数据 · 不构成医疗建议</p>
      </div>
      <div className="hero-art hero-photo">
        <Image src="/images/wellness/hero-pilates-v2.png" alt="在阳光充足的家中进行温和 Pilates 拉伸" fill priority sizes="(max-width: 760px) 100vw, 46vw" />
        <div className="hero-photo-shade" />
        <div className="mini-card one">✓ 从你的日常习惯出发</div>
        <div className="mini-card two">按自己的节奏填写</div>
      </div>
    </section>
  );
}
