"use client";
import { ClerkProvider } from "@clerk/nextjs";
import { AuthSync } from "@/components/auth/auth-sync";

export function AppProviders({children}:{children:React.ReactNode}){
  const publishableKey=process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return publishableKey?<ClerkProvider publishableKey={publishableKey}><AuthSync/>{children}</ClerkProvider>:<>{children}</>;
}
