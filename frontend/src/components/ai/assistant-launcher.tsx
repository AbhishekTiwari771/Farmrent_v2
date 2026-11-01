"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

export function AiAssistantLauncher(){
  return <Link href="/farmer/assistant" aria-label="Open FarmRent AI assistant" className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-[#166534] px-4 py-3 text-sm font-bold text-white shadow-[0_10px_35px_rgba(20,83,45,.3)] transition hover:-translate-y-0.5 hover:bg-[#14532d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#84cc16] sm:bottom-7 sm:right-7">
    <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15"><Sparkles size={17}/></span>
    <span>FarmRent AI</span>
  </Link>;
}
