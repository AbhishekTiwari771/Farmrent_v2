import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Navbar } from "@/components/layout/navbar";

export default function SignUpPage(){
  const ready=Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return <><Navbar/><main className="container-wide grid min-h-[75vh] place-items-center py-12"><div className="w-full max-w-[440px]">{ready?<SignUp routing="hash"/>:<div className="rounded-[24px] border border-[#e4ebe3] bg-white p-8 text-center"><h1 className="text-2xl font-extrabold">Create your FarmRent account</h1><p className="mt-3 text-sm leading-6 text-[#718073]">Account registration is ready for Clerk. Add your Clerk keys to <code className="rounded bg-[#f2f5f1] px-1.5 py-1">frontend/.env.local</code> to enable it.</p><Link href="/equipment" className="mt-6 inline-flex rounded-full bg-[#166534] px-5 py-3 text-sm font-bold text-white">Explore sample equipment</Link></div>}</div></main></>;
}
