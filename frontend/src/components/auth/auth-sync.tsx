"use client";
import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

export function AuthSync(){
  const {isSignedIn,getToken}=useAuth();
  useEffect(()=>{
    const api=process.env.NEXT_PUBLIC_API_URL;
    if(!isSignedIn||!api)return;
    let cancelled=false;
    void getToken().then(token=>{
      if(!token||cancelled)return;
      return fetch(`${api}/users/me`,{headers:{Authorization:`Bearer ${token}`}}).then(response=>{
        if(!response.ok&&!cancelled)window.dispatchEvent(new CustomEvent("farmrent:profile-sync-error",{detail:response.status}));
      });
    }).catch(()=>{if(!cancelled)window.dispatchEvent(new CustomEvent("farmrent:profile-sync-error"));});
    return()=>{cancelled=true;};
  },[isSignedIn,getToken]);
  return null;
}
