import { z } from "zod";

const booleanText = z.enum(["true", "false"]).transform((value) => value === "true");
const appOrigin = z.url().refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
}, "APP_ORIGIN 必须是无路径、查询、锚点和凭证的 HTTP(S) Origin").transform((value) => new URL(value).origin);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  APP_ORIGIN: appOrigin,
  APP_ENV: z.enum(["local", "test", "demo", "production"]).default("local"),
  MOCK_PAYMENTS_ENABLED: booleanText.default(false),
  DEMO_MODE: booleanText.default(false),
  DEMO_PAID_SESSION_ID: z.uuid().optional(),
  DEMO_PAID_ASSESSMENT_ID: z.uuid().optional(),
  SESSION_CREATION_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(60),
}).superRefine((value, ctx) => {
  if (value.APP_ENV === "production" && (value.MOCK_PAYMENTS_ENABLED || value.DEMO_MODE)) {
    ctx.addIssue({ code: "custom", message: "production 环境禁止开启模拟支付或公开演示" });
  }
  if (value.DEMO_MODE && (!value.DEMO_PAID_SESSION_ID || !value.DEMO_PAID_ASSESSMENT_ID)) {
    ctx.addIssue({ code: "custom", message: "公开演示需要固定 sessionId 与 assessmentId" });
  }
});

let cached: z.infer<typeof envSchema> | undefined;

export function env() {
  cached ??= envSchema.parse(process.env);
  return cached;
}

export function resetEnvForTests(): void {
  cached = undefined;
}
