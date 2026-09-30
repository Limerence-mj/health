"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, jsonRequest } from "@/lib/api";

export function PrivacyView() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const remove = useMutation({
    mutationFn: () => api<void>("/api/v1/me", jsonRequest("DELETE", { confirmation: "DELETE_MY_DATA" })),
    onSuccess: () => router.replace("/?deleted=1"),
  });
  return <div className="shell narrow">
    <div className="page-intro"><p className="eyebrow">数据说明</p><h1>你的数据，由你决定</h1><p>这个原型使用匿名会话恢复进度，不要求手机号、姓名或邮箱。</p></div>
    <article className="panel privacy-copy">
      <h2>我们保存什么</h2>
      <ul><li>年龄、生理性别、目标、身高、当前与目标体重、活动水平。</li><li>测评结果快照、匿名会话、模拟权益及防重复请求记录。</li><li>不收集银行卡号；模拟支付不会产生真实订单或扣款。</li></ul>
      <h2>为什么保存</h2>
      <p>用于恢复分步进度、生成并保护你的报告，以及验证支付事件不会重复激活。本演示默认按有效会话与权益期限计算保留时间，至少保留必要的恢复窗口。</p>
      <h2>需要注意</h2>
      <p>报告采用通用公式和固定变化速度，不构成医疗建议。匿名身份只存在于当前浏览器的 HttpOnly Cookie；清除 Cookie 后无法人工找回。</p>
      <div className="danger-zone">
        <h2 style={{ marginTop: 0 }}>删除我的全部数据</h2>
        <p>删除后会同时失去进度、报告、模拟权益和恢复能力，且无法撤销。请输入“删除”进行二次确认。</p>
        <label className="field">确认文字<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="删除" /></label>
        {remove.isError && <p className="form-error">{remove.error.message}</p>}
        <div className="form-actions"><Link className="button button-secondary" href="/">取消并返回</Link><button type="button" className="button button-danger" disabled={confirmation !== "删除" || remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "正在删除…" : "永久删除我的数据"}</button></div>
      </div>
    </article>
  </div>;
}
