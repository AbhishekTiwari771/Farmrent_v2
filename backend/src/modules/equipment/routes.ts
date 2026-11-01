import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../middleware/auth.js";

export const equipmentRoutes=Router();
equipmentRoutes.use(requireDatabase);
const searchSchema=z.object({q:z.string().trim().max(120).optional(),category:z.string().trim().max(80).optional(),location:z.string().trim().max(100).optional(),minPrice:z.coerce.number().nonnegative().optional(),maxPrice:z.coerce.number().nonnegative().optional(),condition:z.string().trim().max(40).optional(),page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(48).default(12),sort:z.enum(["newest","price_asc","price_desc"]).default("newest")});

equipmentRoutes.get("/",async(req,res,next)=>{
  try{
    const parsed=searchSchema.safeParse(req.query);
    if(!parsed.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid equipment search filters",details:parsed.error.flatten()}});return;}
    const {q,category,location,minPrice,maxPrice,condition,page,limit,sort}=parsed.data;
    const where={status:"ACTIVE" as const,...(category?{category:{slug:category.toLowerCase().replaceAll(" ","-")}}:{}),...(condition?{condition:{equals:condition,mode:"insensitive" as const}}:{}),...(location?{OR:[{district:{contains:location,mode:"insensitive" as const}},{state:{contains:location,mode:"insensitive" as const}}]}:{}),...(q?{AND:[{OR:[{name:{contains:q,mode:"insensitive" as const}},{brand:{contains:q,mode:"insensitive" as const}},{model:{contains:q,mode:"insensitive" as const}},{district:{contains:q,mode:"insensitive" as const}},{state:{contains:q,mode:"insensitive" as const}}]}]}:{}),...(minPrice!==undefined||maxPrice!==undefined?{dailyRate:{...(minPrice!==undefined?{gte:minPrice}:{}),...(maxPrice!==undefined?{lte:maxPrice}:{})}}:{})};
    const orderBy=sort==="price_asc"?{dailyRate:"asc" as const}:sort==="price_desc"?{dailyRate:"desc" as const}:{createdAt:"desc" as const};
    const [rows,total]=await Promise.all([prisma.equipment.findMany({where,orderBy,skip:(page-1)*limit,take:limit,include:{category:{select:{name:true,slug:true}},images:{orderBy:{position:"asc"}},owner:{select:{id:true,name:true,isVerified:true}}}}),prisma.equipment.count({where})]);
    const ratings=rows.length?await prisma.review.groupBy({by:["equipmentId"],where:{equipmentId:{in:rows.map(item=>item.id)}},_avg:{rating:true},_count:{rating:true}}):[];
    const ratingByEquipment=new Map(ratings.map(entry=>[entry.equipmentId,{rating:Number(entry._avg.rating??0),reviews:entry._count.rating}]));
    const data=rows.map(item=>({...item,...ratingByEquipment.get(item.id),dailyRate:Number(item.dailyRate),deliveryFee:Number(item.deliveryFee),securityDeposit:Number(item.securityDeposit),latitude:item.latitude?Number(item.latitude):null,longitude:item.longitude?Number(item.longitude):null}));
    res.json({data,meta:{page,limit,total,pages:Math.ceil(total/limit),source:"database"}});
  }catch(error){next(error);}
});

equipmentRoutes.get("/:id",async(req,res,next)=>{
  try{
    const id=z.string().uuid().safeParse(req.params.id);
    if(!id.success){res.status(400).json({error:{code:"INVALID_ID",message:"Equipment ID is invalid"}});return;}
    const item=await prisma.equipment.findFirst({where:{id:id.data,status:"ACTIVE"},include:{category:{select:{name:true,slug:true}},images:{orderBy:{position:"asc"}},owner:{select:{id:true,name:true,isVerified:true,district:true,state:true}},reviews:{orderBy:{createdAt:"desc"},take:10,include:{user:{select:{name:true}}}}}});
    if(!item){res.status(404).json({error:{code:"EQUIPMENT_NOT_FOUND",message:"Equipment listing was not found"}});return;}
    const aggregate=await prisma.review.aggregate({where:{equipmentId:item.id},_avg:{rating:true},_count:{rating:true}});
    res.json({data:{...item,rating:Number(aggregate._avg.rating??0),reviewCount:aggregate._count.rating,dailyRate:Number(item.dailyRate),deliveryFee:Number(item.deliveryFee),securityDeposit:Number(item.securityDeposit),latitude:item.latitude?Number(item.latitude):null,longitude:item.longitude?Number(item.longitude):null}});
  }catch(error){next(error);}
});

equipmentRoutes.get("/meta/categories",async(_req,res,next)=>{
  try{const data=await prisma.category.findMany({orderBy:{name:"asc"},select:{id:true,name:true,slug:true,_count:{select:{equipment:{where:{status:"ACTIVE"}}}}}});res.json({data});}
  catch(error){next(error);}
});
