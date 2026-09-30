export function DemoSafetyNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`demo-safety-notice ${compact ? "compact" : ""}`} aria-label="演示环境说明">
      <strong>产品交互演示</strong>
      <span>请使用虚构信息体验流程，不要填写真实健康资料；页面内容不构成医疗建议。</span>
    </aside>
  );
}
