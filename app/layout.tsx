import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "동네세일 | 내 주변 마트 전단 모아보기",
  description: "H Mart, Galleria, Metro, Food Basics, Loblaws, T&T의 우편번호별 세일 상품을 카테고리별로 확인하세요.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
