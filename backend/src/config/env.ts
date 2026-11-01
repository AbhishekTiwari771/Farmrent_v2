import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Production receives secrets from the host environment. Locally, Clerk's CLI
// stores the shared development instance keys beside the Next.js app.
const backendDirectory=resolve(__dirname,"../..");
const backendEnvPath=resolve(backendDirectory,".env");
dotenv.config({path:backendEnvPath,override:false});
if (process.env.NODE_ENV !== "production") {
  const frontendEnvPath=resolve(backendDirectory,"../frontend/.env");
  dotenv.config({ path: frontendEnvPath, override: false });
  // A blank value in backend/.env should not mask valid local Clerk keys in frontend/.env.
  try{
    const frontendValues=dotenv.parse(readFileSync(frontendEnvPath));
    for(const key of ["CLERK_SECRET_KEY","CLERK_PUBLISHABLE_KEY","NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]){
      if(!process.env[key]?.trim()&&frontendValues[key]?.trim())process.env[key]=frontendValues[key];
    }
  }catch{/* Local frontend env file is optional. */}
}
if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}
