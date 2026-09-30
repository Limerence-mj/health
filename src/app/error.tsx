"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="shell narrow status-page">
      <div className="panel">
        <p className="eyebrow">暂时无法显示</p>
        <h1>这一页刚刚遇到了一点问题</h1>
        <p>你的演示进度仍保存在当前匿名会话中。可以重试，或先返回首页。</p>
        <div className="form-actions">
          <Link className="button button-secondary" href="/">返回首页</Link>
          <button className="button button-primary" type="button" onClick={() => retry()}>重新加载</button>
        </div>
      </div>
    </div>
  );
}
