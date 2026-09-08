export const categories = ["All goods", "Raw crystals", "Incense holders", "Incense sticks", "Other"] as const;
export type Product = { id: string; name: string; code: string; category: string; unit: string; price: number; stock: number; icon: string; version: number; stockTracked: number; available: number; archived: number; image: string; sourceUrl: string; sourceProductId: string; sourceVariantId: string };
export type CartLine = { product: Product; quantity: number };
export type SaleItem = { productId: string; name: string; code: string; quantity: number; price: number };
export type Sale = { reference?: string; shopName: string; id: string; number: number; createdAt: string; subtotal: number; discount: number; tax: number; total: number; taxRate: number; discountRate: number; payment: "cash" | "card"; tendered: number; items: SaleItem[] };
export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export function totals(lines: {price: number; quantity: number}[], discountRate: number, taxRate: number) {
 const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
 const discount = Math.round(subtotal * discountRate / 10000);
 const tax = Math.round((subtotal - discount) * taxRate / 10000);
 return {subtotal, discount, tax, total: subtotal - discount + tax};
}
export function decimalToCents(value: string): number | null {
 if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
 const [whole, part = ""] = value.trim().split(".");
 const result = Number(whole) * 100 + Number(part.padEnd(2, "0"));
 return Number.isSafeInteger(result) ? result : null;
}

export const stockLimit = (p:Product) => p.archived || !p.available ? 0 : p.stockTracked ? Math.min(p.stock,999) : 999;
export const stockLabel = (p:Product) => !p.available ? "Unavailable" : p.stockTracked ? (p.stock ? `${p.stock} units` : "Sold out") : "Count not set";

export function findProductByCode(products:Product[],value:string) {
 const code=value.trim();
 const exact=products.find(p=>p.code.toLowerCase()===code.toLowerCase()||p.sourceVariantId===code);
 if(exact)return exact;
 try { const url=new URL(code); if(url.hostname!=="shantivikasa.com"&&url.hostname!=="www.shantivikasa.com")return undefined; const variant=url.searchParams.get("variant");return products.find(p=>variant?p.sourceVariantId===variant:p.sourceUrl===`https://shantivikasa.com${url.pathname.replace(/\/$/,"")}`); }catch{return undefined;}
}
