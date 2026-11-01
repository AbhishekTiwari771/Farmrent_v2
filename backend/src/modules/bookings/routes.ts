import { Router } from "express";
import { BookingStatus, UserRole } from "@prisma/client";
import { clerkClient } from "@clerk/express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireDatabase, requireRole } from "../../middleware/auth.js";

export const bookingRoutes=Router();
bookingRoutes.use(requireAuth,requireDatabase);
const requestSchema=z.object({equipmentId:z.string().uuid(),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict();
const blockingStatuses=[BookingStatus.PENDING_OWNER_APPROVAL,BookingStatus.PENDING_PAYMENT,BookingStatus.CONFIRMED,BookingStatus.ACTIVE];
const dateValue=(value:string)=>new Date(`${value}T00:00:00.000Z`);

async function currentUser(clerkId:string){
  const identity=await clerkClient.users.getUser(clerkId);
  const email=identity.emailAddresses.find(entry=>entry.id===identity.primaryEmailAddressId)?.emailAddress??identity.emailAddresses[0]?.emailAddress;
  if(!email)throw Object.assign(new Error("Add an email address to your account before requesting equipment"),{statusCode:422,code:"EMAIL_REQUIRED"});
  const name=[identity.firstName,identity.lastName].filter(Boolean).join(" ")||email.split("@")[0];
  return prisma.user.upsert({where:{clerkId},create:{clerkId,email,name},update:{email,name}});
}

bookingRoutes.post("/",(_req,res)=>res.status(410).json({error:{code:"CHECKOUT_REQUIRED",message:"Use the payment checkout flow to create a confirmed booking"}}));

bookingRoutes.get("/mine",async(req,res,next)=>{
  try{const user=await currentUser(res.locals.clerkUserId as string);const rows=await prisma.booking.findMany({where:{farmerId:user.id,farmerArchivedAt:null},orderBy:{createdAt:"desc"},include:{equipment:{select:{id:true,name:true,district:true,state:true,images:{orderBy:{position:"asc"},take:1}}}}});res.json({data:rows.map(row=>({...row,baseRental:Number(row.baseRental),total:Number(row.total)}))});}
  catch(error){next(error);}
});

bookingRoutes.delete("/:id",async(req,res,next)=>{
  try{
    const parsedId=z.string().uuid().safeParse(req.params.id);
    if(!parsedId.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Provide a valid booking id"}});return;}
    const user=await currentUser(res.locals.clerkUserId as string);
    const booking=await prisma.booking.findFirst({where:{id:parsedId.data,farmerId:user.id,farmerArchivedAt:null},select:{id:true,status:true}});
    if(!booking){res.status(404).json({error:{code:"BOOKING_NOT_FOUND",message:"Booking was not found"}});return;}
    if(booking.status===BookingStatus.PENDING_PAYMENT){res.status(409).json({error:{code:"CHECKOUT_RELEASE_REQUIRED",message:"Use the secure checkout cancellation action to verify payment status and release these dates."}});return;}
    const updated=await prisma.booking.updateMany({where:{id:booking.id,farmerId:user.id,farmerArchivedAt:null},data:{farmerArchivedAt:new Date(),...(booking.status===BookingStatus.PENDING_OWNER_APPROVAL?{status:BookingStatus.CANCELLED,expiresAt:null}:{})}});
    if(!updated.count){res.status(409).json({error:{code:"BOOKING_STATE_CHANGED",message:"This booking changed while you were removing it. Refresh and try again."}});return;}
    res.json({data:{id:booking.id,removed:true}});
  }catch(error){next(error);}
});

bookingRoutes.get("/owner",requireRole(UserRole.OWNER),async(_req,res,next)=>{
  try{const rows=await prisma.booking.findMany({where:{equipment:{ownerId:res.locals.farmrentUserId as string},status:{in:[BookingStatus.CONFIRMED,BookingStatus.ACTIVE,BookingStatus.COMPLETED]}},orderBy:{createdAt:"desc"},include:{farmer:{select:{name:true}},equipment:{select:{id:true,name:true}}}});res.json({data:rows.map(row=>({...row,baseRental:Number(row.baseRental),total:Number(row.total)}))});}
  catch(error){next(error);}
});

bookingRoutes.patch("/:id/decision",requireRole(UserRole.OWNER),async(req,res,next)=>{
  try{
    const id=z.string().uuid().safeParse(req.params.id);const body=z.object({decision:z.enum(["ACCEPT","REJECT"])}).safeParse(req.body);
    if(!id.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Provide a valid request and accept or reject decision"}});return;}
    const ownerId=res.locals.farmrentUserId as string;
    const booking=await prisma.booking.findFirst({where:{id:id.data,equipment:{ownerId}},select:{id:true,status:true,expiresAt:true}});
    if(!booking){res.status(404).json({error:{code:"BOOKING_NOT_FOUND",message:"Rental request was not found"}});return;}
    if(booking.status!==BookingStatus.PENDING_OWNER_APPROVAL||!booking.expiresAt||booking.expiresAt<=new Date()){res.status(409).json({error:{code:"INVALID_TRANSITION",message:"This rental request has expired or has already been handled"}});return;}
    const status=body.data.decision==="ACCEPT"?BookingStatus.CONFIRMED:BookingStatus.REJECTED;
    const updated=await prisma.$transaction(async tx=>{
      const changed=await tx.booking.updateMany({where:{id:booking.id,status:BookingStatus.PENDING_OWNER_APPROVAL,expiresAt:{gt:new Date()},equipment:{ownerId}},data:{status,expiresAt:null}});
      if(!changed.count)throw Object.assign(new Error("This rental request has expired or has already been handled"),{statusCode:409,code:"INVALID_TRANSITION"});
      const row=await tx.booking.findUniqueOrThrow({where:{id:booking.id},include:{farmer:{select:{id:true}},equipment:{select:{name:true}}}});
      await tx.notification.create({data:{userId:row.farmer.id,type:`BOOKING_${status}`,title:status==="CONFIRMED"?"Rental request accepted":"Rental request declined",body:status==="CONFIRMED"?`${row.equipment.name} was approved. Arrange payment and pickup directly with the owner; FarmRent did not charge you.`:`The owner declined your request for ${row.equipment.name}.`}});
      return row;
    });
    res.json({data:{id:updated.id,status:updated.status}});
  }catch(error){next(error);}
});
