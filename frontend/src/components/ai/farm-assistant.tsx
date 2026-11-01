"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, Bot, LoaderCircle, MapPin, Send, Sparkles, Tractor } from "lucide-react";
import { equipmentTypes, categorySlug } from "@/lib/equipment";

const api=process.env.NEXT_PUBLIC_API_URL;
type Recommendation={equipment_id:string;name:string;daily_rate_inr:number;score:number;explanation:string};
type Turn={role:"assistant"|"user";text:string;recommendations?:Recommendation[];mode?:"llm"|"grounded_fallback"};
function getAiError(payload:unknown){
  const body=payload as {error?:{code?:string;message?:string};detail?:string};
  if(body.error?.code==="AI_SERVICE_NOT_CONFIGURED")return "The API server has not loaded its AI service credentials. Restart the FarmRent backend so it reloads backend/.env.";
  if(body.error?.code==="AI_SERVICE_UNAVAILABLE")return "The API cannot reach the AI service. Start it from ai-service with: uvicorn app.main:app --reload --port 8000.";
  return body.error?.message||body.detail||"The FarmRent AI request failed. Check the API and AI service logs.";
}

export function FarmAssistant(){
  const {getToken}=useAuth();
  const [crop,setCrop]=useState("");const [acres,setAcres]=useState("5");const [district,setDistrict]=useState("");const [budget,setBudget]=useState("");const [category,setCategory]=useState("");
  const [prompt,setPrompt]=useState("");const [turns,setTurns]=useState<Turn[]>([{role:"assistant",text:"Tell me what you’re growing, how much land you farm, or what machine you need. I’ll look through active FarmRent listings and show real prices."}]);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function ask(message:string){
    const value=message.trim();if(!value||busy)return;setTurns(current=>[...current,{role:"user",text:value}]);setPrompt("");setError("");setBusy(true);
    try{const token=await getToken();if(!token)throw new Error("Sign in again to use the FarmRent assistant.");if(!api)throw new Error("FarmRent API is not configured.");const history=turns.slice(-8).map(turn=>({role:turn.role,content:turn.text}));const response=await fetch(`${api}/ai/assistant/chat`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({message:value,history})});const body=await response.json();if(!response.ok)throw new Error(getAiError(body));setTurns(current=>[...current,{role:"assistant",text:body.message,recommendations:body.recommendations,mode:body.mode}]);}
    catch(e){setError(e instanceof Error?e.message:"Could not contact the FarmRent AI service.");}
    finally{setBusy(false);}
  }
  async function recommend(event:FormEvent){
    event.preventDefault();setError("");setBusy(true);
    try{const token=await getToken();if(!token)throw new Error("Sign in again to use the FarmRent assistant.");if(!api)throw new Error("FarmRent API is not configured.");const response=await fetch(`${api}/ai/recommendations`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({crop:crop||null,land_acres:Number(acres),district:district||null,budget_per_day:budget?Number(budget):null,category:category||null})});const body=await response.json();if(!response.ok)throw new Error(getAiError(body));const text=body.recommendations.length?`Here are the best matches from ${body.recommendations.length} active listings. Recommendations use your selected land size, location, equipment type, and daily budget. Availability is checked when you choose rental dates.`:"No active marketplace listings match these requirements yet. Try changing the location, equipment type, or budget.";setTurns(current=>[...current,{role:"assistant",text,recommendations:body.recommendations,mode:body.mode}]);}
    catch(e){setError(e instanceof Error?e.message:"Could not load recommendations.");}
    finally{setBusy(false);}
  }
  return <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
    <form onSubmit={recommend} className="h-fit rounded-[24px] border border-[#e5ebe4] bg-white p-5 md:p-6">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf6e4] text-[#4d7c0f]"><Sparkles size={19}/></span><div><h2 className="text-base font-extrabold">Find the right equipment</h2><p className="text-xs text-[#78847a]">Personalized matches from active listings</p></div></div>
      <label className="mt-6 block text-xs font-semibold">Crop<input value={crop} onChange={e=>setCrop(e.target.value)} placeholder="e.g. wheat, rice, cotton" className="mt-2 h-11 w-full rounded-xl border border-[#e2e9e1] px-3 text-sm outline-none focus:border-[#78a45e]"/></label>
      <label className="mt-4 block text-xs font-semibold">Land size (acres)<input required type="number" min="0.1" max="10000" step="0.1" value={acres} onChange={e=>setAcres(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#e2e9e1] px-3 text-sm outline-none focus:border-[#78a45e]"/></label>
      <label className="mt-4 block text-xs font-semibold">Equipment type<select value={category} onChange={e=>setCategory(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#e2e9e1] bg-white px-3 text-sm"><option value="">Any type</option>{equipmentTypes.map(name=><option key={name} value={categorySlug(name)}>{name}</option>)}</select></label>
      <label className="mt-4 block text-xs font-semibold">District<input value={district} onChange={e=>setDistrict(e.target.value)} placeholder="e.g. Karnal" className="mt-2 h-11 w-full rounded-xl border border-[#e2e9e1] px-3 text-sm outline-none focus:border-[#78a45e]"/></label>
      <label className="mt-4 block text-xs font-semibold">Max daily budget (₹)<input type="number" min="1" value={budget} onChange={e=>setBudget(e.target.value)} placeholder="No limit" className="mt-2 h-11 w-full rounded-xl border border-[#e2e9e1] px-3 text-sm outline-none focus:border-[#78a45e]"/></label>
      <button disabled={busy} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#166534] px-5 py-3 text-sm font-bold text-white hover:bg-[#14532d] disabled:opacity-60">{busy?<LoaderCircle size={16} className="animate-spin"/>:<Sparkles size={16}/>}Recommend equipment</button>
      <p className="mt-3 text-[11px] leading-5 text-[#78847a]">Recommendations use FarmRent listing data. Rental availability is verified during checkout.</p>
    </form>
    <section className="flex min-h-[600px] flex-col overflow-hidden rounded-[24px] border border-[#e5ebe4] bg-white">
      <div className="flex items-center gap-3 border-b border-[#edf0ec] px-5 py-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#166534] text-white"><Bot size={20}/></span><div><h2 className="text-sm font-extrabold">FarmRent AI Assistant</h2><p className="text-[11px] text-[#78847a]">LLM chat · Live FarmRent listings</p></div><span className="ml-auto rounded-full bg-green-50 px-3 py-1 text-[10px] font-bold text-green-800">Ready</span></div>
      <div className="flex-1 space-y-4 overflow-y-auto bg-[#fbfcfa] p-4 md:p-5" aria-live="polite">{turns.map((turn,index)=><div key={`${turn.role}-${index}`} className={`max-w-[95%] rounded-2xl p-4 ${turn.role==="user"?"ml-auto bg-[#166534] text-white":"border border-[#edf0ec] bg-white text-[#26342a]"}`}><p className="whitespace-pre-wrap text-sm leading-6">{turn.text}</p>{turn.mode==="grounded_fallback"&&<p className="mt-2 text-[10px] text-[#879188]">Guided marketplace mode · Add AI_API_KEY to enable LLM responses.</p>}{turn.recommendations&&turn.recommendations.length>0&&<div className="mt-3 space-y-2">{turn.recommendations.map((item)=><Link key={item.equipment_id} href={`/equipment/${item.equipment_id}`} className="block rounded-xl border border-[#e7ece6] p-3 transition hover:border-[#8bac70] hover:bg-[#f8fbf6]"><div className="flex items-start justify-between gap-3"><span className="text-xs font-bold">{item.name}</span><span className="shrink-0 text-xs font-extrabold text-[#166534]">₹{item.daily_rate_inr.toLocaleString("en-IN")}/day</span></div><span className="mt-1 flex items-start gap-1 text-[10px] leading-4 text-[#718073]"><MapPin size={12} className="mt-0.5 shrink-0"/>{item.explanation}</span></Link>)}</div>}</div>)}{busy&&<div className="flex items-center gap-2 text-xs text-[#718073]"><LoaderCircle size={14} className="animate-spin"/>Checking current listings…</div>}</div>
      {error&&<p role="alert" className="mx-4 mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
      <div className="border-t border-[#edf0ec] p-4"><div className="mb-3 flex flex-wrap gap-2">{["Find a tractor under ₹3,000 per day","What equipment is available near me?","How do I book a machine?"].map(suggestion=><button key={suggestion} type="button" onClick={()=>void ask(suggestion)} disabled={busy} className="rounded-full border border-[#e2e9e1] px-3 py-2 text-[10px] font-medium text-[#536057] hover:bg-[#f5f8f3] disabled:opacity-50">{suggestion}</button>)}</div><form onSubmit={e=>{e.preventDefault();void ask(prompt)}} className="flex gap-2"><input value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={1000} placeholder="Ask about equipment, crops, budget, or bookings…" className="h-12 min-w-0 flex-1 rounded-xl border border-[#e2e9e1] px-4 text-sm outline-none focus:border-[#78a45e]"/><button aria-label="Send message" disabled={busy||!prompt.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#166534] text-white disabled:opacity-50"><Send size={17}/></button></form></div>
    </section>
  </div>;
}
