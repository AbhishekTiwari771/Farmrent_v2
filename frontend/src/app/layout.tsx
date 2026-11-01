import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/auth/app-providers";
import { AiAssistantLauncher } from "@/components/ai/assistant-launcher";

export const metadata: Metadata = {
  title: "FarmRent — Smart Farming. Shared Resources.",
  description: "Find and rent agricultural equipment near you. Access the right machinery at the right time with FarmRent.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppProviders>{children}<AiAssistantLauncher/></AppProviders></body></html>;
}
