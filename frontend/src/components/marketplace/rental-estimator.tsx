"use client";
import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";

export function RentalEstimator({dailyRate}:{dailyRate:number}){
  const [start,setStart]=useState("");const [end,setEnd]=useState("");
  const days=useMemo(()=>{if(!start||!end)return 0;const span=(new Date(`${end}T00:00:00`).getTime()-new Date(`${start}T00:00:00`).getTime())/86400000;return span>0?span:0},[start,end]);
  const today=new Date().toISOString().slice(0,10);
  return <div className="mt-5 rounded-xl bg-[#f5f8f3] p-4"><p className="flex items-center gap-2 text-xs font-bold"><CalendarDays size={15} className="text-[#4d7c0f]"/> Estimate your rental</p><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[10px] font-semibold text-[#7b867d]">START DATE<input type="date" min={today} value={start} onChange={e=>setStart(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e1e8df] bg-white p-2 text-xs"/></label><label className="text-[10px] font-semibold text-[#7b867d]">END DATE<input type="date" min={start||today} value={end} onChange={e=>setEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e1e8df] bg-white p-2 text-xs"/></label></div>{start&&end&&!days&&<p className="mt-2 text-[10px] font-medium text-rose-700">Choose an end date after the start date.</p>}{days>0&&<div className="mt-3 flex items-center justify-between border-t border-[#e1e8df] pt-3 text-xs"><span className="text-[#657166]">{days} rental {days===1?"day":"days"} × ₹{dailyRate.toLocaleString("en-IN")}</span><strong className="text-sm text-[#166534]">₹{(days*dailyRate).toLocaleString("en-IN")}</strong></div>}</div>
}
