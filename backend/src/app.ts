import "./config/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { clerkMiddleware } from "@clerk/express";
import { userRoutes } from "./modules/users/routes.js";
import { equipmentRoutes } from "./modules/equipment/routes.js";
import { ownerEquipmentRoutes } from "./modules/equipment/owner-routes.js";
import { bookingRoutes } from "./modules/bookings/routes.js";
import { paymentRoutes, razorpayWebhook } from "./modules/payments/routes.js";
import { aiRoutes } from "./modules/ai/routes.js";

const app=express();
app.disable("x-powered-by");
app.use(helmet());
const allowedOrigins=new Set([process.env.FRONTEND_ORIGIN??"http://localhost:3000"]);
if(process.env.NODE_ENV!=="production"){
  allowedOrigins.add("http://localhost:3000");
  allowedOrigins.add("http://localhost:3001");
}
app.use(cors({origin(origin,callback){callback(null,!origin||allowedOrigins.has(origin));},credentials:true}));
app.post("/api/v1/payments/webhook",express.raw({type:"application/json",limit:"1mb"}),razorpayWebhook);
app.use(express.json({limit:"1mb"}));

app.get("/health",(_req,res)=>res.json({status:"ok",service:"farmrent-api"}));
app.get("/health/ready",(_req,res)=>{const databaseConfigured=Boolean(process.env.DATABASE_URL);res.status(databaseConfigured?200:503).json({status:databaseConfigured?"ready":"degraded",checks:{databaseConfigured}});});
app.get("/api/v1",(_req,res)=>res.json({data:{service:"FarmRent API",version:"v1"}}));

if(process.env.CLERK_SECRET_KEY)app.use(clerkMiddleware());
app.use("/api/v1/equipment",equipmentRoutes);
app.use("/api/v1/owner/equipment",ownerEquipmentRoutes);
app.use("/api/v1/bookings",bookingRoutes);
app.use("/api/v1/payments",paymentRoutes);
app.use("/api/v1/users",userRoutes);
app.use("/api/v1/ai",aiRoutes);

app.use((req,res)=>res.status(404).json({error:{code:"NOT_FOUND",message:`No route for ${req.method} ${req.path}`}}));
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if(error&&typeof error==="object"&&"statusCode" in error&&typeof error.statusCode==="number"){
    const statusCode=error.statusCode;const code="code" in error&&typeof error.code==="string"?error.code:"REQUEST_FAILED";
    const message="message" in error&&typeof error.message==="string"?error.message:"The request could not be completed";res.status(statusCode).json({error:{code,message}});return;
  }
  console.error("Unhandled API error",error);
  res.status(500).json({error:{code:"INTERNAL_ERROR",message:"An unexpected error occurred"}});
});
export default app;
