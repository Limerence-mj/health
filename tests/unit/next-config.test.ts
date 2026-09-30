import { describe, expect, it } from "vitest";
import nextConfig, { buildContentSecurityPolicy } from "../../next.config";

describe("Next.js 运行配置", () => {
  it("开发模式允许 React 调试能力，但生产模式不放宽 eval", () => {
    expect(buildContentSecurityPolicy(true)).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy(false)).not.toContain("'unsafe-eval'");
  });

  it("允许通过项目约定的开发主机访问开发资源", () => {
    expect(nextConfig.allowedDevOrigins).toContain("127.0.0.1");
  });
});
