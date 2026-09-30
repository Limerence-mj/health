import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell narrow status-page">
      <div className="panel">
        <p className="eyebrow">404</p>
        <h1>这里没有演示页面</h1>
        <p>链接可能已失效。你可以返回首页开始体验，或直接查看固定合成报告。</p>
        <div className="form-actions">
          <Link className="button button-secondary" href="/demo">查看报告示例</Link>
          <Link className="button button-primary" href="/">返回首页</Link>
        </div>
      </div>
    </div>
  );
}
