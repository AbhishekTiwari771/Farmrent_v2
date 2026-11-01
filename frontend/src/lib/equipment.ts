export type Equipment = {
  id: string; name: string; brand: string; model: string; category: string;
  location: string; district: string; dailyRate: number; rating: number;
  reviews: number; condition: string; image: string; badge?: string; ownerName?:string; deliveryFee?:number; securityDeposit?:number; isDemo?: boolean; isSeededDemo?: boolean;
};

// Clearly labeled demonstration inventory; replace with GET /api/v1/equipment in phase 2.
export const equipment: Equipment[] = [
  { id:"eq-1",name:"Mahindra Arjun Novo 605 DI-i",brand:"Mahindra",model:"Arjun Novo 605 DI-i",category:"Tractors",location:"Nashik, Maharashtra",district:"Nashik",dailyRate:4200,rating:4.9,reviews:18,condition:"Excellent",image:"https://images.unsplash.com/photo-1630394257979-0104638432aa?auto=format&fit=crop&w=1200&q=85",isDemo:true },
  { id:"eq-2",name:"John Deere 5310 with rotavator",brand:"John Deere",model:"5310",category:"Tractors",location:"Ludhiana, Punjab",district:"Ludhiana",dailyRate:5600,rating:4.8,reviews:12,condition:"Excellent",image:"https://images.unsplash.com/photo-1700158138836-2f278d00e062?auto=format&fit=crop&w=1200&q=85",isDemo:true },
  { id:"eq-3",name:"Shaktiman Regular Smart 180",brand:"Shaktiman",model:"Regular Smart 180",category:"Rotavators",location:"Jaipur, Rajasthan",district:"Jaipur",dailyRate:1800,rating:4.7,reviews:9,condition:"Very good",image:"https://images.unsplash.com/photo-1684677806628-22a9811e52bc?auto=format&fit=crop&w=1200&q=85",isDemo:true },
  { id:"eq-4",name:"Swaraj 744 FE Harvester",brand:"Swaraj",model:"744 FE",category:"Harvesters",location:"Karnal, Haryana",district:"Karnal",dailyRate:7800,rating:4.9,reviews:24,condition:"Excellent",image:"https://images.unsplash.com/photo-1764323064945-d064c30742b8?auto=format&fit=crop&w=1200&q=85",isDemo:true },
  { id:"eq-5",name:"Shree Umiya Precision Seed Drill",brand:"Shree Umiya",model:"SD-11",category:"Seed drills",location:"Ahmedabad, Gujarat",district:"Ahmedabad",dailyRate:2200,rating:4.6,reviews:7,condition:"Very good",image:"https://images.unsplash.com/photo-1706862609885-7771b001daa2?auto=format&fit=crop&w=1200&q=85",isDemo:true },
  { id:"eq-6",name:"Fieldking Boom Sprayer 600L",brand:"Fieldking",model:"FKBS-600",category:"Sprayers",location:"Indore, Madhya Pradesh",district:"Indore",dailyRate:1400,rating:4.8,reviews:14,condition:"Excellent",image:"https://images.unsplash.com/photo-1755931359594-852c73c6609c?auto=format&fit=crop&w=1200&q=85",isDemo:true },
];

export const equipmentTypes = [
  "Tractors","Power Tillers","Harvesters","Combine Harvesters","Reapers",
  "Rotavators","Cultivators","Ploughs","Harrows","Land Levelers","Bed Makers and Ridgers",
  "Seed Drills","Precision Planters","Rice Transplanters","Potato and Root Crop Equipment","Sugarcane Equipment",
  "Fertilizer Spreaders","Sprayers","Dusters","Mechanical Weeders","Orchard Equipment",
  "Mowers","Hay Rakes and Balers","Chaff Cutters","Straw Reapers","Threshers","Shellers",
  "Trolleys and Trailers","Irrigation Equipment","Irrigation Pumps","Drip Irrigation Systems","Sprinkler Irrigation Systems","Water Tankers and Bowsers","Generators",
  "Grain Cleaners and Graders","Grain Dryers","Rice Mills","Oil Expellers","Post-Harvest Processing Equipment",
  "Dairy Equipment","Livestock Equipment","Other Agricultural Machinery",
];

export const categorySlug = (name:string) => name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
export const categories = ["All equipment", ...equipmentTypes];

export function mapEquipmentRecord(row:Record<string,unknown>):Equipment{
  const category=row.category as {name?:string}|undefined;
  const images=row.images as Array<{url?:string}>|undefined;
  const owner=row.owner as {isVerified?:boolean;name?:string}|undefined;
  return {
    id:String(row.id),name:String(row.name),brand:String(row.brand||""),model:String(row.model||""),
    category:category?.name||"Equipment",location:[row.district,row.state].filter(Boolean).join(", "),district:String(row.district||""),
    dailyRate:Number(row.dailyRate),rating:Number(row.rating||0),reviews:Number(row.reviews??row.reviewCount??0),
    deliveryFee:Number(row.deliveryFee||0),securityDeposit:Number(row.securityDeposit||0),
    condition:String(row.condition||"Not specified"),image:images?.[0]?.url||equipment[0].image,
    badge:owner?.isVerified?"Owner verified":undefined,ownerName:owner?.name,isSeededDemo:Boolean(row.isSeededDemo),
  };
}
