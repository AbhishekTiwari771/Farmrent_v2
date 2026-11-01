import { PrismaClient } from "@prisma/client";

const prisma=new PrismaClient();
const categories=[
  "Tractors","Power Tillers","Harvesters","Combine Harvesters","Reapers",
  "Rotavators","Cultivators","Ploughs","Harrows","Land Levelers","Bed Makers and Ridgers",
  "Seed Drills","Precision Planters","Rice Transplanters","Potato and Root Crop Equipment","Sugarcane Equipment",
  "Fertilizer Spreaders","Sprayers","Dusters","Mechanical Weeders","Orchard Equipment",
  "Mowers","Hay Rakes and Balers","Chaff Cutters","Straw Reapers","Threshers","Shellers",
  "Trolleys and Trailers","Irrigation Equipment","Irrigation Pumps","Drip Irrigation Systems","Sprinkler Irrigation Systems","Water Tankers and Bowsers","Generators",
  "Grain Cleaners and Graders","Grain Dryers","Rice Mills","Oil Expellers","Post-Harvest Processing Equipment",
  "Dairy Equipment","Livestock Equipment","Other Agricultural Machinery",
];

async function main(){
  for(const name of categories){
    const slug=name.toLowerCase().replaceAll(" ","-");
    await prisma.category.upsert({where:{slug},create:{name,slug},update:{name}});
  }

  const demos=[
    {id:"10000000-0000-4000-8000-000000000001",ownerId:"20000000-0000-4000-8000-000000000001",ownerName:"FarmRent Demo Owner · Nashik",email:"demo-owner-nashik@farmrent.example",clerkId:"farmrent_seed_demo_owner_nashik_v1",name:"Mahindra Arjun Novo 605 DI-i",brand:"Mahindra",model:"Arjun Novo 605 DI-i",category:"tractors",description:"Seeded FarmRent demonstration listing for a Mahindra Arjun Novo 605 DI-i tractor. Use this sample record to explore marketplace search, equipment details and filters in a college demonstration.",dailyRate:4200,condition:"Excellent",district:"Nashik",state:"Maharashtra",image:"https://images.unsplash.com/photo-1630394257979-0104638432aa?auto=format&fit=crop&w=1200&q=85"},
    {id:"10000000-0000-4000-8000-000000000002",ownerId:"20000000-0000-4000-8000-000000000002",ownerName:"FarmRent Demo Owner · Ludhiana",email:"demo-owner-ludhiana@farmrent.example",clerkId:"farmrent_seed_demo_owner_ludhiana_v1",name:"John Deere 5310 with rotavator",brand:"John Deere",model:"5310",category:"tractors",description:"Seeded FarmRent demonstration listing for a John Deere 5310 tractor with rotavator. Use this sample record to explore marketplace search, equipment details and filters in a college demonstration.",dailyRate:5600,condition:"Excellent",district:"Ludhiana",state:"Punjab",image:"https://images.unsplash.com/photo-1700158138836-2f278d00e062?auto=format&fit=crop&w=1200&q=85"},
    {id:"10000000-0000-4000-8000-000000000003",ownerId:"20000000-0000-4000-8000-000000000003",ownerName:"FarmRent Demo Owner · Jaipur",email:"demo-owner-jaipur@farmrent.example",clerkId:"farmrent_seed_demo_owner_jaipur_v1",name:"Shaktiman Regular Smart 180",brand:"Shaktiman",model:"Regular Smart 180",category:"rotavators",description:"Seeded FarmRent demonstration listing for a Shaktiman Regular Smart 180 rotavator. Use this sample record to explore marketplace search, equipment details and filters in a college demonstration.",dailyRate:1800,condition:"Very good",district:"Jaipur",state:"Rajasthan",image:"https://images.unsplash.com/photo-1684677806628-22a9811e52bc?auto=format&fit=crop&w=1200&q=85"},
    {id:"10000000-0000-4000-8000-000000000004",ownerId:"20000000-0000-4000-8000-000000000004",ownerName:"FarmRent Demo Owner · Karnal",email:"demo-owner-karnal@farmrent.example",clerkId:"farmrent_seed_demo_owner_karnal_v1",name:"Swaraj 744 FE Harvester",brand:"Swaraj",model:"744 FE",category:"harvesters",description:"Seeded FarmRent demonstration listing for a Swaraj 744 FE harvester. Use this sample record to explore marketplace search, equipment details and filters in a college demonstration.",dailyRate:7800,condition:"Excellent",district:"Karnal",state:"Haryana",image:"https://images.unsplash.com/photo-1764323064945-d064c30742b8?auto=format&fit=crop&w=1200&q=85"},
    {id:"10000000-0000-4000-8000-000000000005",ownerId:"20000000-0000-4000-8000-000000000005",ownerName:"FarmRent Demo Owner · Ahmedabad",email:"demo-owner-ahmedabad@farmrent.example",clerkId:"farmrent_seed_demo_owner_ahmedabad_v1",name:"Shree Umiya Precision Seed Drill",brand:"Shree Umiya",model:"SD-11",category:"seed-drills",description:"Seeded FarmRent demonstration listing for a Shree Umiya precision seed drill. Use this sample record to explore marketplace search, equipment details and filters in a college demonstration.",dailyRate:2200,condition:"Very good",district:"Ahmedabad",state:"Gujarat",image:"https://images.unsplash.com/photo-1706862609885-7771b001daa2?auto=format&fit=crop&w=1200&q=85"},
    {id:"10000000-0000-4000-8000-000000000006",ownerId:"20000000-0000-4000-8000-000000000006",ownerName:"FarmRent Demo Owner · Indore",email:"demo-owner-indore@farmrent.example",clerkId:"farmrent_seed_demo_owner_indore_v1",name:"Fieldking Boom Sprayer 600L",brand:"Fieldking",model:"FKBS-600",category:"sprayers",description:"Seeded FarmRent demonstration listing for a Fieldking Boom Sprayer 600L. Use this sample record to explore marketplace search, equipment details and filters in a college demonstration.",dailyRate:1400,condition:"Excellent",district:"Indore",state:"Madhya Pradesh",image:"https://images.unsplash.com/photo-1755931359594-852c73c6609c?auto=format&fit=crop&w=1200&q=85"},
  ];
  for(const row of demos){
    await prisma.user.upsert({where:{clerkId:row.clerkId},create:{id:row.ownerId,clerkId:row.clerkId,email:row.email,name:row.ownerName,roles:["OWNER"],district:row.district,state:row.state},update:{name:row.ownerName,district:row.district,state:row.state}});
    const category=await prisma.category.findUniqueOrThrow({where:{slug:row.category},select:{id:true}});
    await prisma.equipment.upsert({where:{id:row.id},create:{id:row.id,ownerId:row.ownerId,categoryId:category.id,name:row.name,brand:row.brand,model:row.model,description:row.description,dailyRate:row.dailyRate,condition:row.condition,district:row.district,state:row.state,status:"ACTIVE",isSeededDemo:true,images:{create:{url:row.image,publicId:`farmrent-demo/${row.id}`,position:0}}},update:{ownerId:row.ownerId,categoryId:category.id,name:row.name,brand:row.brand,model:row.model,description:row.description,dailyRate:row.dailyRate,condition:row.condition,district:row.district,state:row.state,status:"ACTIVE",isSeededDemo:true,images:{deleteMany:{},create:{url:row.image,publicId:`farmrent-demo/${row.id}`,position:0}}}});
  }
  console.log(`Seeded ${categories.length} equipment categories and ${demos.length} clearly identified demonstration listings.`);
}

main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>prisma.$disconnect());
