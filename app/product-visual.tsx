"use client";
import {useEffect,useState} from "react";
import {Gem,Flame,Package} from "lucide-react";
import {Product} from "@/lib/market";
export default function ProductVisual({product,small=false}:{product:Product;small?:boolean}) {
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[product.image]);
 const Icon=product.category==="Raw crystals"?Gem:product.category.startsWith("Incense")?Flame:Package;
 return product.image&&!failed?<img className={small?"inventory-photo":"catalog-photo"} src={product.image} alt={product.name} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<Icon aria-hidden="true"/>;
}
