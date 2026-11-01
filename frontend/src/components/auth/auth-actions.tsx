"use client";
import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { ArrowUpRight } from "lucide-react";

export function AuthActions(){
  if(!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)return <div className="hidden items-center gap-5 md:flex"><Link href="/sign-in" className="text-[13px] font-semibold text-[#344238] hover:text-[#166534]">Log in</Link><Link href="/sign-up" className="inline-flex items-center gap-2 rounded-full bg-[#166534] px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-[#14532d]">Get started <ArrowUpRight size={15}/></Link></div>;
  return <div className="hidden items-center gap-5 md:flex"><SignedOut><Link href="/sign-in" className="text-[13px] font-semibold text-[#344238] hover:text-[#166534]">Log in</Link><Link href="/sign-up" className="inline-flex items-center gap-2 rounded-full bg-[#166534] px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-[#14532d]">Get started <ArrowUpRight size={15}/></Link></SignedOut><SignedIn><div className="flex items-center gap-4"><Link href="/farmer/bookings" className="text-[13px] font-semibold text-[#344238] hover:text-[#166534]">My bookings</Link><Link href="/profile" className="text-[13px] font-semibold text-[#344238]">My FarmRent</Link><UserButton/></div></SignedIn></div>;
}
