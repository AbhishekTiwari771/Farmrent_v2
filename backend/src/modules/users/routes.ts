import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { z } from "zod";
import { requireAuth, requireDatabase } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";

export const userRoutes=Router();
userRoutes.use(requireAuth,requireDatabase);

userRoutes.get("/me",async(_req,res,next)=>{
  try{
    const clerkId=res.locals.clerkUserId as string;
    const identity=await clerkClient.users.getUser(clerkId);
    const primary=identity.emailAddresses.find(entry=>entry.id===identity.primaryEmailAddressId)?.emailAddress??identity.emailAddresses[0]?.emailAddress;
    if(!primary){res.status(422).json({error:{code:"EMAIL_REQUIRED",message:"Add an email address to your account before continuing"}});return;}
    const name=[identity.firstName,identity.lastName].filter(Boolean).join(" ")||primary.split("@")[0];
    const user=await prisma.user.upsert({where:{clerkId},create:{clerkId,email:primary,name},update:{email:primary,name},select:{id:true,clerkId:true,email:true,name:true,phone:true,roles:true,district:true,state:true,isVerified:true,createdAt:true}});
    res.json({data:user});
  }catch(error){next(error);}
});

userRoutes.patch("/me",async(req,res,next)=>{
  try{
    const schema=z.object({name:z.string().trim().min(2).max(100).optional(),phone:z.string().trim().max(24).optional(),district:z.string().trim().max(100).optional(),state:z.string().trim().max(100).optional()}).strict();
    const parsed=schema.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Check the profile fields and try again",details:parsed.error.flatten()}});return;}
    const user=await prisma.user.update({where:{clerkId:res.locals.clerkUserId as string},data:parsed.data,select:{id:true,email:true,name:true,phone:true,roles:true,district:true,state:true,isVerified:true}});
    res.json({data:user});
  }catch(error){next(error);}
});

userRoutes.post("/me/roles/owner",async(_req,res,next)=>{
  try{
    const clerkId=res.locals.clerkUserId as string;
    const current=await prisma.user.findUniqueOrThrow({where:{clerkId},select:{roles:true}});
    const user=await prisma.user.update({where:{clerkId},data:current.roles.includes("OWNER")?{}:{roles:{push:"OWNER"}},select:{id:true,roles:true}});
    res.json({data:user});
  }catch(error){next(error);}
});
