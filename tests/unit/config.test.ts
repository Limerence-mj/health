import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env, resetEnvForTests } from "@/server/config";

const original = { ...process.env };

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
  process.env.DIRECT_URL = "postgresql://user:pass@localhost:5432/app";
  process.env.APP_ENV = "local";
  process.env.MOCK_PAYMENTS_ENABLED = "false";
  process.env.DEMO_MODE = "false";
  process.env.APP_ORIGIN = "https://example.com/";
  resetEnvForTests();
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
  resetEnvForTests();
});

describe("运行环境配置", () => {
  it("把带尾斜杠的 APP_ORIGIN 规范化为浏览器 Origin", () => {
    expect(env().APP_ORIGIN).toBe("https://example.com");
  });

  it("拒绝带路径、查询或凭证的 APP_ORIGIN", () => {
    for (const value of ["https://example.com/app", "https://example.com/?x=1", "https://user@example.com/"]) {
      process.env.APP_ORIGIN = value;
      resetEnvForTests();
      expect(() => env()).toThrow();
    }
  });
});
