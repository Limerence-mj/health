import { expect, test, type Page } from "@playwright/test";

async function expectQuestion(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function choose(page: Page, option: string | RegExp, nextTitle: string) {
  await page.getByRole("button", { name: option }).click();
  await expectQuestion(page, nextTitle);
}

async function continueInfo(page: Page, button: string | RegExp, nextTitle: string) {
  await page.getByRole("button", { name: button }).click();
  await expectQuestion(page, nextTitle);
}

async function chooseMany(page: Page, options: Array<string | RegExp>, nextTitle: string) {
  for (const option of options) await page.getByRole("button", { name: option }).click();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expectQuestion(page, nextTitle);
}

async function fillNumber(page: Page, label: string, value: string, nextTitle: string) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expectQuestion(page, nextTitle);
}

async function startAssessment(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/34 个个性化问题|回答组成画像|真实目标范围/)).toHaveCount(0);
  await page.getByRole("button", { name: /开始免费测评/ }).click();
  await expect(page).toHaveURL(/\/assessment\/profile$/);
  await expectQuestion(page, "开始前确认数据使用范围");
}

async function fillCompleteAssessment(page: Page) {
  await startAssessment(page);

  const consentChecks = page.getByRole("checkbox");
  await consentChecks.nth(0).check();
  await consentChecks.nth(1).check();
  await page.getByRole("button", { name: "同意并继续" }).click();
  await expectQuestion(page, "选择你的年龄阶段");
  await choose(page, /30–39 岁/, "你练过 Pilates 吗？");
  await choose(page, /还没有/, "在家也能建立稳定节奏");
  await continueInfo(page, /继续了解我的目标/, "你当前最想实现什么？");
  await choose(page, /减轻体重/, "除此之外，你还希望获得什么？");

  // 刷新后应从服务端已保存的首个未答问题继续，而不是回到开头。
  await page.reload();
  await expectQuestion(page, "除此之外，你还希望获得什么？");
  await chooseMany(page, [/改善体态/, /提升柔韧性/], "你会怎样描述现在的体型？");
  await choose(page, /中等体型/, "你更向往哪种身体状态？");
  await choose(page, /紧实有力量/, "你的体重通常怎样变化？");
  await choose(page, /增加和下降都比较容易/, "上一次感觉状态很好是什么时候？");
  await choose(page, /1–2 年前/, "你的方向更清晰了");
  await continueInfo(page, /继续评估活动能力/, "你怎样评价自己的柔韧性？");

  await expect(page).toHaveURL(/\/assessment\/activity$/);
  await choose(page, /刚刚开始/, "你目前多久运动一次？");
  await choose(page, /每周几次/, "你最想重点训练哪些部位？");
  await chooseMany(page, [/核心/, /背部/], "你的重点会进入每周安排");
  await continueInfo(page, /继续评估活动能力/, "爬楼时，你通常会有多喘？");
  await choose(page, /有点喘，仍能说话/, "训练时需要留意哪些部位？");
  await chooseMany(page, [/没有以上情况/], "你多久会专门散步或快走？");
  await choose(page, /每周 3–4 次/, "你用过小型健身器材吗？");
  await choose(page, /从没用过/, "对于器材，你最大的顾虑是什么？");
  await choose(page, /手边没有器材/, "训练会从低门槛版本开始");
  await continueInfo(page, /继续了解生活节律/, "你的工作或日常作息是哪一种？");

  await expect(page).toHaveURL(/\/assessment\/lifestyle$/);
  await choose(page, /规律白班/, "你的大多数白天是怎样度过的？");
  await choose(page, /会主动起身活动/, "白天的精力通常怎样？");
  await choose(page, /整体比较稳定/, "你每天大约喝多少水？");
  await choose(page, /2–6 杯/, "你通常能睡多久？");
  await choose(page, /7–8 小时/, "近几年哪些变化影响过你的体重？");
  await chooseMany(page, [/没有明显事件/], "计划会配合你的日常");
  await continueInfo(page, /继续看看饮食节律/, "你通常什么时候吃早餐？");

  await expect(page).toHaveURL(/\/assessment\/nutrition$/);
  await choose(page, /6–8 点/, "午餐通常在什么时候？");
  await choose(page, /12–14 点/, "晚餐通常在什么时候？");
  await choose(page, /18–20 点/, "哪种饮食方式最接近你？");
  await choose(page, /均衡家常/, "哪些饮食习惯经常出现？");
  await chooseMany(page, [/没有以上情况/], "饮食建议会围绕现有习惯微调");
  await continueInfo(page, /继续填写身体数据/, "你的身高是多少？");

  await expect(page).toHaveURL(/\/assessment\/metrics$/);
  await fillNumber(page, "你的身高是多少？", "165", "你现在的体重是多少？");
  await fillNumber(page, "你现在的体重是多少？", "100", "你希望达到多少体重？");
  await fillNumber(page, "你希望达到多少体重？", "60", "你的准确年龄是多少？");
  await page.getByLabel("你的准确年龄是多少？", { exact: true }).fill("32.5");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator(".form-error")).toContainText("请输入有效的整数年龄");
  await fillNumber(page, "你的准确年龄是多少？", "32", "用于能量公式的生理性别");
  await choose(page, /女性/, "接下来有想为之准备的重要时刻吗？");
  await choose(page, /暂时没有/, "正在准备你的答案摘要");
  await expect(page.getByText("准备提交前答案摘要")).toBeVisible();
  await continueInfo(page, /查看并确认答案/, "准备生成你的行动建议");

  await expect(page).toHaveURL(/\/assessment\/review$/);
  await expect(page.getByText("100 → 60 kg")).toBeVisible();
  await page.getByRole("button", { name: /生成我的行动建议/ }).click();
  await expect(page).toHaveURL(/\/results\/[0-9a-f-]+$/);
}

test("34 项五阶段测评、刷新恢复、宽范围体重与模拟解锁形成完整闭环", async ({ page }) => {
  await fillCompleteAssessment(page);
  await expect(page.getByRole("heading", { name: "你的基础结果已就绪" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "你的生活方式概览" })).toBeVisible();
  await expect(page.getByText("解锁训练、恢复与饮食行动")).toBeVisible();
  const previewPayload = await page.evaluate(async () => {
    const assessmentId = location.pathname.split("/").at(-1);
    return (await fetch(`/api/v1/assessments/${assessmentId}/result`)).json();
  });
  expect(previewPayload.data).not.toHaveProperty("nutrition");
  expect(previewPayload.data).not.toHaveProperty("prediction");
  expect(previewPayload.data).not.toHaveProperty("personalPlan");
  expect(previewPayload.data.planPreview).toMatchObject({ durationLabel: "28 天", cadenceLabel: "每周 4 次主训练" });
  await page.getByRole("button", { name: "模拟解锁完整报告" }).click();
  await expect(page.getByRole("dialog")).toContainText("不会扣款");
  const cancelPayment = page.getByRole("button", { name: "取消" });
  await expect(cancelPayment).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "确认模拟成功" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "模拟解锁完整报告" })).toBeFocused();
  await page.getByRole("button", { name: "模拟解锁完整报告" }).click();
  await page.getByRole("button", { name: "确认模拟成功" }).click();
  await expect(page.getByRole("heading", { name: "完整报告已解锁" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "28 天分为三个阶段" })).toBeVisible();
  await expect(page.getByText("第一周节奏样例")).toBeVisible();
  await expect(page.locator(".schedule-item")).toHaveCount(7);
  await expect(page.getByText("每日能量情景")).toBeVisible();
  await expect(page.getByText("阶段变化时间线")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "完整报告已解锁" })).toBeVisible();
});

test("公开合成示例可切换预览/完整视图且不覆盖个人 Cookie", async ({ page, context }) => {
  await startAssessment(page);
  const before = (await context.cookies()).find((cookie) => cookie.name === "health_session")?.value;
  expect(before).toBeTruthy();
  await page.goto("/demo");
  await expect(page.getByText(/示例内容仅用于了解报告结构/)).toBeVisible();
  await expect(page.getByText("每日能量情景")).toBeVisible();
  await page.getByRole("button", { name: "基础结果" }).click();
  await expect(page.getByText("解锁训练、恢复与饮食行动")).toBeVisible();
  const after = (await context.cookies()).find((cookie) => cookie.name === "health_session")?.value;
  expect(after).toBe(before);
});

test("删除入口清除本人数据和浏览器会话", async ({ page, context }) => {
  await startAssessment(page);
  await page.goto("/privacy");
  await page.getByLabel("确认文字").fill("删除");
  await page.getByRole("button", { name: "永久删除我的数据" }).click();
  await expect(page).toHaveURL(/\/?deleted=1$/);
  await expect.poll(async () => (await context.cookies()).some((cookie) => cookie.name === "health_session")).toBe(false);
  const status = await page.evaluate(async () => (await fetch("/api/v1/session")).status);
  expect(status).toBe(401);
});

test("公开示例拒绝客户端传入资源定位参数", async ({ request }) => {
  const response = await request.get("/api/v1/demo/paid?assessmentId=00000000-0000-4000-8000-000000000020");
  expect(response.status()).toBe(422);
  await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
});

test("直接进入未开放的后续步骤会回到服务端 nextStep", async ({ page }) => {
  await startAssessment(page);
  await page.goto("/assessment/metrics");
  await expect(page).toHaveURL(/\/assessment\/profile$/);
  await expectQuestion(page, "开始前确认数据使用范围");
});

test("安全响应头和自托管中文字体在真实页面生效", async ({ page, request }) => {
  const response = await request.get("/");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  await page.goto("/");
  await expect.poll(() => page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Noto Sans SC Variable"', "健康测评");
  })).toBe(true);
});

test("新无痕上下文不能读取另一个匿名用户的报告", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "完整授权边界已由桌面端覆盖，移动端保留主闭环验证");
  await fillCompleteAssessment(page);
  const reportUrl = page.url();
  const isolated = await browser.newContext();
  const strangerPage = await isolated.newPage();
  await strangerPage.goto(reportUrl);
  await expect(strangerPage.getByText("需要有效会话")).toBeVisible();
  await isolated.close();
});

test("模拟支付响应丢失后通过读取权益恢复，不创建第二次激活", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "支付恢复分支已由桌面端覆盖，移动端保留主闭环验证");
  await fillCompleteAssessment(page);
  await page.route("**/pay", async (route) => {
    await route.fetch();
    await route.abort("failed");
  }, { times: 1 });
  await page.getByRole("button", { name: "模拟解锁完整报告" }).click();
  await page.getByRole("button", { name: "确认模拟成功" }).click();
  await expect(page.getByRole("heading", { name: "完整报告已解锁" })).toBeVisible();
});
