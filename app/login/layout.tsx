import { Jost, Cormorant_Garamond } from "next/font/google";
import type { Metadata } from "next";
import "../globals.css";

const jost = Jost({ subsets: ["latin"], variable: "--font-sans" });
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["300", "400", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Acesso restrito | Bruna Flores Nutri",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${jost.variable} ${cormorant.variable} font-sans antialiased`}>
      {children}
    </div>
  );
}
