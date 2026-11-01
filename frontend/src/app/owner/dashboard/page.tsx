import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { OwnerEquipmentList } from "@/components/owner/equipment-list";
import { OwnerBookingRequests } from "@/components/owner/booking-requests";

export default async function OwnerDashboardPage(){
  const {userId}=await auth();
  if(!userId) redirect("/sign-in?redirect_url=/owner/dashboard");
  return <main className="min-h-screen bg-[#f8faf7] px-4 py-8 md:px-8 md:py-12"><div className="mx-auto max-w-6xl"><Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-[#657266]"><ArrowLeft size={15}/> FarmRent</Link><div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#66804f]">Owner studio</span><h1 className="mt-2 text-3xl font-extrabold tracking-tight">My equipment</h1><p className="mt-2 text-sm text-[#68766b]">Manage published listings and respond to farmer rental requests.</p></div><Link href="/owner/equipment/new" className="inline-flex w-fit items-center gap-2 rounded-full bg-[#166534] px-5 py-3 text-xs font-bold text-white"><Plus size={15}/> Add equipment</Link></div><OwnerEquipmentList/><OwnerBookingRequests/></div></main>;
}
