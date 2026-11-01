import Link from "next/link";
import { UserProfile } from "@clerk/nextjs";
import { Navbar } from "@/components/layout/navbar";

export default function ProfilePage(){
  const ready=Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return <><Navbar/><main className="container-wide grid min-h-[75vh] place-items-center py-10">{ready?<UserProfile routing="hash"/>:<div className="rounded-[24px] border border-[#e4ebe3] bg-white p-8 text-center"><h1 className="text-2xl font-extrabold">Profile settings</h1><p className="mt-3 text-sm text-[#718073]">Configure Clerk to manage your FarmRent profile.</p><Link href="/sign-in" className="mt-6 inline-flex rounded-full bg-[#166534] px-5 py-3 text-sm font-bold text-white">Sign in</Link></div>}</main></>;
}
