"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { ReportContent, type Report } from "@/components/report/ReportView";

export function DemoView() {
  const [view, setView] = useState<"preview" | "full">("full");
  const report = useQuery({ queryKey: ["demo-report", view], queryFn: () => api<Report>(`/api/v1/demo/paid?view=${view}`) });
  return <div className="shell">
    <div className="demo-banner">固定合成数据 · 不代表真实人物 · 不会读取或覆盖你的测评进度</div>
    <div className="page-intro"><p className="eyebrow">报告示例</p><h1>预览报告内容</h1><p>切换查看基础结果和完整行动建议。</p><div className="tabs"><button type="button" aria-pressed={view === "preview"} className={`tab ${view === "preview" ? "active" : ""}`} onClick={() => setView("preview")}>基础结果</button><button type="button" aria-pressed={view === "full"} className={`tab ${view === "full" ? "active" : ""}`} onClick={() => setView("full")}>完整报告</button></div></div>
    {report.isError && <div className="panel"><p className="form-error">{report.error.message}</p></div>}
    {report.isPending && <div className="loading">正在加载合成示例…</div>}
    {report.data && <ReportContent report={report.data} />}
    <div className="form-actions"><Link className="button button-secondary" href="/">← 返回首页</Link>{report.data?.demoSessionExpiresAt && <span className="fine-print">合成示例有效至 {new Date(report.data.demoSessionExpiresAt).toLocaleDateString("zh-CN")}</span>}</div>
  </div>;
}
