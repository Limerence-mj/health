# WellPath 健康测评系统

这是一个依据两天全栈挑战实现的可运行产品原型：匿名访客使用虚构资料完成 5 个主题阶段、34 项问题/确认项和阶段反馈，查看基础画像与 28 天方案轮廓，并可通过明确标注的演示解锁查看 7 天训练节奏、三阶段路线、恢复与饮食行动、能量和体重变化情景。项目同时提供固定合成数据演示、逐题恢复、幂等写入、乐观锁、主动删除和过期数据自动清理闭环。

> 只应填写虚构资料。所有计算仅用于产品演示，不构成医疗、营养或运动建议；演示解锁没有金额、订单、支付渠道或真实扣款。

## 技术栈

- Next.js 16、React 19、TypeScript、React Query、React Hook Form、Recharts
- PostgreSQL 16、Prisma 6、Zod
- Vitest、Playwright、Docker Compose

当前产品基线与整改取舍见 [竞品对标整改方案-v3.md](docs/竞品对标整改方案-v3.md)，v2.0 历史基线见 [竞品对标整改方案-v2.md](docs/竞品对标整改方案-v2.md)，v1.1 架构与安全设计历史稿见 [健康测评系统-全栈设计方案.md](docs/健康测评系统-全栈设计方案.md)。HTTP 契约见 [openapi.yaml](openapi.yaml)。

## 本地启动

前提：Node.js 20.9+、npm、Docker。

```shell
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

开发服务器固定使用 `http://127.0.0.1:3100`，并与 `.env.example` 的 `APP_ORIGIN` 保持一致。请使用相同地址访问，写请求会严格校验 Origin。

公开演示需要在非生产环境显式设置：

```dotenv
APP_ENV="demo"
MOCK_PAYMENTS_ENABLED="true"
DEMO_MODE="true"
DEMO_PAID_SESSION_ID="00000000-0000-4000-8000-000000000010"
DEMO_PAID_ASSESSMENT_ID="00000000-0000-4000-8000-000000000020"
CRON_SECRET="至少 32 位随机字符串"
SESSION_CREATION_LIMIT_PER_MINUTE="60"
```

部署平台的 `NODE_ENV=production` 与应用的 `APP_ENV=demo` 并不冲突。只有把 `APP_ENV` 明确设为 `production` 时，配置校验才会拒绝演示解锁和公开 Demo。公开演示会话 1 天有效，普通访客数据在最后一次写入后最多保留 7 天；`vercel.json` 配置的每日任务会调用受 `CRON_SECRET` 保护的清理接口。

完整的 Vercel + Neon 配置、迁移、seed、验收和回滚清单见 [演示环境上线准备清单](docs/演示环境上线准备清单.md)。本仓库只做到可部署状态，不伪造或执行公网发布。

## 页面与主流程

- `/`：开始或继续匿名演示测评，并前置提醒只填写虚构资料
- `/assessment/profile|activity|lifestyle|nutrition|metrics`：五个主题阶段逐题保存
- `/assessment/review`：确认并生成不可变结果快照
- `/results/:id`：免费方案轮廓或完整 28 天训练、恢复、饮食与能量报告
- `/demo`：固定合成数据的预览/完整视图对比，不覆盖个人 Cookie
- `/privacy`：数据用途、限制及二次确认删除
- `POST /pay`：题目要求的根路径演示解锁接口；只验证权限闭环，不具备支付能力
- `GET /api/maintenance/purge`：受 `CRON_SECRET` 保护的到期数据清理入口

首次会话令牌只写入 `HttpOnly` Cookie，不在响应体或日志中返回。也可使用同一令牌的 Bearer 形式进行 API 调试，但 Cookie 与 Bearer 同时存在且不同会被拒绝。

## curl 验证

创建会话并保留 Cookie：

```shell
curl -i -c /tmp/health-cookie.txt \
  -X POST 'http://127.0.0.1:3100/api/v1/sessions' \
  -H 'Origin: http://127.0.0.1:3100' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

随后按 OpenAPI 契约依次保存五个主题阶段并提交。每次可只保存当前题的增量字段；所有可重放写请求都需要新的 UUID `Idempotency-Key`，并携带服务端最新 `revision`。演示解锁示例：

```shell
curl -i -b /tmp/health-cookie.txt -c /tmp/health-cookie.txt \
  -X POST 'http://127.0.0.1:3100/pay' \
  -H 'Origin: http://127.0.0.1:3100' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: <request-uuid>' \
  -d '{"assessmentId":"<assessment-id>","eventId":"<event-uuid>","planCode":"DEMO_30D"}'
```

使用相同请求键和请求体会返回原业务回执；换请求键但复用相同 `eventId` 只回放已处理事件，不新增事件、不延长期限。相同键或事件搭配不同请求内容返回 `409`。

固定合成报告：

```shell
curl 'http://127.0.0.1:3100/api/v1/demo/paid?view=full'
```

## 数据库与一致性

迁移创建八张业务表：`users`、`sessions`、`assessments`、`assessment_results`、`subscriptions`、`payment_events`、`idempotency_records`、`rate_limit_buckets`。关键保护包括：

- 同一用户至多一个草稿；结果、支付事件和请求回执均有唯一约束。
- 复合外键保证支付事件中的测评、权益与用户归属一致。
- 写事务先锁用户行，设置锁等待/语句超时，再执行幂等、revision 和状态检查。
- 提交原子写入结果、完成状态和回执；支付原子写入事件、权益、会话期限、保留期和回执。
- 未确认健康数据处理授权和模型适用范围前，后端拒绝保存任何问卷答案；授权版本升级后必须重新确认。
- 新建匿名会话使用 PostgreSQL 共享容量桶限制全局写入速率，并返回 `429` 与 `Retry-After`；公网仍应叠加可信代理或平台侧的按客户端限流。
- 报告每次读取当前权益；免费 Presenter 只序列化 `planPreview`，不会返回完整 `personalPlan`、能量或预测字段。
- 提交时把完整行动方案写入结果快照；历史报告从 `inputSnapshot` 和 `personal_plan` 读取，不因后续构建器升级而静默变化。

请勿让测试库复用演示或生产数据库。测试库迁移示例：

```shell
createdb <test-database>
DATABASE_URL='<test-url>' DIRECT_URL='<test-url>' npm run db:migrate
```

## 验证

```shell
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
```

`npm test` 串行执行单元测试、真实 PostgreSQL 集成测试，以及由生产构建启动的 Playwright 验收；缺少数据库或浏览器时明确失败，不会静默跳过。`npm run verify` 在此基础上再执行 lint、类型检查和最终生产构建。E2E 默认使用 3100 端口，以避开常见开发端口；首次运行需安装 Chromium：

```shell
npx playwright install chromium
```

若受控环境已有浏览器缓存，可显式设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`。不要把个人机器的绝对路径提交为默认配置。

## 保留与删除

主动删除通过 `/privacy` 发起，服务端只依据当前凭证确定用户，不接受客户端 `userId`。业务关联数据在同一事务中删除，之后旧 Cookie 失效。

自动清理脚本默认只报告候选数量，不删除数据：

```shell
npm run data:purge
npm run data:purge -- --execute
```

执行模式会逐个锁定用户并重新检查 `purge_after`，排除固定 demo 用户，避免和正在进行的支付/续期竞争。建议由受控调度器运行，并先保留 dry-run 监控证据。

公开 Demo 的合成会话和权益 seed 有明确期限。演示环境应至少每 30 天由受控调度器执行一次 `npm run demo:refresh`；`/api/ready` 会在固定 Demo 缺失或过期时返回 503，避免过期后仍报告服务就绪。普通访客数据则由每日 `/api/maintenance/purge` 调度清理，任务重复触发也不会删除固定 Demo 用户。

## 已知边界

- 数字输入范围为年龄 18–80 岁、身高 90–242 cm、当前/目标体重 25–300 kg；目标方向不一致、BMI 极端或变化幅度较大时保留真实输入并返回风险提示。
- 0.25 kg/周只用于固定展示情景；长期目标保留稀疏曲线并提示分阶段复评，不构成速度或日期承诺。
- 能量估算超出 1000–5000 kcal/天的通用演示窗口时不再阻断合法成年人完成测评，但会显示明确警示，数值不能直接作为摄入处方。
- 当前只有演示解锁；没有真实金额、收款、订单、支付渠道、第三方签名或退款能力。
- `APP_ENV=production` 禁止模拟支付和公开 Demo；未接入真实支付时，页面会明确显示当前环境未开放解锁，不再跳转到失效入口。
- 项目自托管 OFL-1.1 授权的 `Noto Sans SC Variable`，不依赖访问第三方字体服务。
- 公网部署仍需验证可信代理下的按客户端限流、监控告警和真实数据库权限拆分。本仓库没有伪造已部署状态。
- 当前 Prisma CLI 传递依赖命中上游安全公告；自动审计修复会降级 Prisma，交付前应跟踪上游兼容修复，不使用 `npm audit fix --force` 盲目改写锁文件。

## 健康检查

- `GET /api/health`：进程存活与版本
- `GET /api/ready`：数据库连通性；失败返回 503

日志只记录请求失败事件、请求 ID 和错误码，不记录 Cookie、Bearer token、健康输入、数据库连接串或完整报告。
