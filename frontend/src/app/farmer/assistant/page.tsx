import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sprout } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { FarmAssistant } from "@/components/ai/farm-assistant";

export default async function FarmerAssistantPage(){
  const {userId}=await auth();if(!userId)redirect("/sign-in?redirect_url=/farmer/assistant");
  return <><Navbar/><main className="min-h-screen bg-[#f8faf7] px-4 py-8 md:px-8 md:py-12"><div className="mx-auto max-w-6xl"><Link href="/equipment" className="inline-flex items-center gap-2 text-xs font-semibold text-[#657266]"><ArrowLeft size={15}/> Marketplace</Link><div className="mb-7 mt-8"><span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#66804f]"><Sprout size={14}/> Farmer workspace</span><h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">Your AI farming assistant</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#68766b]">Describe your crop, field, or budget. Get practical equipment suggestions grounded in FarmRent’s current listings.</p></div><FarmAssistant/><p className="mt-5 text-center text-[11px] leading-5 text-[#879188]">Guidance is a starting point, not a substitute for local agronomy advice. Confirm machinery suitability with the equipment owner.</p></div></main></>;
}
