import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ListingWizard } from "@/components/owner/listing-wizard";

export default async function NewEquipmentPage(){
  const {userId}=await auth();
  if(!userId) redirect("/sign-in?redirect_url=/owner/equipment/new");
  return <main className="min-h-screen bg-[#f8faf7] px-4 py-8 md:px-8 md:py-12"><div className="mx-auto max-w-6xl"><Link href="/" className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-[#657266]"><ArrowLeft size={15}/> Back to FarmRent</Link><ListingWizard/></div></main>;
}
