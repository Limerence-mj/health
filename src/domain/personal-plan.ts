import type { QuestionnaireAnswers, StageAnswers } from "@/contracts/questionnaire";

export type PlanPreview = {
  title: string;
  durationLabel: string;
  cadenceLabel: string;
  sessionLabel: string;
  equipmentLabel: string;
  highlights: string[];
};

export type PersonalPlan = {
  title: string;
  subtitle: string;
  durationDays: number;
  cadence: {
    workoutsPerWeek: number;
    sessionMinutes: string;
    walkDays: number;
    equipment: string;
    scheduleHint: string;
  };
  weeklySchedule: Array<{
    day: string;
    type: "TRAIN" | "WALK" | "RECOVER";
    title: string;
    duration: string;
    detail: string;
  }>;
  phases: Array<{ period: string; title: string; detail: string }>;
  trainingPrinciples: string[];
  recoveryActions: string[];
  nutritionRhythm: {
    pattern: string;
    mealTiming: string;
    actions: string[];
  };
  personalization: string[];
  safetyNotice: string;
};

type PlanInput = {
  goal: string | null;
  age: number | null;
  activityLevel: string | null;
  questionnaireAnswers: QuestionnaireAnswers;
};

const zoneLabels: Record<string, string> = {
  CORE: "核心稳定",
  LEGS: "腿部力量",
  GLUTES: "臀部激活",
  CHEST: "胸肩体态",
  ARMS: "手臂控制",
  BACK: "背部稳定",
};

const dietLabels: Record<string, string> = {
  TRADITIONAL: "均衡家常",
  MEDITERRANEAN: "地中海式",
  KETO: "低碳或 Keto",
  PALEO: "少加工或 Paleo",
  VEGETARIAN: "蛋奶素",
  VEGAN: "纯植物",
  PESCATARIAN: "鱼素",
  LACTOSE_FREE: "无乳糖",
  GLUTEN_FREE: "无麸质",
};

const mealLabels: Record<string, string> = {
  SIX_EIGHT: "6–8 点",
  EIGHT_TEN: "8–10 点",
  TEN_NOON: "10–12 点",
  NOON_TWO: "12–14 点",
  TWO_FOUR: "14–16 点",
  FOUR_SIX: "16–18 点",
  SIX_EIGHT_DINNER: "18–20 点",
  EIGHT_TEN_DINNER: "20–22 点",
  SKIP: "通常跳过",
};

function stage(answers: QuestionnaireAnswers, key: keyof QuestionnaireAnswers): StageAnswers {
  return answers[key] ?? {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function goalCopy(goal: string | null): { title: string; objective: string } {
  if (goal === "GAIN_WEIGHT") return { title: "28 天力量与稳定计划", objective: "以动作质量、力量和规律进食为主要方向" };
  if (goal === "MAINTAIN") return { title: "28 天体态与活力计划", objective: "以体态、稳定性和可持续节奏为主要方向" };
  return { title: "28 天轻盈与塑形计划", objective: "以稳定活动、全身塑形和长期节奏为主要方向" };
}

function workoutCadence(activity: StageAnswers): number {
  const frequency = text(activity.exerciseFrequency);
  let count = frequency === "ALMOST_DAILY" ? 5 : frequency === "SEVERAL_WEEKLY" ? 4 : 3;
  if (["LIMITED"].includes(text(activity.flexibility) ?? "") || ["VERY_BREATHLESS", "ONE_FLIGHT"].includes(text(activity.stairsBreath) ?? "")) {
    count = Math.min(count, 3);
  }
  return count;
}

function walkingCadence(activity: StageAnswers): number {
  const frequency = text(activity.walkingFrequency);
  if (frequency === "ALMOST_DAILY") return 5;
  if (frequency === "THREE_FOUR_WEEKLY") return 4;
  if (frequency === "ONE_TWO_WEEKLY") return 2;
  return 1;
}

function sessionLength(profile: StageAnswers, activity: StageAnswers, lifestyle: StageAnswers): string {
  const sensitivities = list(activity.sensitivities).filter((item) => item !== "NONE");
  if (sensitivities.length > 0 || ["UNDER_FIVE", "FIVE_SIX"].includes(text(lifestyle.sleepDuration) ?? "")) return "10–15 分钟";
  return text(profile.pilatesExperience) === "YES" ? "20–25 分钟" : "12–20 分钟";
}

function equipmentCopy(activity: StageAnswers): string {
  const barrier = text(activity.equipmentBarrier);
  if (["NO_EQUIPMENT", "PRICE", "BODYWEIGHT"].includes(barrier ?? "") || text(activity.equipmentExperience) === "NEVER") return "瑜伽垫或徒手";
  if (text(activity.equipmentExperience) === "LOVED") return "徒手为主，可选小器材";
  return "徒手开始，不依赖器材";
}

function scheduleCopy(lifestyle: StageAnswers): string {
  const schedule = text(lifestyle.workSchedule);
  const energy = text(lifestyle.energyLevel);
  if (schedule === "NIGHT") return "围绕清醒时段安排，避免下班后强行完成高强度训练";
  if (schedule === "FLEXIBLE" || schedule === "NOT_WORKING") return "固定一个最容易重复的时段，允许前后浮动 2 小时";
  if (energy === "AFTERNOON_SLUMP") return "优先安排在上午或午后低谷前，疲惫时改为短课";
  if (energy === "BEFORE_MEALS") return "避开明显饥饿时段，训练前先确认体感与补水";
  return "优先固定在下班前后或晚餐前的可重复时段";
}

function mealLabel(value: string | null, dinner = false): string {
  if (dinner && value === "SIX_EIGHT") return "18–20 点";
  if (dinner && value === "EIGHT_TEN") return "20–22 点";
  return value ? mealLabels[value] ?? value : "未设置";
}

function nutritionActions(nutrition: StageAnswers, lifestyle: StageAnswers): string[] {
  const habits = list(nutrition.eatingHabits);
  const actions: string[] = [];
  if (text(nutrition.breakfastTime) === "SKIP") actions.push("不强制增加早餐；先观察跳过早餐后午间饥饿和精力是否明显波动。");
  if (habits.includes("LATE_NIGHT")) actions.push("为深夜进食预先准备小份、易控制的选择，并记录触发它的作息或情绪。");
  if (habits.includes("SWEET")) actions.push("保留计划内甜食，用正餐中的蛋白质与高纤维食物减少随机加餐。");
  if (habits.includes("SODA")) actions.push("先替换每天一份含糖饮料，不要求一次性全部取消。");
  if (habits.includes("SALTY")) actions.push("优先减少高加工高盐零食，并结合日常饮水观察口渴信号。");
  if (actions.length === 0) actions.push("维持现有三餐节律，每餐优先包含蛋白质、蔬果和可持续的主食份量。");
  if (["COFFEE_TEA", "TWO_GLASSES"].includes(text(lifestyle.waterIntake) ?? "")) actions.push("把第一杯水绑定在起床或第一餐，逐步增加，不用一次追求固定大容量。");
  else actions.push("继续按口渴和活动量补水，训练前后各安排一次饮水提醒。");
  return actions.slice(0, 4);
}

function recoveryActions(activity: StageAnswers, lifestyle: StageAnswers): string[] {
  const sensitivities = list(activity.sensitivities).filter((item) => item !== "NONE");
  const actions: string[] = [];
  if (sensitivities.includes("BACK")) actions.push("腰背敏感：优先中立位、呼吸和核心控制，出现疼痛时停止动作。");
  if (sensitivities.includes("KNEES")) actions.push("膝盖敏感：减少深屈膝和冲击，使用支撑并保持无痛范围。");
  if (sensitivities.includes("WRISTS")) actions.push("手腕敏感：用前臂支撑或站姿替代长时间掌撑。");
  if (sensitivities.length === 0) actions.push("目前未报告重点敏感部位，仍以动作稳定和无痛范围作为进阶前提。");
  if (["UNDER_FIVE", "FIVE_SIX"].includes(text(lifestyle.sleepDuration) ?? "")) actions.push("睡眠偏短的当天不追加强度，优先完成 10 分钟恢复课或散步。");
  else actions.push("把稳定睡眠作为训练恢复的一部分，连续疲惫时主动降低一档难度。");
  return actions;
}

function personalizationNotes(profile: StageAnswers, activity: StageAnswers, lifestyle: StageAnswers, metrics: StageAnswers, age: number | null): string[] {
  const notes: string[] = [];
  const dream = text(profile.dreamBody);
  const body = text(profile.bodyBuild);
  if (dream || body) notes.push(`身体状态按“${body ?? "当前起点"} → ${dream ?? "均衡状态"}”理解，只调整训练表达，不评价体型好坏。`);
  const tendency = text(profile.weightTendency);
  if (tendency === "GAIN_FAST") notes.push("你反馈体重较易增加，因此计划强调可重复的活动与饮食节律，而不是短期激进限制。");
  else if (tendency === "GAIN_HARD") notes.push("你反馈体重或肌肉较难增加，因此计划强调规律力量刺激与稳定进食。");
  else notes.push("你反馈体重双向变化都较明显，建议每两周复盘一次趋势，避免按单日波动调整计划。");
  const best = text(profile.bestShapeTiming);
  if (best === "NEVER") notes.push("不拿过去状态作比较，以第 1 周的舒适度和完成率作为个人基线。");
  else if (best) notes.push("过去的良好状态只作为动机线索，本计划从当前活动能力重新起步。");
  const events = list(lifestyle.weightGainEvents).filter((item) => item !== "NONE");
  if (events.length > 0) notes.push("生活变化可能影响执行，忙碌或压力较高的周次允许使用短课版本，不把中断视为失败。");
  const event = text(metrics.importantEvent);
  if (event && event !== "NONE") notes.push("重要时刻用于安排复盘节点，不用于压缩节奏或承诺结果日期。");
  if ((age ?? 0) >= 50 || text(profile.ageRange) === "50_PLUS") notes.push("进阶以恢复充分和动作质量为先，每次只增加时长、次数或难度中的一项。");
  if (text(activity.flexibility) === "UNSURE") notes.push("第 1 周把动作范围当作观察项，先找到稳定、可呼吸、无痛的幅度。");
  return notes.slice(0, 6);
}

export function buildPersonalPlan(input: PlanInput): PersonalPlan {
  const profile = stage(input.questionnaireAnswers, "profile");
  const activity = stage(input.questionnaireAnswers, "activity");
  const lifestyle = stage(input.questionnaireAnswers, "lifestyle");
  const nutrition = stage(input.questionnaireAnswers, "nutrition");
  const metrics = stage(input.questionnaireAnswers, "metrics");
  const goal = goalCopy(input.goal);
  const workoutsPerWeek = workoutCadence(activity);
  const walkDays = walkingCadence(activity);
  const minutes = sessionLength(profile, activity, lifestyle);
  const equipment = equipmentCopy(activity);
  const targets = list(activity.targetZones).map((item) => zoneLabels[item] ?? item);
  const primary = targets[0] ?? "全身基础";
  const secondary = targets[1] ?? "体态与呼吸";
  const sensitivityNote = list(activity.sensitivities).some((item) => item !== "NONE") ? "全程使用无痛替代动作" : "动作稳定后再增加幅度";
  const optionalFourth = workoutsPerWeek >= 4;
  const optionalFifth = workoutsPerWeek >= 5;
  const diet = dietLabels[text(nutrition.dietPreference) ?? ""] ?? "现有饮食偏好";

  return {
    title: goal.title,
    subtitle: `${goal.objective}，并优先照顾${targets.length ? targets.slice(0, 2).join("与") : "全身基础"}。`,
    durationDays: 28,
    cadence: {
      workoutsPerWeek,
      sessionMinutes: minutes,
      walkDays,
      equipment,
      scheduleHint: scheduleCopy(lifestyle),
    },
    weeklySchedule: [
      { day: "第 1 天", type: "TRAIN", title: `${primary}基础`, duration: minutes, detail: `呼吸、控制与基础动作；${sensitivityNote}。` },
      { day: "第 2 天", type: "WALK", title: "轻松步行", duration: "15–30 分钟", detail: `按能完整说话的节奏进行；每周目标 ${walkDays} 天。` },
      { day: "第 3 天", type: "TRAIN", title: `${secondary}训练`, duration: minutes, detail: "加入活动范围与稳定练习，不用追求动作数量。" },
      { day: "第 4 天", type: "RECOVER", title: "恢复与拉伸", duration: "8–12 分钟", detail: "检查睡眠、疲劳和敏感部位，再决定下一次难度。" },
      { day: "第 5 天", type: "TRAIN", title: "全身串联", duration: minutes, detail: "把本周动作连成低冲击组合，以动作质量结束。" },
      optionalFourth
        ? { day: "第 6 天", type: "TRAIN", title: `${primary}短课`, duration: "10–15 分钟", detail: "只重复最需要的动作，不叠加高强度。" }
        : { day: "第 6 天", type: "WALK", title: "散步或日常活动", duration: "20–30 分钟", detail: "用容易完成的活动保持节奏。" },
      optionalFifth
        ? { day: "第 7 天", type: "TRAIN", title: "轻量激活", duration: "8–12 分钟", detail: "保持轻松，以结束后仍有余力为准。" }
        : { day: "第 7 天", type: "RECOVER", title: "完整休息", duration: "按需要", detail: "回顾完成率、体感与下一周最可行的训练时段。" },
    ],
    phases: [
      { period: "第 1 周", title: "找到可重复的起点", detail: `以 ${minutes} 短课建立动作基线，目标是完成而不是耗尽体力。` },
      { period: "第 2–3 周", title: "稳定增加控制", detail: `保留每周 ${workoutsPerWeek} 次节奏，每次只增加一个变量：动作次数、幅度或时长。` },
      { period: "第 4 周", title: "形成自己的模板", detail: "复盘精力、睡眠和敏感部位，把最容易坚持的 3–5 个动作留下来。" },
    ],
    trainingPrinciples: [
      `优先部位：${targets.length ? targets.join("、") : "核心、下肢与全身稳定"}。`,
      `${text(profile.pilatesExperience) === "YES" ? "已有 Pilates 经验，可在动作稳定后选择进阶版本。" : "从零基础版本开始，先理解呼吸和骨盆、脊柱控制。"}`,
      `${text(activity.equipmentExperience) === "LOVED" ? "可把熟悉的小器材作为可选增强。" : "方案不依赖购买器材，先用徒手完成。"}`,
      `${text(activity.stairsBreath) === "FEW_FLIGHTS" ? "心肺体感基础较好，但仍维持低冲击节奏。" : "用说话测试控制强度：能说完整句子再继续。"}`,
    ],
    recoveryActions: recoveryActions(activity, lifestyle),
    nutritionRhythm: {
      pattern: diet,
      mealTiming: `早餐 ${mealLabel(text(nutrition.breakfastTime))} · 午餐 ${mealLabel(text(nutrition.lunchTime))} · 晚餐 ${mealLabel(text(nutrition.dinnerTime), true)}`,
      actions: nutritionActions(nutrition, lifestyle),
    },
    personalization: personalizationNotes(profile, activity, lifestyle, metrics, input.age),
    safetyNotice: "这是根据自填信息生成的一般性行动模板，不诊断疾病。出现疼痛、胸闷、眩晕或异常气短时应停止并寻求专业评估。",
  };
}

export function toPlanPreview(plan: PersonalPlan): PlanPreview {
  return {
    title: plan.title,
    durationLabel: `${plan.durationDays} 天`,
    cadenceLabel: `每周 ${plan.cadence.workoutsPerWeek} 次主训练`,
    sessionLabel: `每次 ${plan.cadence.sessionMinutes}`,
    equipmentLabel: plan.cadence.equipment,
    highlights: ["7 天训练与恢复节奏", "三阶段循序路线", "饮食与作息行动清单", "按敏感部位提供替代原则"],
  };
}
