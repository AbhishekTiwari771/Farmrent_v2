import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { RentalRequests } from "@/components/booking/rental-requests";

export default async function FarmerBookingsPage(){
  const {userId}=await auth();if(!userId)redirect("/sign-in?redirect_url=/farmer/bookings");
  return <><Navbar/><main className="min-h-screen bg-[#f8faf7] px-4 py-8 md:px-8 md:py-12"><div className="mx-auto max-w-5xl"><Link href="/equipment" className="inline-flex items-center gap-2 text-xs font-semibold text-[#657266]"><ArrowLeft size={15}/> Marketplace</Link><span className="mt-8 block text-[10px] font-bold uppercase tracking-[.16em] text-[#66804f]">Farmer workspace</span><h1 className="mt-2 text-3xl font-extrabold tracking-tight">My bookings</h1><p className="mt-2 text-sm text-[#68766b]">Track your payment-confirmed equipment rentals and handover details.</p><div className="mt-7"><RentalRequests/></div></div></main></>;
}
