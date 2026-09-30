import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "@/app/providers";
import "@fontsource-variable/noto-sans-sc";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "WellPath 健康测评",
  description: "使用固定合成数据和虚构资料体验个性化健康测评流程",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        <Providers>
          <header className="site-header">
            <Link className="brand" href="/" aria-label="WellPath 首页">
              <span className="brand-mark" aria-hidden="true">W</span>
              <span>WellPath</span>
            </Link>
            <nav aria-label="主导航">
              <Link href="/demo">报告示例</Link>
              <Link href="/privacy">数据说明</Link>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <span>WellPath 交互演示 · 请勿填写真实健康信息</span>
            <Link href="/privacy">隐私与删除</Link>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
