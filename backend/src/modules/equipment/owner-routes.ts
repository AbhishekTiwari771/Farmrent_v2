import { createHash } from "node:crypto";
import { Router } from "express";
import { EquipmentStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireDatabase, requireRole } from "../../middleware/auth.js";

export const ownerEquipmentRoutes=Router();
ownerEquipmentRoutes.use(requireAuth,requireDatabase,requireRole(UserRole.OWNER));

const imageUrl=z.string().url().refine(value=>{try{return new URL(value).hostname==="res.cloudinary.com"}catch{return false}},{message:"Equipment photos must be stored in FarmRent Cloudinary"});
const listingSchema=z.object({
  name:z.string().trim().min(4).max(140),description:z.string().trim().min(30).max(5000),categoryId:z.string().trim().min(2).max(100),brand:z.string().trim().max(80).optional(),model:z.string().trim().max(100).optional(),
  condition:z.enum(["Excellent","Very good","Good","Fair"]),fuelType:z.string().trim().max(40).optional(),horsepower:z.coerce.number().int().min(1).max(3000).optional(),year:z.coerce.number().int().min(1950).max(new Date().getFullYear()+1).optional(),
  dailyRate:z.coerce.number().positive().max(1000000),deliveryFee:z.coerce.number().nonnegative().max(100000).default(0),securityDeposit:z.coerce.number().nonnegative().max(1000000).default(0),district:z.string().trim().min(2).max(100),state:z.string().trim().min(2).max(100),latitude:z.coerce.number().min(-90).max(90).optional(),longitude:z.coerce.number().min(-180).max(180).optional(),imageUrls:z.array(imageUrl).min(1).max(8),
}).strict();

function listingResponse<T extends {dailyRate:unknown;deliveryFee:unknown;securityDeposit:unknown;latitude:unknown;longitude:unknown}>(item:T){return{...item,dailyRate:Number(item.dailyRate),deliveryFee:Number(item.deliveryFee),securityDeposit:Number(item.securityDeposit),latitude:item.latitude==null?null:Number(item.latitude),longitude:item.longitude==null?null:Number(item.longitude)};}

ownerEquipmentRoutes.get("/mine",async(_req,res,next)=>{
  try{const items=await prisma.equipment.findMany({where:{ownerId:res.locals.farmrentUserId as string},orderBy:{createdAt:"desc"},include:{category:{select:{name:true,slug:true}},images:{orderBy:{position:"asc"}}}});res.json({data:items.map(listingResponse)});}
  catch(error){next(error);}
});

ownerEquipmentRoutes.post("/images/signature",async(_req,res)=>{
  const {CLOUDINARY_CLOUD_NAME:cloudName,CLOUDINARY_API_KEY:apiKey,CLOUDINARY_API_SECRET:apiSecret}=process.env;
  if(!cloudName||!apiKey||!apiSecret){res.status(503).json({error:{code:"IMAGE_STORAGE_NOT_CONFIGURED",message:"Secure equipment photo uploads are not configured"}});return;}
  const ownerId=res.locals.farmrentUserId as string;
  const timestamp=Math.floor(Date.now()/1000);const folder=`farmrent/listings/${ownerId}`;
  const signature=createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest("hex");
  res.json({data:{cloudName,apiKey,folder,timestamp,signature,uploadUrl:`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`}});
});

ownerEquipmentRoutes.post("/",async(req,res,next)=>{
  try{
    const parsed=listingSchema.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Review the equipment details and try again",details:parsed.error.flatten()}});return;}
    const {imageUrls,...values}=parsed.data;
    const categoryId=z.string().uuid().safeParse(values.categoryId).success?await prisma.category.findUnique({where:{id:values.categoryId},select:{id:true}}):await prisma.category.findUnique({where:{slug:values.categoryId.toLowerCase().replaceAll(" ","-")},select:{id:true}});
    if(!categoryId){res.status(400).json({error:{code:"INVALID_CATEGORY",message:"Choose an available equipment category"}});return;}
    const item=await prisma.equipment.create({data:{...values,categoryId:categoryId.id,ownerId:res.locals.farmrentUserId as string,status:EquipmentStatus.ACTIVE,images:{create:imageUrls.map((url,position)=>({url,publicId:url.split("/").slice(-2).join("/"),position}))}},include:{category:{select:{name:true,slug:true}},images:{orderBy:{position:"asc"}}}});
    res.status(201).json({data:listingResponse(item)});
  }catch(error){next(error);}
});

ownerEquipmentRoutes.patch("/:id",async(req,res,next)=>{
  try{
    const id=z.string().uuid().safeParse(req.params.id);
    const parsed=listingSchema.partial().safeParse(req.body);
    if(!id.success){res.status(400).json({error:{code:"INVALID_ID",message:"Equipment ID is invalid"}});return;}
    if(!parsed.success||Object.keys(parsed.data||{}).length===0){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Provide valid listing fields to update",...(parsed.success?{}:{details:parsed.error.flatten()})}});return;}
    const ownerId=res.locals.farmrentUserId as string;
    const existing=await prisma.equipment.findFirst({where:{id:id.data,ownerId},select:{id:true}});
    if(!existing){res.status(404).json({error:{code:"EQUIPMENT_NOT_FOUND",message:"Your equipment listing was not found"}});return;}
    const {imageUrls,categoryId,...values}=parsed.data;
    const resolvedCategory=categoryId?z.string().uuid().safeParse(categoryId).success?await prisma.category.findUnique({where:{id:categoryId},select:{id:true}}):await prisma.category.findUnique({where:{slug:categoryId.toLowerCase().replaceAll(" ","-")},select:{id:true}}):null;
    if(categoryId&&!resolvedCategory){res.status(400).json({error:{code:"INVALID_CATEGORY",message:"Choose an available equipment category"}});return;}
    const item=await prisma.equipment.update({where:{id:id.data},data:{...values,...(resolvedCategory?{categoryId:resolvedCategory.id}:{}),status:EquipmentStatus.ACTIVE,...(imageUrls?{images:{deleteMany:{},create:imageUrls.map((url,position)=>({url,publicId:url.split("/").slice(-2).join("/"),position}))}}:{})},include:{category:{select:{name:true,slug:true}},images:{orderBy:{position:"asc"}}}});
    res.json({data:listingResponse(item)});
  }catch(error){next(error);}
});

ownerEquipmentRoutes.delete("/:id",async(req,res,next)=>{
  try{
    const id=z.string().uuid().safeParse(req.params.id);
    if(!id.success){res.status(400).json({error:{code:"INVALID_ID",message:"Equipment ID is invalid"}});return;}
    const result=await prisma.equipment.updateMany({where:{id:id.data,ownerId:res.locals.farmrentUserId as string,status:{not:EquipmentStatus.INACTIVE}},data:{status:EquipmentStatus.INACTIVE}});
    if(!result.count){res.status(404).json({error:{code:"EQUIPMENT_NOT_FOUND",message:"Your equipment listing was not found"}});return;}
    res.status(204).end();
  }catch(error){next(error);}
});
