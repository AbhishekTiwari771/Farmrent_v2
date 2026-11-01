import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";

export const aiRoutes=Router();
aiRoutes.use(requireAuth);

const chatSchema=z.object({message:z.string().trim().min(2).max(1000),history:z.array(z.object({role:z.enum(["user","assistant"]),content:z.string().min(1).max(1000)})).max(8).default([])}).strict();
const recommendationSchema=z.object({category:z.string().trim().max(100).nullable().optional(),crop:z.string().trim().max(80).nullable().optional(),land_acres:z.number().positive().max(10000),district:z.string().trim().max(100).nullable().optional(),budget_per_day:z.number().positive().max(1000000).nullable().optional(),soil_type:z.string().trim().max(80).nullable().optional(),activity:z.string().trim().max(100).nullable().optional()}).strict();

async function forward(path:string,body:unknown,res:Response){
  const origin=(process.env.AI_SERVICE_URL||"http://localhost:8000").replace(/\/$/,"");
  const serviceKey=process.env.AI_SERVICE_API_KEY;
  if(!serviceKey){res.status(503).json({error:{code:"AI_SERVICE_NOT_CONFIGURED",message:"FarmRent AI service credentials are not configured on the API server."}});return;}
  try{
    const response=await fetch(`${origin}${path}`,{method:"POST",headers:{"Content-Type":"application/json","X-FarmRent-AI-Key":serviceKey},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const payload=await response.text();res.status(response.status).type("application/json").send(payload);
  }catch{res.status(503).json({error:{code:"AI_SERVICE_UNAVAILABLE",message:"The FarmRent AI service is not reachable right now. Please try again shortly."}});}
}

aiRoutes.post("/assistant/chat",async(req,res)=>{
  const parsed=chatSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Enter a message up to 1,000 characters",details:parsed.error.flatten()}});return;}
  await forward("/api/v1/assistant/chat",parsed.data,res);
});

aiRoutes.post("/recommendations",async(req,res)=>{
  const parsed=recommendationSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Check the recommendation fields",details:parsed.error.flatten()}});return;}
  await forward("/api/v1/recommendations",parsed.data,res);
});
