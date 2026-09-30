import type { StepKey } from "@/contracts/constants";

export type ChoiceOption = {
  value: string;
  label: string;
  hint?: string;
  thumbnail?: { src: string; position: string; size?: string };
};

type ScreenBase = {
  id: string;
  title: string;
  hint?: string;
  image?: string;
  imageAlt?: string;
};

export type QuestionScreen =
  | (ScreenBase & { kind: "single"; key: string; options: ChoiceOption[] })
  | (ScreenBase & { kind: "multi"; key: string; options: ChoiceOption[]; noneValue?: string })
  | (ScreenBase & { kind: "number"; key: string; unit: string; min: number; max: number; placeholder: string; integer?: boolean })
  | (ScreenBase & { kind: "consent" })
  | (ScreenBase & { kind: "info"; body: string; cta: string; points?: string[]; analysisSteps?: string[] });

export const STAGE_META: Record<StepKey, { label: string; eyebrow: string; image: string; imageAlt: string }> = {
  profile: { label: "我的目标", eyebrow: "认识你", image: "/images/wellness/hero-pilates-v2.png", imageAlt: "在家进行 Pilates 拉伸训练" },
  activity: { label: "活动能力", eyebrow: "身体与运动", image: "/images/wellness/activity-pilates-v2.png", imageAlt: "进行入门 Pilates 臀桥训练" },
  lifestyle: { label: "生活习惯", eyebrow: "日常节律", image: "/images/wellness/lifestyle-nutrition-v2.png", imageAlt: "由饮水、饮食、睡眠和运动组成的日常习惯" },
  nutrition: { label: "饮食节律", eyebrow: "营养偏好", image: "/images/wellness/lifestyle-nutrition-v2.png", imageAlt: "均衡餐食与日常健康用品" },
  metrics: { label: "身体数据", eyebrow: "快完成了", image: "/images/wellness/result-confidence-v2.png", imageAlt: "完成温和训练后补充水分" },
};

const portrait = "/images/wellness/age-portraits-v2.png";
const activity = "/images/wellness/activity-pilates-v2.png";
const targetZones = "/images/wellness/target-zones-v2.png";
const lifestyle = "/images/wellness/lifestyle-nutrition-v2.png";
const result = "/images/wellness/result-confidence-v2.png";

export const STAGE_SCREENS: Record<StepKey, QuestionScreen[]> = {
  profile: [
    { id: "consent", kind: "consent", title: "开始前确认数据使用范围", hint: "只有同意后，系统才会把问卷答案保存到服务端并生成报告。" },
    {
      id: "age-range", kind: "single", key: "ageRange", title: "选择你的年龄阶段", hint: "先用年龄阶段调整问卷语气，准确年龄会在最后填写。", image: portrait, imageAlt: "四位不同年龄阶段的成年女性",
      options: [
        { value: "18_29", label: "18–29 岁", thumbnail: { src: portrait, position: "0% 0%" } },
        { value: "30_39", label: "30–39 岁", thumbnail: { src: portrait, position: "100% 0%" } },
        { value: "40_49", label: "40–49 岁", thumbnail: { src: portrait, position: "0% 100%" } },
        { value: "50_PLUS", label: "50 岁以上", thumbnail: { src: portrait, position: "100% 100%" } },
      ],
    },
    { id: "pilates-experience", kind: "single", key: "pilatesExperience", title: "你练过 Pilates 吗？", hint: "没有经验也完全没关系，计划会从基础动作开始。", options: [{ value: "YES", label: "练过", hint: "知道一些基础动作" }, { value: "NO", label: "还没有", hint: "希望从零开始" }] },
    { id: "intro-plan", kind: "info", title: "在家也能建立稳定节奏", body: "每次 10–20 分钟，从低门槛动作开始，再根据你的活动能力逐步增加。", cta: "继续了解我的目标", image: "/images/wellness/hero-pilates-v2.png", imageAlt: "在家进行温和 Pilates 拉伸" },
    { id: "main-goal", kind: "single", key: "goal", title: "你当前最想实现什么？", hint: "选择一个最想优先改善的方向。", options: [{ value: "LOSE_WEIGHT", label: "减轻体重", hint: "以长期可持续变化为方向" }, { value: "MAINTAIN", label: "保持体重并塑形", hint: "改善体态、力量和稳定性" }, { value: "GAIN_WEIGHT", label: "增加体重与力量", hint: "循序建立肌肉与能量储备" }] },
    { id: "secondary-goals", kind: "multi", key: "secondaryGoals", title: "除此之外，你还希望获得什么？", hint: "可多选。", noneValue: "NONE", options: [{ value: "STRENGTH", label: "增强核心力量" }, { value: "POSTURE", label: "改善体态" }, { value: "STRESS", label: "缓解压力" }, { value: "FLEXIBILITY", label: "提升柔韧性" }, { value: "NONE", label: "暂时没有其他目标" }] },
    { id: "body-build", kind: "single", key: "bodyBuild", title: "你会怎样描述现在的体型？", hint: "没有好坏之分，只用于调整建议表达。", options: [{ value: "SLIM", label: "偏纤细" }, { value: "MID", label: "中等体型" }, { value: "PLUS", label: "丰满体型" }, { value: "LARGE", label: "较大体型" }] },
    { id: "dream-body", kind: "single", key: "dreamBody", title: "你更向往哪种身体状态？", options: [{ value: "LEAN", label: "轻盈" }, { value: "TONED", label: "紧实有力量" }, { value: "CURVY", label: "保留曲线" }, { value: "BALANCED", label: "自然均衡" }] },
    { id: "weight-tendency", kind: "single", key: "weightTendency", title: "你的体重通常怎样变化？", options: [{ value: "GAIN_FAST", label: "增加较快、下降较慢" }, { value: "CHANGE_EASILY", label: "增加和下降都比较容易" }, { value: "GAIN_HARD", label: "很难增加体重或肌肉" }] },
    { id: "best-shape", kind: "single", key: "bestShapeTiming", title: "上一次感觉状态很好是什么时候？", options: [{ value: "UNDER_YEAR", label: "一年以内" }, { value: "ONE_TWO_YEARS", label: "1–2 年前" }, { value: "OVER_THREE_YEARS", label: "3 年以前" }, { value: "NEVER", label: "还没有过这种感觉" }] },
    { id: "profile-feedback", kind: "info", title: "你的方向更清晰了", body: "接下来会结合活动能力了解合适的训练起点。过去的状态只作为参考，不会被当作必须回到的标准。", cta: "继续评估活动能力", points: ["尊重个人目标", "从当前状态起步", "不做体型评价"], image: result, imageAlt: "完成温和训练后自然站立" },
  ],
  activity: [
    { id: "flexibility", kind: "single", key: "flexibility", title: "你怎样评价自己的柔韧性？", image: activity, imageAlt: "在家进行入门 Pilates 训练", options: [{ value: "FLEXIBLE", label: "比较灵活" }, { value: "STARTING", label: "刚刚开始" }, { value: "LIMITED", label: "活动范围有限" }, { value: "UNSURE", label: "不太确定" }] },
    { id: "exercise-frequency", kind: "single", key: "exerciseFrequency", title: "你目前多久运动一次？", options: [{ value: "ALMOST_DAILY", label: "几乎每天" }, { value: "SEVERAL_WEEKLY", label: "每周几次" }, { value: "SEVERAL_MONTHLY", label: "每月几次" }, { value: "NEVER", label: "几乎不运动" }] },
    { id: "target-zones", kind: "multi", key: "targetZones", title: "你最想重点训练哪些部位？", hint: "可多选，这决定报告中的动作侧重点。", image: targetZones, imageAlt: "六种 Pilates 身体训练动作", options: [{ value: "CORE", label: "核心" }, { value: "LEGS", label: "腿部" }, { value: "GLUTES", label: "臀部" }, { value: "CHEST", label: "胸肩体态" }, { value: "ARMS", label: "手臂" }, { value: "BACK", label: "背部" }] },
    { id: "zone-feedback", kind: "info", title: "你的重点会进入每周安排", body: "计划会交替安排核心稳定、目标部位和全身恢复，避免只重复单一动作。", cta: "继续评估活动能力", image: targetZones, imageAlt: "六种不同的 Pilates 训练动作" },
    { id: "stairs-breath", kind: "single", key: "stairsBreath", title: "爬楼时，你通常会有多喘？", options: [{ value: "VERY_BREATHLESS", label: "很喘，难以说话" }, { value: "SLIGHTLY", label: "有点喘，仍能说话" }, { value: "ONE_FLIGHT", label: "一层后需要缓一缓" }, { value: "FEW_FLIGHTS", label: "几层楼也没问题" }] },
    { id: "sensitivities", kind: "multi", key: "sensitivities", title: "训练时需要留意哪些部位？", hint: "这不是医疗诊断；持续疼痛应先咨询专业人员。", noneValue: "NONE", options: [{ value: "BACK", label: "腰背较敏感" }, { value: "KNEES", label: "膝盖较敏感" }, { value: "WRISTS", label: "手腕较敏感" }, { value: "NONE", label: "没有以上情况" }] },
    { id: "walking", kind: "single", key: "walkingFrequency", title: "你多久会专门散步或快走？", options: [{ value: "ALMOST_DAILY", label: "几乎每天" }, { value: "THREE_FOUR_WEEKLY", label: "每周 3–4 次" }, { value: "ONE_TWO_WEEKLY", label: "每周 1–2 次" }, { value: "MONTHLY", label: "大约每月一次" }] },
    { id: "equipment", kind: "single", key: "equipmentExperience", title: "你用过小型健身器材吗？", options: [{ value: "LOVED", label: "用过，而且喜欢" }, { value: "DID_NOT_WORK", label: "用过，但不适合我" }, { value: "NEVER", label: "从没用过" }] },
    { id: "equipment-barrier", kind: "single", key: "equipmentBarrier", title: "对于器材，你最大的顾虑是什么？", hint: "这是补充问题，不影响阶段完成。", options: [{ value: "CHALLENGING", label: "看起来有难度" }, { value: "NO_EQUIPMENT", label: "手边没有器材" }, { value: "PRICE", label: "不想额外花费" }, { value: "UNCERTAIN", label: "不确定是否有效" }, { value: "USAGE", label: "担心用法不正确" }, { value: "BODYWEIGHT", label: "更喜欢徒手训练" }, { value: "OTHER", label: "其他" }] },
    { id: "activity-feedback", kind: "info", title: "训练会从低门槛版本开始", body: "器材不是开始的前提。方案会结合柔韧性、步行和爬楼体感安排频次，并为敏感部位保留无痛替代原则。", cta: "继续了解生活节律", points: ["徒手即可开始", "按体感调整难度", "敏感部位可替代"], image: activity, imageAlt: "在家进行低冲击 Pilates 训练" },
  ],
  lifestyle: [
    { id: "work-schedule", kind: "single", key: "workSchedule", title: "你的工作或日常作息是哪一种？", image: lifestyle, imageAlt: "饮水、睡眠、饮食与运动组成的生活习惯", options: [{ value: "DAYTIME", label: "规律白班" }, { value: "NIGHT", label: "夜班或昼夜颠倒" }, { value: "FLEXIBLE", label: "时间比较灵活" }, { value: "NOT_WORKING", label: "目前不工作或已退休" }] },
    { id: "typical-day", kind: "single", key: "typicalDay", title: "你的大多数白天是怎样度过的？", options: [{ value: "MOSTLY_SITTING", label: "大部分时间坐着" }, { value: "ACTIVE_BREAKS", label: "会主动起身活动" }, { value: "ON_FEET", label: "大部分时间站立或走动" }] },
    { id: "energy", kind: "single", key: "energyLevel", title: "白天的精力通常怎样？", options: [{ value: "LOW", label: "多数时间疲惫" }, { value: "AFTERNOON_SLUMP", label: "午后明显犯困" }, { value: "BEFORE_MEALS", label: "饭前容易没精神" }, { value: "STEADY", label: "整体比较稳定" }] },
    { id: "water", kind: "single", key: "waterIntake", title: "你每天大约喝多少水？", hint: "一杯按约 240 ml 估算。", options: [{ value: "COFFEE_TEA", label: "主要喝咖啡或茶" }, { value: "TWO_GLASSES", label: "约 2 杯" }, { value: "TWO_SIX", label: "2–6 杯" }, { value: "MORE_SIX", label: "超过 6 杯" }] },
    { id: "sleep", kind: "single", key: "sleepDuration", title: "你通常能睡多久？", options: [{ value: "UNDER_FIVE", label: "少于 5 小时" }, { value: "FIVE_SIX", label: "5–6 小时" }, { value: "SEVEN_EIGHT", label: "7–8 小时" }, { value: "OVER_EIGHT", label: "超过 8 小时" }] },
    { id: "weight-events", kind: "multi", key: "weightGainEvents", title: "近几年哪些变化影响过你的体重？", hint: "可多选。", noneValue: "NONE", options: [{ value: "RELATIONSHIP", label: "关系或家庭变化" }, { value: "BUSY", label: "工作或照护繁忙" }, { value: "FINANCIAL", label: "经济压力" }, { value: "STRESS", label: "长期压力或担忧" }, { value: "AGING", label: "年龄增长后的变化" }, { value: "SOCIAL", label: "节假日与社交聚会" }, { value: "NONE", label: "没有明显事件" }] },
    { id: "habit-feedback", kind: "info", title: "计划会配合你的日常", body: "不要求突然重做全部作息。先选择最容易坚持的训练时段，再逐步改善恢复与饮水。", cta: "继续看看饮食节律", image: lifestyle, imageAlt: "均衡日常生活的俯拍场景" },
  ],
  nutrition: [
    { id: "breakfast", kind: "single", key: "breakfastTime", title: "你通常什么时候吃早餐？", image: lifestyle, imageAlt: "早餐、饮水与运动用品", options: [{ value: "SIX_EIGHT", label: "6–8 点" }, { value: "EIGHT_TEN", label: "8–10 点" }, { value: "TEN_NOON", label: "10–12 点" }, { value: "SKIP", label: "通常不吃早餐" }] },
    { id: "lunch", kind: "single", key: "lunchTime", title: "午餐通常在什么时候？", options: [{ value: "TEN_NOON", label: "10–12 点" }, { value: "NOON_TWO", label: "12–14 点" }, { value: "TWO_FOUR", label: "14–16 点" }, { value: "SKIP", label: "通常不吃午餐" }] },
    { id: "dinner", kind: "single", key: "dinnerTime", title: "晚餐通常在什么时候？", options: [{ value: "FOUR_SIX", label: "16–18 点" }, { value: "SIX_EIGHT", label: "18–20 点" }, { value: "EIGHT_TEN", label: "20–22 点" }, { value: "SKIP", label: "通常不吃晚餐" }] },
    { id: "diet", kind: "single", key: "dietPreference", title: "哪种饮食方式最接近你？", hint: "只用于建议示例，不要求你改变饮食身份。", options: [{ value: "TRADITIONAL", label: "均衡家常" }, { value: "MEDITERRANEAN", label: "地中海式" }, { value: "KETO", label: "低碳或 Keto" }, { value: "PALEO", label: "少加工或 Paleo" }, { value: "VEGETARIAN", label: "蛋奶素" }, { value: "VEGAN", label: "纯植物" }, { value: "PESCATARIAN", label: "鱼素" }, { value: "LACTOSE_FREE", label: "无乳糖" }, { value: "GLUTEN_FREE", label: "无麸质" }] },
    { id: "eating-habits", kind: "multi", key: "eatingHabits", title: "哪些饮食习惯经常出现？", hint: "可多选。", noneValue: "NONE", options: [{ value: "LATE_NIGHT", label: "常在深夜进食" }, { value: "SWEET", label: "偏爱甜食" }, { value: "SODA", label: "常喝含糖饮料" }, { value: "SALTY", label: "偏爱较咸食物" }, { value: "NONE", label: "没有以上情况" }] },
    { id: "nutrition-feedback", kind: "info", title: "饮食建议会围绕现有习惯微调", body: "不会强迫你更换饮食方式。完整方案会结合三餐时间、饮食偏好和常见习惯，给出第一周可以执行的小动作。", cta: "继续填写身体数据", points: ["保留饮食偏好", "先改一个小动作", "不承诺快速结果"], image: lifestyle, imageAlt: "均衡餐食与日常饮水场景" },
  ],
  metrics: [
    { id: "height", kind: "number", key: "heightCm", title: "你的身高是多少？", hint: "请按当前情况填写。", unit: "cm", min: 90, max: 242, placeholder: "例如 165", image: result, imageAlt: "训练后自然站立并补充水分" },
    { id: "current-weight", kind: "number", key: "weightKg", title: "你现在的体重是多少？", hint: "请按当前情况填写。", unit: "kg", min: 25, max: 300, placeholder: "例如 72" },
    { id: "target-weight", kind: "number", key: "targetWeightKg", title: "你希望达到多少体重？", hint: "填写你希望逐步达到的目标，之后仍可返回修改。", unit: "kg", min: 25, max: 300, placeholder: "例如 60" },
    { id: "age", kind: "number", key: "age", title: "你的准确年龄是多少？", unit: "岁", min: 18, max: 80, placeholder: "例如 32", integer: true },
    { id: "sex", kind: "single", key: "sex", title: "用于能量公式的生理性别", hint: "当前 Mifflin–St Jeor 公式需要该参数；这不代表性别认同。", options: [{ value: "FEMALE", label: "女性" }, { value: "MALE", label: "男性" }] },
    { id: "event", kind: "single", key: "importantEvent", title: "接下来有想为之准备的重要时刻吗？", hint: "只用于增强计划动机，不会压缩安全节奏。", options: [{ value: "VACATION", label: "旅行" }, { value: "WEDDING", label: "婚礼" }, { value: "HOLIDAY", label: "节日" }, { value: "SPORT", label: "运动活动" }, { value: "REUNION", label: "聚会" }, { value: "BIRTHDAY", label: "生日" }, { value: "OTHER", label: "其他" }, { value: "NONE", label: "暂时没有" }] },
    { id: "analyzing", kind: "info", title: "正在准备你的答案摘要", body: "当前正在整理已保存的回答，下一页可以检查并修改。", cta: "查看并确认答案", analysisSteps: ["检查回答是否齐全", "整理训练偏好与活动起点", "整理恢复与饮食节律", "准备提交前答案摘要"], image: result, imageAlt: "完成训练后自信站立的女性" },
  ],
};

export const TOTAL_QUESTION_COUNT = Object.values(STAGE_SCREENS).flat().filter((screen) => screen.kind !== "info").length;
