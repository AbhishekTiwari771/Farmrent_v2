"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { CalendarDays, LoaderCircle, RefreshCw, Tractor, Trash2 } from "lucide-react";

const api=process.env.NEXT_PUBLIC_API_URL;
type RequestRow={id:string;status:string;startDate:string;endDate:string;total:number;createdAt:string;expiresAt:string|null;equipment:{id:string;name:string;district:string;state:string}};
type ActionMessage={kind:"error"|"success";message:string};
const labels:Record<string,string>={PENDING_OWNER_APPROVAL:"Waiting for owner",CONFIRMED:"Paid · confirmed",REJECTED:"Declined",CANCELLED:"Cancelled",COMPLETED:"Completed",ACTIVE:"Rental active",PENDING_PAYMENT:"Payment required",PAYMENT_FAILED:"Payment failed",REFUNDED:"Refunded"};

export function RentalRequests(){
  const {getToken}=useAuth();
  const [rows,setRows]=useState<RequestRow[]>([]);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [removingId,setRemovingId]=useState("");
  const [checkingId,setCheckingId]=useState("");
  const [messages,setMessages]=useState<Record<string,ActionMessage|undefined>>({});

  useEffect(()=>{
    let alive=true;
    async function load(){
      try{
        const token=await getToken();
        if(!api||!token)throw new Error("Sign in again to load your bookings.");
        const response=await fetch(`${api}/bookings/mine`,{headers:{Authorization:`Bearer ${token}`}});
        const body=await response.json();
        if(!response.ok)throw new Error(body.error?.message||"Bookings could not be loaded.");
        if(alive)setRows(body.data);
      }catch(e){if(alive)setError(e instanceof Error?e.message:"Could not load bookings.");}
      finally{if(alive)setBusy(false);}
    }
    void load();
    return()=>{alive=false;};
  },[getToken]);

  async function checkPayment(row:RequestRow){
    setCheckingId(row.id);setMessages(current=>({...current,[row.id]:undefined}));
    try{
      const token=await getToken();
      if(!api||!token)throw new Error("Your sign-in session expired. Sign in again, then check payment status.");
      const response=await fetch(`${api}/payments/reconcile`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({bookingId:row.id})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error?.message||"Payment status could not be checked.");
      setRows(current=>current.map(item=>item.id===row.id?{...item,status:body.data.status,expiresAt:null}:item));
      setMessages(current=>({...current,[row.id]:{kind:"success",message:"Payment verified. Your booking is confirmed."}}));
    }catch(e){setMessages(current=>({...current,[row.id]:{kind:"error",message:e instanceof Error?e.message:"Payment status could not be checked."}}));}
    finally{setCheckingId("");}
  }

  async function removeBooking(id:string){
    const row=rows.find(item=>item.id===id);
    if(!row)return;
    const confirmation=row.status==="PENDING_PAYMENT"
      ?"Cancel this unpaid checkout? FarmRent will check Razorpay first. If no payment was captured, the checkout will be cancelled and dates released. If payment was captured, the booking will stay confirmed."
      :row.status==="PENDING_OWNER_APPROVAL"
        ?"Cancel this rental request and release its date hold?"
        :["CONFIRMED","ACTIVE"].includes(row.status)
          ?"Hide this booking from your list? The paid rental stays active and its dates remain booked. This does not issue a refund."
          :"Delete this booking from your list? Booking and payment records are retained for history.";
    if(!window.confirm(confirmation))return;
    setRemovingId(id);setMessages(current=>({...current,[id]:undefined}));
    try{
      const token=await getToken();
      if(!api||!token)throw new Error("Sign in again to remove this booking.");
      const isPaymentHold=row.status==="PENDING_PAYMENT";
      const response=await fetch(isPaymentHold?`${api}/payments/cancel-checkout`:`${api}/bookings/${id}`,{method:isPaymentHold?"POST":"DELETE",headers:{Authorization:`Bearer ${token}`,...(isPaymentHold?{"Content-Type":"application/json"}:{})},...(isPaymentHold?{body:JSON.stringify({bookingId:id})}:{})});
      const body=await response.json();
      if(response.status===409&&body.error?.code==="PAYMENT_ALREADY_COMPLETED"){
        setRows(current=>current.map(item=>item.id===id?{...item,status:"CONFIRMED",expiresAt:null}:item));
        setMessages(current=>({...current,[id]:{kind:"success",message:"Razorpay captured this payment. The booking is confirmed and the dates were not released."}}));
        return;
      }
      if(!response.ok)throw new Error(body.error?.message||"This booking could not be removed.");
      setRows(current=>current.filter(row=>row.id!==id));
    }catch(e){setMessages(current=>({...current,[id]:{kind:"error",message:e instanceof Error?e.message:"This booking could not be removed."}}));}
    finally{setRemovingId("");}
  }

  if(busy)return <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#68766b]"><LoaderCircle size={17} className="animate-spin"/> Loading bookings</div>;
  if(error)return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>;
  if(!rows.length)return <div className="rounded-2xl border border-dashed border-[#ccd8ca] bg-white px-6 py-14 text-center"><Tractor size={25} className="mx-auto text-[#6d8b5b]"/><h2 className="mt-4 text-lg font-bold">No bookings yet</h2><p className="mt-2 text-sm text-[#78847a]">Explore equipment to start a rental.</p><Link href="/equipment" className="mt-5 inline-flex rounded-full bg-[#166534] px-5 py-3 text-xs font-bold text-white">Explore equipment</Link></div>;

  return <div className="space-y-3">{rows.map(row=>{
    const expired=row.expiresAt&&new Date(row.expiresAt)<=new Date();
    const message=messages[row.id];
    return <article key={row.id} className="rounded-2xl border border-[#e6ece5] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/equipment/${row.equipment.id}`} className="font-bold hover:text-[#166534]">{row.equipment.name}</Link><p className="mt-1 text-xs text-[#78847a]">{row.equipment.district}, {row.equipment.state}</p></div><span className="rounded-full bg-[#eef6e6] px-3 py-1.5 text-[10px] font-bold text-[#456d32]">{expired&&row.status==="PENDING_PAYMENT"?"Checkout expired":row.status==="PENDING_OWNER_APPROVAL"&&expired?"Request expired":labels[row.status]||row.status}</span></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#edf0ec] pt-3 text-xs text-[#69766c]"><span className="inline-flex items-center gap-2"><CalendarDays size={14}/>{new Date(row.startDate).toLocaleDateString("en-IN")} – {new Date(row.endDate).toLocaleDateString("en-IN")}</span><strong className="text-[#26372b]">{row.status==="CONFIRMED"?"Paid":"Total"} ₹{Number(row.total).toLocaleString("en-IN")}</strong></div>
      {row.status==="CONFIRMED"&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">Razorpay verified your payment. Coordinate equipment handover details with the owner.</p>}
      {row.status==="PENDING_PAYMENT"&&<div className="mt-4 border-t border-[#edf0ec] pt-3"><p className="text-xs text-[#68766b]">If Razorpay showed a successful payment but this booking is still pending, check its status here. This will not charge you again.</p><button disabled={checkingId===row.id} onClick={()=>void checkPayment(row)} className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#c9d9c7] px-3.5 py-2 text-xs font-semibold text-[#315d32] hover:bg-[#f3f8f0] disabled:opacity-50"><RefreshCw size={13} className={checkingId===row.id?"animate-spin":""}/>{checkingId===row.id?"Checking Razorpay…":"Check payment status"}</button></div>}
      <div className="mt-4 flex justify-end border-t border-[#edf0ec] pt-3"><button disabled={removingId===row.id} onClick={()=>void removeBooking(row.id)} className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={13}/>{removingId===row.id?"Deleting…":"Delete booking"}</button></div>
      {message&&<p role={message.kind==="error"?"alert":"status"} className={`mt-3 rounded-lg p-3 text-xs ${message.kind==="error"?"bg-rose-50 text-rose-800":"bg-green-50 text-green-900"}`}>{message.message}</p>}
    </article>;
  })}</div>;
}
