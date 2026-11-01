"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X, Sprout } from "lucide-react";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { AuthActions } from "@/components/auth/auth-actions";

const links = [["Explore equipment","/equipment"],["Categories","/equipment#categories"],["How it works","/#how-it-works"],["For owners","/#owners"]];

export function Navbar(){
  const [open,setOpen]=useState(false);
  return <header className="sticky top-0 z-40 border-b border-[#e7ece6] bg-[#f8faf7]/90 backdrop-blur-xl">
    <div className="container-wide flex h-[76px] items-center justify-between">
      <Link href="/" className="flex items-center gap-2.5" aria-label="FarmRent home"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#166534] text-white"><Sprout size={20}/></span><span className="font-[Manrope] text-[19px] font-extrabold tracking-[-.055em]">farm<span className="text-[#4d7c0f]">rent</span></span></Link>
      <nav className="hidden items-center gap-8 md:flex">{links.map(([label,href])=><Link key={label} href={href} className="text-[13px] font-medium text-[#536057] transition hover:text-[#166534]">{label}</Link>)}</nav>
      <AuthActions/>
      <button onClick={()=>setOpen(!open)} className="grid h-10 w-10 place-items-center rounded-full border border-[#e7ece6] md:hidden" aria-label={open?"Close menu":"Open menu"}>{open?<X size={19}/>:<Menu size={19}/>}</button>
    </div>
    {open&&<nav className="container-wide flex flex-col gap-4 border-t border-[#e7ece6] py-5 md:hidden">{links.map(([label,href])=><Link onClick={()=>setOpen(false)} key={label} href={href} className="text-sm font-medium">{label}</Link>)}<SignedIn><Link onClick={()=>setOpen(false)} href="/farmer/bookings" className="text-sm font-semibold text-[#166534]">My bookings</Link><Link onClick={()=>setOpen(false)} href="/profile" className="text-sm font-semibold">My FarmRent profile</Link></SignedIn><SignedOut><Link onClick={()=>setOpen(false)} href="/sign-in" className="text-sm font-semibold">Log in</Link><Link onClick={()=>setOpen(false)} href="/sign-up" className="text-sm font-semibold text-[#166534]">Get started</Link></SignedOut></nav>}
  </header>
}
