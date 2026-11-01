import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import type { UserRole } from "@prisma/client";

export function requireAuth(req:Request,res:Response,next:NextFunction){
  if(!process.env.CLERK_SECRET_KEY){res.status(503).json({error:{code:"AUTH_NOT_CONFIGURED",message:"Authentication is not configured on this server"}});return;}
  const auth=getAuth(req);
  if(!auth.isAuthenticated||!auth.userId){res.status(401).json({error:{code:"UNAUTHENTICATED",message:"Sign in to continue"}});return;}
  res.locals.clerkUserId=auth.userId;
  next();
}

export function requireDatabase(_req:Request,res:Response,next:NextFunction){
  if(!process.env.DATABASE_URL){res.status(503).json({error:{code:"DATABASE_NOT_CONFIGURED",message:"The marketplace database is not configured on this server"}});return;}
  next();
}

export function requireRole(...required:UserRole[]){return async(req:Request,res:Response,next:NextFunction)=>{
  const clerkId=res.locals.clerkUserId as string|undefined;
  if(!clerkId){res.status(401).json({error:{code:"UNAUTHENTICATED",message:"Sign in to continue"}});return;}
  try{
    const {prisma}=await import("../lib/prisma.js");
    const user=await prisma.user.findUnique({where:{clerkId},select:{id:true,roles:true}});
    if(!user||!required.some(role=>user.roles.includes(role))){res.status(403).json({error:{code:"FORBIDDEN",message:"You do not have permission to perform this action"}});return;}
    res.locals.farmrentUserId=user.id;
    next();
  }catch(error){next(error);}
}}
