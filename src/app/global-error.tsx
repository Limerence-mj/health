"use client";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, color: "#2e2724", background: "#f8f3ea", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ width: "min(560px, calc(100% - 32px))", margin: "12vh auto", padding: 28, borderRadius: 22, background: "#fffdf9" }}>
          <title>页面暂时不可用 · WellPath</title>
          <p style={{ color: "#8b4b3f", fontWeight: 800 }}>WELLPATH 演示</p>
          <h1>页面暂时无法加载</h1>
          <p style={{ color: "#746b66" }}>请稍后重试。本演示不会因此发起支付或提交真实订单。</p>
          <button type="button" onClick={() => retry()} style={{ minHeight: 48, padding: "0 22px", border: 0, borderRadius: 14, color: "white", background: "#3f2d29", fontWeight: 700, cursor: "pointer" }}>重新加载</button>
        </main>
      </body>
    </html>
  );
}
