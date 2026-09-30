import { describe, expect, it } from "vitest";
import { requestHash } from "@/server/idempotency";

describe("幂等请求摘要", () => {
  it("对象键顺序不同仍得到同一摘要", () => {
    expect(requestHash({ assessmentId: "a", data: { age: 32, sex: "FEMALE" } }))
      .toBe(requestHash({ data: { sex: "FEMALE", age: 32 }, assessmentId: "a" }));
  });

  it("数组顺序或字段值改变会得到不同摘要", () => {
    expect(requestHash({ values: [1, 2, 3], revision: 1 })).not.toBe(requestHash({ values: [3, 2, 1], revision: 1 }));
    expect(requestHash({ values: [1, 2, 3], revision: 1 })).not.toBe(requestHash({ values: [1, 2, 3], revision: 2 }));
  });
});
