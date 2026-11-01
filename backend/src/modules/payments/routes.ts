import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { BookingStatus, PaymentStatus, Prisma, RefundStatus } from "@prisma/client";
import { clerkClient } from "@clerk/express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireDatabase } from "../../middleware/auth.js";

export const paymentRoutes=Router();
paymentRoutes.use(requireAuth,requireDatabase);
const checkoutSchema=z.object({
  equipmentId:z.string().uuid(),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deliveryMode:z.enum(["PICKUP","DELIVERY"]),deliveryAddress:z.string().trim().max(500).optional(),rentalNotes:z.string().trim().max(1000).optional(),
}).strict().superRefine((value,ctx)=>{if(value.deliveryMode==="DELIVERY"&&!value.deliveryAddress?.trim())ctx.addIssue({code:"custom",path:["deliveryAddress"],message:"Enter the delivery address"});});
const verifySchema=z.object({bookingId:z.string().uuid(),razorpay_order_id:z.string().min(5).max(64),razorpay_payment_id:z.string().min(5).max(64),razorpay_signature:z.string().regex(/^[a-f0-9]{64}$/i)}).strict();
const reconcileSchema=z.object({bookingId:z.string().uuid()}).strict();
const cancelCheckoutSchema=z.object({bookingId:z.string().uuid()}).strict();
const day=(value:string)=>new Date(`${value}T00:00:00.000Z`);
const roundMoney=(value:number)=>Math.round(value*100)/100;
const paidStatuses=[PaymentStatus.CAPTURED,PaymentStatus.REFUND_PENDING,PaymentStatus.REFUNDED];

function credentials(){
  const keyId=process.env.RAZORPAY_KEY_ID;const keySecret=process.env.RAZORPAY_KEY_SECRET;
  if(!keyId||!keySecret)throw Object.assign(new Error("Razorpay test keys are not configured on the FarmRent API"),{statusCode:503,code:"PAYMENTS_NOT_CONFIGURED"});
  return{keyId,keySecret,authorization:`Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`};
}

async function razorpayRequest<T>(path:string,init:RequestInit={}){
  const {authorization}=credentials();
  const response=await fetch(`https://api.razorpay.com/v1${path}`,{...init,headers:{Authorization:authorization,"Content-Type":"application/json",...init.headers}});
  const body=await response.json() as T & {error?:{description?:string}};
  if(!response.ok)throw Object.assign(new Error(body.error?.description||"Razorpay could not complete the payment request"),{statusCode:502,code:"RAZORPAY_REQUEST_FAILED"});
  return body;
}

async function currentUser(clerkId:string){
  const identity=await clerkClient.users.getUser(clerkId);
  const email=identity.emailAddresses.find(entry=>entry.id===identity.primaryEmailAddressId)?.emailAddress??identity.emailAddresses[0]?.emailAddress;
  if(!email)throw Object.assign(new Error("Add an email address to your account before checkout"),{statusCode:422,code:"EMAIL_REQUIRED"});
  const name=[identity.firstName,identity.lastName].filter(Boolean).join(" ")||email.split("@")[0];
  return prisma.user.upsert({where:{clerkId},create:{clerkId,email,name},update:{email,name}});
}

function fail(res:Response,statusCode:number,code:string,message:string){res.status(statusCode).json({error:{code,message}});}
function priceBreakdown(item:{dailyRate:Prisma.Decimal;deliveryFee:Prisma.Decimal;securityDeposit:Prisma.Decimal},days:number,mode:"PICKUP"|"DELIVERY"){
  const baseRental=roundMoney(Number(item.dailyRate)*days);const deliveryFee=mode==="DELIVERY"?roundMoney(Number(item.deliveryFee)):0;
  const platformFee=roundMoney(baseRental*0.05);const taxes=0;const discount=0;const securityDeposit=roundMoney(Number(item.securityDeposit));
  return{baseRental,deliveryFee,platformFee,taxes,discount,securityDeposit,total:roundMoney(baseRental+deliveryFee+platformFee+taxes-discount+securityDeposit)};
}
function parseDates(startText:string,endText:string){
  const startDate=day(startText);const endDate=day(endText);const today=day(new Date().toISOString().slice(0,10));
  const validStart=!Number.isNaN(startDate.getTime())&&startDate.toISOString().slice(0,10)===startText;const validEnd=!Number.isNaN(endDate.getTime())&&endDate.toISOString().slice(0,10)===endText;
  if(!validStart||!validEnd||startDate<=today||endDate<startDate)return null;
  const days=Math.round((endDate.getTime()-startDate.getTime())/86400000)+1;
  return days<=30?{startDate,endDate,days}:null;
}
async function isDatesFree(equipmentId:string,startDate:Date,endDate:Date){
  const now=new Date();
  return !await prisma.booking.findFirst({where:{equipmentId,startDate:{lte:endDate},endDate:{gte:startDate},OR:[{status:{in:[BookingStatus.CONFIRMED,BookingStatus.ACTIVE]}},{status:BookingStatus.PENDING_PAYMENT,expiresAt:{gt:now}},{status:BookingStatus.PENDING_OWNER_APPROVAL,expiresAt:{gt:now}}]},select:{id:true}});
}

paymentRoutes.post("/quote",async(req,res,next)=>{
  try{
    const parsed=checkoutSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Review your rental dates and delivery details",details:parsed.error.flatten()}});return;}
    const period=parseDates(parsed.data.startDate,parsed.data.endDate);if(!period){fail(res,400,"INVALID_DATES","Choose valid rental dates in the future, for up to 30 days");return;}
    const farmer=await currentUser(res.locals.clerkUserId as string);const item=await prisma.equipment.findFirst({where:{id:parsed.data.equipmentId,status:"ACTIVE"}});
    if(!item){fail(res,404,"EQUIPMENT_NOT_FOUND","This equipment listing is no longer available");return;}
    if(item.ownerId===farmer.id){fail(res,400,"SELF_BOOKING","You cannot rent your own equipment");return;}
    if(!await isDatesFree(item.id,period.startDate,period.endDate)){fail(res,409,"DATES_UNAVAILABLE","Those dates were just booked. Choose another rental period.");return;}
    const lines=priceBreakdown(item,period.days,parsed.data.deliveryMode);
    res.json({data:{equipmentId:item.id,equipmentName:item.name,days:period.days,currency:"INR",...lines}});
  }catch(error){next(error);}
});

paymentRoutes.post("/orders",async(req,res,next)=>{
  try{
    let keys:ReturnType<typeof credentials>;
    try{keys=credentials();}catch(error){const e=error as Error&{statusCode?:number;code?:string};fail(res,e.statusCode??503,e.code??"PAYMENTS_NOT_CONFIGURED",e.message);return;}
    const parsed=checkoutSchema.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Review your rental dates and delivery details",details:parsed.error.flatten()}});return;}
    const period=parseDates(parsed.data.startDate,parsed.data.endDate);
    if(!period){fail(res,400,"INVALID_DATES","Choose valid rental dates in the future, for up to 30 days");return;}
    const {startDate,endDate,days}=period;
    const farmer=await currentUser(res.locals.clerkUserId as string);
    const booking=await prisma.$transaction(async tx=>{
      const item=await tx.equipment.findFirst({where:{id:parsed.data.equipmentId,status:"ACTIVE"}});
      if(!item)throw Object.assign(new Error("This equipment listing is no longer available"),{statusCode:404,code:"EQUIPMENT_NOT_FOUND"});
      if(item.ownerId===farmer.id)throw Object.assign(new Error("You cannot rent your own equipment"),{statusCode:400,code:"SELF_BOOKING"});
      const now=new Date();
      const conflict=await tx.booking.findFirst({where:{equipmentId:item.id,startDate:{lte:endDate},endDate:{gte:startDate},OR:[{status:{in:[BookingStatus.CONFIRMED,BookingStatus.ACTIVE]}},{status:BookingStatus.PENDING_PAYMENT,expiresAt:{gt:now}},{status:BookingStatus.PENDING_OWNER_APPROVAL,expiresAt:{gt:now}}]},select:{id:true}});
      if(conflict)throw Object.assign(new Error("Those dates were just booked. Choose another rental period."),{statusCode:409,code:"DATES_UNAVAILABLE"});
      const lines=priceBreakdown(item,days,parsed.data.deliveryMode);
      return tx.booking.create({data:{farmerId:farmer.id,equipmentId:item.id,startDate,endDate,status:BookingStatus.PENDING_PAYMENT,baseRental:lines.baseRental,deliveryFee:lines.deliveryFee,platformFee:lines.platformFee,taxes:lines.taxes,discount:lines.discount,securityDeposit:lines.securityDeposit,total:lines.total,currency:"INR",deliveryMode:parsed.data.deliveryMode,deliveryAddress:parsed.data.deliveryMode==="DELIVERY"?parsed.data.deliveryAddress:null,rentalNotes:parsed.data.rentalNotes||null,expiresAt:new Date(Date.now()+30*60*1000)},include:{equipment:{select:{id:true,name:true}}}});
    },{isolationLevel:"Serializable"});
    const amount=Math.round(Number(booking.total)*100);
    try{
      const order=await razorpayRequest<{id:string;amount:number;currency:string;status:string;receipt?:string}>("/orders",{method:"POST",body:JSON.stringify({amount,currency:"INR",receipt:booking.id,notes:{booking_id:booking.id,equipment_id:booking.equipmentId}})});
      if(!order.id||order.amount!==amount||order.currency!=="INR")throw Object.assign(new Error("Razorpay returned an order that did not match the FarmRent total"),{statusCode:502,code:"ORDER_MISMATCH"});
      await prisma.payment.create({data:{bookingId:booking.id,userId:farmer.id,razorpayOrderId:order.id,amount:Number(booking.total),currency:"INR",status:PaymentStatus.CREATED}});
      res.status(201).json({data:{bookingId:booking.id,equipmentName:booking.equipment.name,customerName:farmer.name,customerEmail:farmer.email,orderId:order.id,keyId:keys.keyId,amount,currency:"INR",days,expiresAt:booking.expiresAt,lineItems:{baseRental:Number(booking.baseRental),deliveryFee:Number(booking.deliveryFee),platformFee:Number(booking.platformFee),taxes:Number(booking.taxes),discount:Number(booking.discount),securityDeposit:Number(booking.securityDeposit),total:Number(booking.total)}}});
    }catch(error){await prisma.booking.updateMany({where:{id:booking.id,status:BookingStatus.PENDING_PAYMENT},data:{status:BookingStatus.PAYMENT_FAILED,expiresAt:null}});throw error;}
  }catch(error){
    if(error&&typeof error==="object"&&"code" in error&&error.code==="P2034"){fail(res,409,"DATES_UNAVAILABLE","Those dates were just booked. Choose another rental period.");return;}
    next(error);
  }
});

paymentRoutes.post("/cancel-checkout",async(req,res,next)=>{
  try{
    const parsed=cancelCheckoutSchema.safeParse(req.body);if(!parsed.success){fail(res,400,"VALIDATION_ERROR","Provide a valid booking id");return;}
    const farmer=await currentUser(res.locals.clerkUserId as string);
    const record=await prisma.payment.findFirst({where:{bookingId:parsed.data.bookingId,userId:farmer.id},orderBy:{createdAt:"desc"},include:{booking:true}});
    if(!record){fail(res,404,"PAYMENT_NOT_FOUND","No payment was found for this booking");return;}
    if(record.booking.status!==BookingStatus.PENDING_PAYMENT){fail(res,409,"BOOKING_NOT_PENDING","Only a pending checkout can release its rental dates");return;}
    if(record.status===PaymentStatus.CAPTURED||record.status===PaymentStatus.REFUND_PENDING||record.status===PaymentStatus.REFUNDED){fail(res,409,"PAYMENT_ALREADY_COMPLETED","This payment is already complete. The booking cannot be cancelled here");return;}

    const orderPayments=await razorpayRequest<{items:Array<{id:string;order_id:string;amount:number;currency:string;status:string}>}>(`/orders/${encodeURIComponent(record.razorpayOrderId)}/payments`);
    const captured=orderPayments.items?.find(payment=>payment.order_id===record.razorpayOrderId&&payment.status==="captured");
    if(captured){
      if(captured.amount!==Math.round(Number(record.amount)*100)||captured.currency!==record.currency){fail(res,409,"PAYMENT_AMOUNT_MISMATCH","Razorpay reports a captured amount that does not match this booking. Contact support");return;}
      const booking=await saveCapturedPayment(captured.id,record.razorpayOrderId,captured.amount,captured.currency,captured as unknown as Prisma.InputJsonValue);
      res.status(409).json({error:{code:"PAYMENT_ALREADY_COMPLETED",message:"Razorpay already captured this payment, so the booking has been confirmed instead of cancelled",bookingId:booking.id}});return;
    }
    const authorized=orderPayments.items?.find(payment=>payment.order_id===record.razorpayOrderId&&payment.status==="authorized");
    if(authorized){fail(res,409,"PAYMENT_IN_PROGRESS","A payment is still authorized by Razorpay. Wait for its final status before cancelling this checkout");return;}

    const now=new Date();
    const result=await prisma.$transaction(async tx=>{
      const booking=await tx.booking.findFirst({where:{id:record.bookingId,farmerId:farmer.id,status:BookingStatus.PENDING_PAYMENT,farmerArchivedAt:null},select:{id:true}});
      if(!booking)throw Object.assign(new Error("This booking changed while cancellation was being processed"),{statusCode:409,code:"BOOKING_STATE_CHANGED"});
      const cancelled=await tx.booking.updateMany({where:{id:booking.id,farmerId:farmer.id,status:BookingStatus.PENDING_PAYMENT,farmerArchivedAt:null},data:{status:BookingStatus.CANCELLED,expiresAt:null,farmerArchivedAt:now}});
      if(!cancelled.count)throw Object.assign(new Error("This booking changed while cancellation was being processed"),{statusCode:409,code:"BOOKING_STATE_CHANGED"});
      await tx.payment.updateMany({where:{bookingId:booking.id,status:{in:[PaymentStatus.CREATED,PaymentStatus.FAILED]}},data:{status:PaymentStatus.FAILED}});
      return{bookingId:booking.id};
    },{isolationLevel:"Serializable"});
    res.json({data:{...result,status:BookingStatus.CANCELLED,datesReleased:true,removed:true}});
  }catch(error){next(error);}
});

async function saveCapturedPayment(paymentId:string,orderId:string,amount:number,currency:string,gatewayReference:Prisma.InputJsonValue){
  return prisma.$transaction(async tx=>{
    const payment=await tx.payment.findUnique({where:{razorpayOrderId:orderId},include:{booking:{include:{equipment:true,farmer:true}}}});
    if(!payment)throw Object.assign(new Error("Payment order was not found"),{statusCode:404,code:"PAYMENT_NOT_FOUND"});
    if(Math.round(Number(payment.amount)*100)!==amount||payment.currency!==currency)throw Object.assign(new Error("The captured amount does not match the rental total"),{statusCode:409,code:"PAYMENT_AMOUNT_MISMATCH"});
    if(payment.status===PaymentStatus.CAPTURED){if(payment.razorpayPaymentId!==paymentId)throw Object.assign(new Error("A different payment has already completed for this order"),{statusCode:409,code:"DUPLICATE_PAYMENT"});return payment.booking;}
    if(payment.status!==PaymentStatus.CREATED&&payment.status!==PaymentStatus.AUTHORIZED&&payment.status!==PaymentStatus.FAILED)throw Object.assign(new Error("This payment order is no longer payable"),{statusCode:409,code:"PAYMENT_NOT_PAYABLE"});
    const now=new Date();
    if(payment.booking.expiresAt&&payment.booking.expiresAt<=now)throw Object.assign(new Error("The checkout reservation expired. Start a new checkout."),{statusCode:409,code:"CHECKOUT_EXPIRED"});
    const updated=await tx.payment.updateMany({where:{id:payment.id,status:{in:[PaymentStatus.CREATED,PaymentStatus.AUTHORIZED,PaymentStatus.FAILED]}},data:{razorpayPaymentId:paymentId,status:PaymentStatus.CAPTURED,gatewayReference}});
    if(!updated.count)throw Object.assign(new Error("Payment state changed; reload your bookings"),{statusCode:409,code:"PAYMENT_STATE_CHANGED"});
    const confirmed=await tx.booking.updateMany({where:{id:payment.bookingId,status:BookingStatus.PENDING_PAYMENT},data:{status:BookingStatus.CONFIRMED,expiresAt:null}});
    if(!confirmed.count)throw Object.assign(new Error("The booking is no longer awaiting payment"),{statusCode:409,code:"BOOKING_STATE_CHANGED"});
    await tx.notification.createMany({data:[
      {userId:payment.booking.farmerId,type:"PAYMENT_CAPTURED",title:"Payment confirmed",body:`Your FarmRent booking for ${payment.booking.equipment.name} is confirmed.`},
      {userId:payment.booking.equipment.ownerId,type:"BOOKING_CONFIRMED",title:"New confirmed rental",body:`${payment.booking.equipment.name} has a paid rental booking.`},
    ]});
    return payment.booking;
  },{isolationLevel:"Serializable"});
}

function cancellationRefundId(paymentId:string){
  const bytes=createHash("sha256").update(`farmrent-cancelled-checkout-refund:${paymentId}`).digest().subarray(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x50;bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=bytes.toString("hex");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function submitCancellationRefund(refundId:string,paymentId:string){
  const refund=await prisma.refund.findUnique({where:{id:refundId}});
  if(!refund)throw Object.assign(new Error("Cancellation refund record was not found"),{statusCode:500,code:"REFUND_RECORD_MISSING"});
  if(refund.status===RefundStatus.PROCESSED)return;
  const result=await razorpayRequest<{id:string;status:string;amount:number}>(`/payments/${encodeURIComponent(paymentId)}/refund`,{method:"POST",headers:{"X-Refund-Idempotency":refundId},body:JSON.stringify({amount:Math.round(Number(refund.amount)*100),receipt:refundId,notes:{booking_id:refund.bookingId,reason:"checkout_cancelled"}})});
  const status=result.status==="processed"?RefundStatus.PROCESSED:result.status==="failed"?RefundStatus.FAILED:RefundStatus.PENDING;
  await prisma.$transaction(async tx=>{
    await tx.refund.update({where:{id:refundId},data:{razorpayRefundId:result.id,status}});
    if(status===RefundStatus.PROCESSED){
      await tx.payment.updateMany({where:{bookingId:refund.bookingId,razorpayPaymentId:paymentId},data:{status:PaymentStatus.REFUNDED}});
      await tx.booking.updateMany({where:{id:refund.bookingId,status:BookingStatus.REFUND_PENDING},data:{status:BookingStatus.REFUNDED}});
      const booking=await tx.booking.findUnique({where:{id:refund.bookingId},select:{farmerId:true,equipment:{select:{name:true}}}});
      if(booking)await tx.notification.create({data:{userId:booking.farmerId,type:"REFUND_PROCESSED",title:"Refund initiated",body:`Your payment for ${booking.equipment.name} was refunded after the checkout was cancelled.`}});
    }
  });
}

paymentRoutes.post("/verify",async(req,res,next)=>{
  try{
    const parsed=verifySchema.safeParse(req.body);if(!parsed.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Payment verification details are invalid"}});return;}
    const {keySecret}=credentials();const user=await currentUser(res.locals.clerkUserId as string);
    const record=await prisma.payment.findFirst({where:{bookingId:parsed.data.bookingId,razorpayOrderId:parsed.data.razorpay_order_id,userId:user.id},include:{booking:true}});
    if(!record){res.status(404).json({error:{code:"PAYMENT_NOT_FOUND",message:"This payment does not belong to your booking"}});return;}
    const expected=createHmac("sha256",keySecret).update(`${record.razorpayOrderId}|${parsed.data.razorpay_payment_id}`).digest();
    const supplied=Buffer.from(parsed.data.razorpay_signature,"hex");
    if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied)){res.status(400).json({error:{code:"INVALID_PAYMENT_SIGNATURE",message:"Razorpay could not verify this payment response"}});return;}
    if(record.status===PaymentStatus.CAPTURED&&record.razorpayPaymentId===parsed.data.razorpay_payment_id){res.json({data:{bookingId:record.bookingId,status:record.booking.status,paymentStatus:record.status}});return;}
    if(record.booking.status!==BookingStatus.PENDING_PAYMENT){res.status(409).json({error:{code:"BOOKING_CANCELLED",message:"This checkout was cancelled and its rental dates were released. Do not retry payment."}});return;}
    let gatewayPayment=await razorpayRequest<{id:string;order_id:string;amount:number;currency:string;status:string}>(`/payments/${encodeURIComponent(parsed.data.razorpay_payment_id)}`);
    if(gatewayPayment.id!==parsed.data.razorpay_payment_id||gatewayPayment.order_id!==record.razorpayOrderId){res.status(409).json({error:{code:"PAYMENT_ORDER_MISMATCH",message:"The payment does not match this rental order"}});return;}
    const expectedAmount=Math.round(Number(record.amount)*100);
    if(gatewayPayment.amount!==expectedAmount||gatewayPayment.currency!==record.currency){res.status(409).json({error:{code:"PAYMENT_AMOUNT_MISMATCH",message:"The payment amount or currency does not match the rental total"}});return;}
    if(gatewayPayment.status==="authorized")gatewayPayment=await razorpayRequest<typeof gatewayPayment>(`/payments/${encodeURIComponent(gatewayPayment.id)}/capture`,{method:"POST",body:JSON.stringify({amount:expectedAmount,currency:record.currency})});
    if(gatewayPayment.status!=="captured"){res.status(409).json({error:{code:"PAYMENT_NOT_CAPTURED",message:"Razorpay has not captured this payment yet. Check its status and retry."}});return;}
    const booking=await saveCapturedPayment(gatewayPayment.id,record.razorpayOrderId,gatewayPayment.amount,gatewayPayment.currency,gatewayPayment as unknown as Prisma.InputJsonValue);
    res.json({data:{bookingId:booking.id,status:BookingStatus.CONFIRMED,paymentStatus:PaymentStatus.CAPTURED}});
  }catch(error){next(error);}
});

paymentRoutes.post("/reconcile",async(req,res,next)=>{
  try{
    const parsed=reconcileSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Provide a valid booking id"}});return;}
    const user=await currentUser(res.locals.clerkUserId as string);
    const record=await prisma.payment.findFirst({where:{bookingId:parsed.data.bookingId,userId:user.id},orderBy:{createdAt:"desc"},include:{booking:true}});
    if(!record){res.status(404).json({error:{code:"PAYMENT_NOT_FOUND",message:"No payment was found for this booking"}});return;}
    if(record.status===PaymentStatus.CAPTURED&&record.booking.status===BookingStatus.CONFIRMED){res.json({data:{bookingId:record.bookingId,status:record.booking.status,paymentStatus:record.status}});return;}
    if(record.booking.status!==BookingStatus.PENDING_PAYMENT){res.status(409).json({error:{code:"BOOKING_NOT_PENDING",message:"This booking is no longer waiting for payment"}});return;}
    const result=await razorpayRequest<{items:Array<{id:string;order_id:string;amount:number;currency:string;status:string}>}>(`/orders/${encodeURIComponent(record.razorpayOrderId)}/payments`);
    let payment=result.items?.find(item=>item.order_id===record.razorpayOrderId&&item.status==="captured");
    if(!payment){
      const authorized=result.items?.find(item=>item.order_id===record.razorpayOrderId&&item.status==="authorized");
      if(authorized){
        if(authorized.amount!==Math.round(Number(record.amount)*100)||authorized.currency!==record.currency){res.status(409).json({error:{code:"PAYMENT_AMOUNT_MISMATCH",message:"The authorized payment does not match this booking total. Contact support before taking further action."}});return;}
        if(record.booking.expiresAt&&record.booking.expiresAt<=new Date()){res.status(409).json({error:{code:"CHECKOUT_EXPIRED",message:"The payment reservation expired before capture. Contact support so we can check the payment safely."}});return;}
        payment=await razorpayRequest<typeof authorized>(`/payments/${encodeURIComponent(authorized.id)}/capture`,{method:"POST",body:JSON.stringify({amount:authorized.amount,currency:authorized.currency})});
      }
    }
    if(!payment||payment.status!=="captured"){res.status(409).json({error:{code:"PAYMENT_NOT_CAPTURED",message:"Razorpay has not captured a payment for this booking yet. Do not retry if your bank shows a completed charge; contact support to investigate."}});return;}
    if(payment.amount!==Math.round(Number(record.amount)*100)||payment.currency!==record.currency){res.status(409).json({error:{code:"PAYMENT_AMOUNT_MISMATCH",message:"The captured payment does not match this booking total. Contact support before taking further action."}});return;}
    const booking=await saveCapturedPayment(payment.id,record.razorpayOrderId,payment.amount,payment.currency,payment as unknown as Prisma.InputJsonValue);
    res.json({data:{bookingId:booking.id,status:BookingStatus.CONFIRMED,paymentStatus:PaymentStatus.CAPTURED}});
  }catch(error){next(error);}
});

export async function razorpayWebhook(req:Request,res:Response,next:NextFunction){
  try{
    if(!Buffer.isBuffer(req.body)){res.status(415).json({error:{code:"RAW_BODY_REQUIRED",message:"Razorpay webhook requires its original raw body"}});return;}
    const secret=process.env.RAZORPAY_WEBHOOK_SECRET;if(!secret){res.status(503).json({error:{code:"WEBHOOK_NOT_CONFIGURED",message:"Configure the Razorpay webhook secret"}});return;}
    const signature=req.get("x-razorpay-signature")||"";if(!/^[a-f0-9]{64}$/i.test(signature)){res.status(400).json({error:{code:"INVALID_WEBHOOK_SIGNATURE",message:"Webhook signature is missing or malformed"}});return;}
    const expected=createHmac("sha256",secret).update(req.body).digest();const supplied=Buffer.from(signature,"hex");
    if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied)){res.status(400).json({error:{code:"INVALID_WEBHOOK_SIGNATURE",message:"Webhook signature verification failed"}});return;}
    const eventId=req.get("x-razorpay-event-id");if(!eventId){res.status(400).json({error:{code:"WEBHOOK_EVENT_ID_REQUIRED",message:"Razorpay event ID is required for duplicate protection"}});return;}
    const event=JSON.parse(req.body.toString("utf8")) as {event?:string;payload?:{payment?:{entity?:{id?:string;order_id?:string;amount?:number;currency?:string;status?:string}};refund?:{entity?:{id?:string;payment_id?:string;amount?:number;status?:string;receipt?:string|null}}}};
    if(!event.event){res.status(400).json({error:{code:"INVALID_WEBHOOK",message:"Webhook event name is missing"}});return;}
    let cancellationRefund:{refundId:string;paymentId:string}|undefined;
    await prisma.$transaction(async tx=>{
      await tx.paymentWebhookEvent.create({data:{razorpayEventId:eventId,event:event.event!,payload:event as Prisma.InputJsonValue}});
      const refundEntity=event.payload?.refund?.entity;
      if(event.event!.startsWith("refund.")&&refundEntity?.id){
        const refundRecord=refundEntity.receipt?await tx.refund.findUnique({where:{id:refundEntity.receipt}}):await tx.refund.findFirst({where:{razorpayRefundId:refundEntity.id}});
        if(refundRecord){
          const status=event.event==="refund.processed"?RefundStatus.PROCESSED:event.event==="refund.failed"?RefundStatus.FAILED:RefundStatus.PENDING;
          await tx.refund.update({where:{id:refundRecord.id},data:{razorpayRefundId:refundEntity.id,status}});
          if(status===RefundStatus.PROCESSED){
            await tx.payment.updateMany({where:{bookingId:refundRecord.bookingId,status:PaymentStatus.REFUND_PENDING},data:{status:PaymentStatus.REFUNDED}});
            await tx.booking.updateMany({where:{id:refundRecord.bookingId,status:BookingStatus.REFUND_PENDING},data:{status:BookingStatus.REFUNDED}});
          }
        }
        await tx.paymentWebhookEvent.update({where:{razorpayEventId:eventId},data:{processedAt:new Date()}});
        return;
      }
      const entity=event.payload?.payment?.entity;
      if(!entity?.order_id||!entity.id)return;
      const payment=await tx.payment.findUnique({where:{razorpayOrderId:entity.order_id},include:{booking:{include:{equipment:true}}}});
      if(!payment)return;
      if(event.event==="payment.captured"&&entity.status==="captured"&&entity.amount===Math.round(Number(payment.amount)*100)&&entity.currency===payment.currency){
        if(payment.booking.status===BookingStatus.CANCELLED){
          const refundId=cancellationRefundId(entity.id);
          await tx.payment.update({where:{id:payment.id},data:{razorpayPaymentId:entity.id,status:PaymentStatus.REFUND_PENDING,gatewayReference:event as Prisma.InputJsonValue}});
          await tx.booking.updateMany({where:{id:payment.bookingId,status:BookingStatus.CANCELLED},data:{status:BookingStatus.REFUND_PENDING}});
          await tx.refund.upsert({where:{id:refundId},create:{id:refundId,bookingId:payment.bookingId,amount:payment.amount,reason:"Payment captured after checkout cancellation",status:RefundStatus.PENDING},update:{}});
          await tx.notification.create({data:{userId:payment.booking.farmerId,type:"REFUND_PENDING",title:"Late payment refund started",body:`A payment for the cancelled ${payment.booking.equipment.name} checkout was captured. FarmRent has started a refund.`}});
          cancellationRefund={refundId,paymentId:entity.id};
        }else if(payment.booking.status===BookingStatus.PENDING_PAYMENT&&payment.status!==PaymentStatus.CAPTURED){
          await tx.payment.update({where:{id:payment.id},data:{razorpayPaymentId:entity.id,status:PaymentStatus.CAPTURED,gatewayReference:event as Prisma.InputJsonValue}});
          const changed=await tx.booking.updateMany({where:{id:payment.bookingId,status:BookingStatus.PENDING_PAYMENT},data:{status:BookingStatus.CONFIRMED,expiresAt:null}});
          if(changed.count)await tx.notification.createMany({data:[{userId:payment.booking.farmerId,type:"PAYMENT_CAPTURED",title:"Payment confirmed",body:`Your FarmRent booking for ${payment.booking.equipment.name} is confirmed.`},{userId:payment.booking.equipment.ownerId,type:"BOOKING_CONFIRMED",title:"New confirmed rental",body:`${payment.booking.equipment.name} has a paid rental booking.`}]});
        }
      }else if(event.event==="payment.failed"&&entity.status==="failed"&&payment.status!==PaymentStatus.CAPTURED){
        await tx.payment.update({where:{id:payment.id},data:{razorpayPaymentId:entity.id,status:PaymentStatus.FAILED,gatewayReference:event as Prisma.InputJsonValue}});
        await tx.notification.create({data:{userId:payment.booking.farmerId,type:"PAYMENT_FAILED",title:"Payment attempt was not completed",body:`Payment for ${payment.booking.equipment.name} was not captured. Retry checkout before the date hold expires.`}});
      }
      await tx.paymentWebhookEvent.update({where:{razorpayEventId:eventId},data:{processedAt:new Date()}});
    });
    if(cancellationRefund)await submitCancellationRefund(cancellationRefund.refundId,cancellationRefund.paymentId);
    res.status(200).json({received:true});
  }catch(error){
    if(error&&typeof error==="object"&&"code" in error&&error.code==="P2002"){
      try{
        const duplicateEvent=Buffer.isBuffer(req.body)?JSON.parse(req.body.toString("utf8")) as {event?:string;payload?:{payment?:{entity?:{id?:string;order_id?:string}}}}:undefined;
        const entity=duplicateEvent?.payload?.payment?.entity;
        if(duplicateEvent?.event==="payment.captured"&&entity?.id&&entity.order_id){
          const payment=await prisma.payment.findUnique({where:{razorpayOrderId:entity.order_id},include:{booking:true}});
          if(payment?.status===PaymentStatus.REFUND_PENDING&&payment.booking.status===BookingStatus.REFUND_PENDING){const refundId=cancellationRefundId(entity.id);await submitCancellationRefund(refundId,entity.id);}
        }
      }catch(retryError){next(retryError);return;}
      res.status(200).json({received:true,duplicate:true});return;
    }
    next(error);
  }
}
