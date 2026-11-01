"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { CalendarDays, LoaderCircle, MapPin, ShieldCheck } from "lucide-react";
import type { Equipment } from "@/lib/equipment";

const api=process.env.NEXT_PUBLIC_API_URL;
const dateText=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const tomorrow=()=>{const date=new Date();date.setDate(date.getDate()+1);return dateText(date);};
type Quote={equipmentName:string;days:number;currency:string;baseRental:number;deliveryFee:number;platformFee:number;taxes:number;discount:number;securityDeposit:number;total:number};
type Order={bookingId:string;equipmentName:string;customerName:string;customerEmail:string;orderId:string;keyId:string;amount:number;currency:string;days:number;expiresAt:string;lineItems:Omit<Quote,"equipmentName"|"days"|"currency">};
type Verified={bookingId:string;status:string;paymentStatus:string};
type CheckoutResponse={razorpay_payment_id:string;razorpay_order_id:string;razorpay_signature:string};
type CheckoutOptions={key:string;amount:number;currency:string;name:string;description:string;order_id:string;prefill:{name:string;email:string};theme:{color:string};handler:(response:CheckoutResponse)=>void;modal:{ondismiss:()=>void}};
type RazorpayInstance={open:()=>void;on:(event:"payment.failed",callback:(response:{error?:{description?:string}})=>void)=>void};
declare global{interface Window{Razorpay?:new(options:CheckoutOptions)=>RazorpayInstance}}

async function ensureCheckoutScript(){
  if(window.Razorpay)return;
  await new Promise<void>((resolve,reject)=>{
    const existing=document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if(existing?.dataset.loaded==="true"){resolve();return;}
    if(existing){existing.addEventListener("load",()=>resolve(),{once:true});existing.addEventListener("error",()=>reject(new Error("Could not load Razorpay Checkout")),{once:true});return;}
    const script=document.createElement("script");script.src="https://checkout.razorpay.com/v1/checkout.js";script.async=true;script.onload=()=>{script.dataset.loaded="true";resolve();};script.onerror=()=>reject(new Error("Could not load Razorpay Checkout"));document.body.appendChild(script);
  });
  if(!window.Razorpay)throw new Error("Razorpay Checkout is unavailable. Refresh and try again.");
}

export function RentalRequest({item}:{item:Equipment}){
  const {isSignedIn,getToken}=useAuth();const [startDate,setStartDate]=useState(tomorrow);const [endDate,setEndDate]=useState(tomorrow);const [deliveryMode,setDeliveryMode]=useState<"PICKUP"|"DELIVERY">("PICKUP");const [deliveryAddress,setDeliveryAddress]=useState("");const [rentalNotes,setRentalNotes]=useState("");
  const [quote,setQuote]=useState<Quote|null>(null);const [quoteBusy,setQuoteBusy]=useState(false);const [quoteError,setQuoteError]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [verified,setVerified]=useState<Verified|null>(null);const [pendingOrder,setPendingOrder]=useState<Order|null>(null);
  const minDate=tomorrow();
  const payload=()=>({equipmentId:item.id,startDate,endDate,deliveryMode,...(deliveryMode==="DELIVERY"?{deliveryAddress}:{}),...(rentalNotes.trim()?{rentalNotes:rentalNotes.trim()}: {})});
  const refreshQuote=useCallback(async()=>{
    if(pendingOrder){setQuote({equipmentName:pendingOrder.equipmentName,days:pendingOrder.days,currency:pendingOrder.currency,...pendingOrder.lineItems});setQuoteError("");setQuoteBusy(false);return;}
    if(!api||!isSignedIn||!startDate||!endDate||endDate<startDate||(deliveryMode==="DELIVERY"&&!deliveryAddress.trim())){setQuote(null);setQuoteBusy(false);setQuoteError("");return;}
    setQuoteBusy(true);setQuoteError("");
    try{const token=await getToken();if(!token)throw new Error("Sign in again to review the rental price.");const response=await fetch(`${api}/payments/quote`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload())});const body=await response.json();if(!response.ok)throw new Error(body.error?.message||"Price could not be calculated.");setQuote(body.data as Quote);}
    catch(e){setQuote(null);setQuoteError(e instanceof Error?e.message:"Price could not be calculated.");}
    finally{setQuoteBusy(false);}
  },[getToken,isSignedIn,item.id,startDate,endDate,deliveryMode,deliveryAddress,rentalNotes,pendingOrder]);
  useEffect(()=>{const timer=setTimeout(()=>void refreshQuote(),300);return()=>clearTimeout(timer)},[refreshQuote]);

  async function checkout(){
    setError("");setVerified(null);setBusy(true);
    try{
      if(!api)throw new Error("The FarmRent API is not configured.");const token=await getToken();if(!token)throw new Error("Sign in to continue to payment.");
      let order=pendingOrder;
      if(!order){const response=await fetch(`${api}/payments/orders`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload())});const body=await response.json();if(!response.ok)throw new Error(body.error?.message||"Could not prepare secure checkout.");order=body.data as Order;
        if(quote&&Math.round(order.lineItems.total*100)!==Math.round(quote.total*100)){setPendingOrder(order);setQuote({equipmentName:order.equipmentName,days:order.days,currency:order.currency,...order.lineItems});throw new Error("The server price changed. Review the updated total, then continue to payment.");}
        setPendingOrder(order);
      }
      await ensureCheckoutScript();
      const checkout=new window.Razorpay!({key:order.keyId,amount:order.amount,currency:order.currency,name:"FarmRent",description:`${order.equipmentName} · ${order.days} day${order.days===1?"":"s"}`,order_id:order.orderId,prefill:{name:order.customerName,email:order.customerEmail},theme:{color:"#166534"},modal:{ondismiss:()=>setBusy(false)},handler:async(payment)=>{
        try{const verificationToken=await getToken();if(!verificationToken)throw new Error("Your sign-in session expired after payment. Do not pay again; sign in and use Check payment status in My bookings.");const verifyResponse=await fetch(`${api}/payments/verify`,{method:"POST",headers:{Authorization:`Bearer ${verificationToken}`,"Content-Type":"application/json"},body:JSON.stringify({bookingId:order.bookingId,razorpay_order_id:payment.razorpay_order_id,razorpay_payment_id:payment.razorpay_payment_id,razorpay_signature:payment.razorpay_signature})});const result=await verifyResponse.json();if(!verifyResponse.ok)throw new Error(verifyResponse.status===401?"Your sign-in session expired after payment. Do not pay again; sign in and use Check payment status in My bookings.":result.error?.message||"Payment verification failed.");setVerified(result.data as Verified);setPendingOrder(null);}
        catch(e){setError(e instanceof Error?e.message:"Payment verification failed. Do not pay again; check My bookings for the latest status.");}
        finally{setBusy(false);}
      }});
      checkout.on("payment.failed",event=>{setError(event.error?.description||"Razorpay could not complete the payment. No booking is confirmed.");setBusy(false);});checkout.open();
    }catch(e){setError(e instanceof Error?e.message:"Checkout could not be started.");setBusy(false);}
  }
  if(item.isDemo)return <div className="mt-4 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">This photo example is not a rental listing. Owners can publish real equipment from the owner studio.</div>;
  return <div className="mt-4 border-t border-[#edf0ec] pt-4">
    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[#69766c]"><CalendarDays size={13}/>Choose rental dates</div>
    <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] font-semibold text-[#69766c]">Start date<input disabled={Boolean(pendingOrder)} type="date" min={minDate} value={startDate} onChange={e=>setStartDate(e.target.value)} className="mt-1.5 block w-full rounded-lg border border-[#e2e9e1] bg-white p-2 text-xs text-[#26372b] disabled:opacity-60"/></label><label className="text-[10px] font-semibold text-[#69766c]">End date<input disabled={Boolean(pendingOrder)} type="date" min={startDate||minDate} value={endDate} onChange={e=>setEndDate(e.target.value)} className="mt-1.5 block w-full rounded-lg border border-[#e2e9e1] bg-white p-2 text-xs text-[#26372b] disabled:opacity-60"/></label></div>
    <label className="mt-3 block text-[10px] font-semibold text-[#69766c]">Equipment handover<select disabled={Boolean(pendingOrder)} value={deliveryMode} onChange={e=>setDeliveryMode(e.target.value as "PICKUP"|"DELIVERY")} className="mt-1.5 block w-full rounded-lg border border-[#e2e9e1] bg-white p-2.5 text-xs text-[#26372b] disabled:opacity-60"><option value="PICKUP">I’ll pick it up from the owner</option><option value="DELIVERY">Deliver it to my farm</option></select></label>
    {deliveryMode==="DELIVERY"&&<label className="mt-3 block text-[10px] font-semibold text-[#69766c]">Farm delivery address<textarea disabled={Boolean(pendingOrder)} value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)} rows={2} maxLength={500} placeholder="Village, road and delivery instructions" className="mt-1.5 block w-full resize-y rounded-lg border border-[#e2e9e1] bg-white p-2.5 text-xs text-[#26372b] disabled:opacity-60"/></label>}
    <label className="mt-3 block text-[10px] font-semibold text-[#69766c]">Notes for the owner <span className="font-normal">(optional)</span><textarea disabled={Boolean(pendingOrder)} value={rentalNotes} onChange={e=>setRentalNotes(e.target.value)} rows={2} maxLength={1000} placeholder="Crop, field access or equipment setup details" className="mt-1.5 block w-full resize-y rounded-lg border border-[#e2e9e1] bg-white p-2.5 text-xs text-[#26372b] disabled:opacity-60"/></label>
    {quoteBusy?<p className="mt-3 flex items-center gap-2 text-[11px] text-[#78847a]"><LoaderCircle size={13} className="animate-spin"/>Checking dates and calculating your price…</p>:quote&&<div className="mt-3 rounded-xl bg-[#f5f8f3] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#69766c]">Price breakdown · {quote.days} day{quote.days===1?"":"s"}</p><div className="mt-2 space-y-1.5 text-[11px] text-[#69766c]"><p className="flex justify-between"><span>Equipment rental</span><span>₹{quote.baseRental.toLocaleString("en-IN")}</span></p><p className="flex justify-between"><span>Delivery</span><span>₹{quote.deliveryFee.toLocaleString("en-IN")}</span></p><p className="flex justify-between"><span>FarmRent service fee</span><span>₹{quote.platformFee.toLocaleString("en-IN")}</span></p>{quote.securityDeposit>0&&<p className="flex justify-between"><span>Security deposit</span><span>₹{quote.securityDeposit.toLocaleString("en-IN")}</span></p>}<p className="flex justify-between border-t border-[#dfe8dc] pt-2 font-extrabold text-[#26372b]"><span>Total payable</span><span>₹{quote.total.toLocaleString("en-IN")}</span></p></div></div>}
    {item.isSeededDemo&&<p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-[10px] leading-4 text-amber-900">College demo listing: the sample owner and rate are fictional. Use Razorpay test mode only.</p>}
    {pendingOrder&&<p className="mt-2 text-[10px] text-[#78847a]">Your selected dates are held for checkout. Reopen the same payment if you closed the window.</p>}
    {isSignedIn?<button disabled={busy||quoteBusy||!quote||Boolean(quoteError)||(deliveryMode==="DELIVERY"&&!deliveryAddress.trim())} onClick={()=>void checkout()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#166534] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy?<LoaderCircle size={15} className="animate-spin"/>:<ShieldCheck size={15}/>} {busy?"Opening secure checkout…":pendingOrder?"Resume payment":"Continue to secure payment"}</button>:<Link href={`/sign-in?redirect_url=${encodeURIComponent(`/equipment/${item.id}`)}`} className="mt-3 inline-flex w-full justify-center rounded-full bg-[#166534] px-5 py-3 text-sm font-bold text-white">Sign in to rent</Link>}
    <p className="mt-2 text-center text-[10px] leading-4 text-[#89938b]">Your booking is confirmed after Razorpay payment verification. No payment details are stored by FarmRent.</p>
    {quoteError&&<p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{quoteError}</p>}{error&&<div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900"><p className="font-bold">Payment not confirmed</p><p className="mt-1">{error}</p><p className="mt-2">FarmRent will show the booking as successful only after payment verification. You can retry checkout above or check your bookings for the latest status.</p><Link className="mt-2 inline-flex font-semibold underline" href="/farmer/bookings">Check my bookings</Link></div>}
    {verified&&<div role="status" className="mt-3 rounded-xl border border-green-200 bg-green-50 p-4 text-xs text-green-950"><p className="font-bold text-sm">Booking successful</p><p className="mt-1">Razorpay payment verified. Your {item.name} rental is confirmed.</p><p className="mt-1 text-green-800">Booking reference: #{verified.bookingId.slice(0,8)}</p><Link className="mt-3 inline-flex rounded-full bg-[#166534] px-4 py-2 font-semibold text-white" href="/farmer/bookings">View booking details</Link></div>}
    <p className="mt-3 flex items-start gap-1.5 text-[9px] leading-4 text-[#89938b]"><MapPin size={11} className="mt-0.5 shrink-0"/>Farm delivery and pickup details are shared with the equipment owner after checkout.</p>
  </div>;
}
