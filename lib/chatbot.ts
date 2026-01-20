import {
  searchProducts,
  getRelatedProducts,
  getComprehensiveWebsiteData,
  fetchProductDetails,
  Product,
} from "./scraper";

import OpenAI from "openai";
import { searchKnowledge } from "./knowledgeData";
import knowledgeAll from "../src/data/knowledge.json"; // ✅ IMPORTANT: lib -> ../src/data

// -------------------- OpenAI init (safe) --------------------
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY;
  if (!apiKey) return null;

  if (!openai) {
    try {
      openai = new OpenAI({ apiKey });
      console.log("[Chatbot] OpenAI client initialized");
    } catch (e) {
      console.error("[Chatbot] OpenAI init failed:", e);
      return null;
    }
  }
  return openai;
}

// -------------------- Types --------------------
export interface ChatResponse {
  response: string;
  suggestions?: string[];
  options?: Array<{ label: string; value: string; action?: string }>;
  showOptions?: boolean;
}

// -------------------- Constants --------------------
const GTECH_BASE_URL = "https://www.gtech.co.uk";
const SUPPORT_EMAIL = "support@gtech.co.uk";
const SUPPORT_PHONE = "08000 308 794";

const CATEGORY_URLS: Record<string, string> = {
  "power tools": `${GTECH_BASE_URL}/cordless-power-tools.html`,
  "garden tools": `${GTECH_BASE_URL}/garden-tools.html`,
  floorcare: `${GTECH_BASE_URL}/cordless-vacuum-cleaners.html`,
  "floor care": `${GTECH_BASE_URL}/cordless-vacuum-cleaners.html`,
  "hair care": `${GTECH_BASE_URL}/haircare.html`,
  haircare: `${GTECH_BASE_URL}/haircare.html`,
};

// -------------------- Conversation Memory --------------------
const conversationContext = new Map<
  string,
  {
    lastProduct?: Product;
    lastProducts?: Product[];
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
    productModelNumber?: string;
  }
>();

// -------------------- Helpers --------------------
function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

function normalize(str: any) {
  return (str ?? "").toString().trim();
}

function normalizeUrl(str: any) {
  return normalize(str).replace(/\/+$/, "");
}

/**
 * ✅ Fix: Sale product name sometimes missing from scraper.
 * We fill it from knowledge.json using:
 * 1) URL match
 * 2) (fallback) price + originalPrice match
 */
function fillMissingSaleNames(
  saleProducts: Product[],
  knowledgeRows: any[]
): Product[] {
  if (!saleProducts?.length) return saleProducts;

  const kb = safeArray<any>(knowledgeRows);

  const byUrl = new Map<string, any>();
  for (const row of kb) {
    const url =
      normalizeUrl(row.url || row.URL || row.link || row.product_url) || "";
    if (url) byUrl.set(url, row);
  }

  return saleProducts.map((p) => {
    if (p?.name && p.name.trim()) return p;

    const pUrl = normalizeUrl(p?.url);
    if (pUrl && byUrl.has(pUrl)) {
      const hit = byUrl.get(pUrl);
      return {
        ...p,
        name: hit.name || hit.title || hit.product_name || p.name || "Product",
      };
    }

    // fallback: match by price/originalPrice
    const pPrice = normalize(p.price);
    const pWas = normalize(p.originalPrice);

    const fallback = kb.find((k) => {
      const kPrice = normalize(k.price);
      const kWas = normalize(k.originalPrice || k.wasPrice || k.was_price);
      return pPrice && kPrice && pPrice === kPrice && (!pWas || pWas === kWas);
    });

    if (fallback) {
      return {
        ...p,
        name:
          fallback.name ||
          fallback.title ||
          fallback.product_name ||
          p.name ||
          "Product",
      };
    }

    return { ...p, name: p.name || "Product" };
  });
}

function looksLikeSaleQuery(text: string) {
  const t = text.toLowerCase();
  return (
    t.includes("sale") ||
    t.includes("offer") ||
    t.includes("offers") ||
    t.includes("discount") ||
    t.includes("promotion") ||
    t.includes("deal")
  );
}

function buildKnowledgeContext(results: any[]) {
  const rows = safeArray<any>(results);
  if (!rows.length) return "";

  const lines = rows.slice(0, 10).map((r, i) => `${i + 1}. ${JSON.stringify(r)}`);
  return [
    "--- KNOWLEDGE BASE (knowledge.json) ---",
    "Use this for product names, model numbers, URLs, general info.",
    ...lines,
    "--- END KNOWLEDGE BASE ---",
    "",
  ].join("\n");
}

function buildProductsContext(products: Product[]) {
  const items = safeArray<Product>(products);
  if (!items.length) return "";

  const lines = items.slice(0, 10).map((p, i) => {
    const name = normalize(p.name) || "Product";
    const price = normalize(p.price) || "Check website";
    const was = normalize(p.originalPrice);
    const url = normalize(p.url);
    return `${i + 1}. ${name} | ${price}${was ? ` (was ${was})` : ""} | ${url}`;
  });

  return [
    "--- MATCHED PRODUCTS (from scraper) ---",
    ...lines,
    "--- END MATCHED PRODUCTS ---",
    "",
  ].join("\n");
}

function buildSalesContext(sales: Product[]) {
  const items = safeArray<Product>(sales);
  if (!items.length) return "";

  const lines = items.slice(0, 20).map((p, i) => {
    const name = normalize(p.name) || "Product";
    const price = normalize(p.price) || "Check website";
    const was = normalize(p.originalPrice);
    const url = normalize(p.url);
    return `${i + 1}. ${name} | ${price}${was ? ` (was ${was})` : ""} | ${url}`;
  });

  return [
    "--- SALE PRODUCTS (from website data) ---",
    "If user asks about sale/offers, list ALL items below (up to 20) with names and prices.",
    ...lines,
    "--- END SALE PRODUCTS ---",
    "",
  ].join("\n");
}

function formatResponseWithLinks(response: string, products: Product[]): string {
  if (!response) return "Sorry, I couldn’t generate a response. Please try again.";

  let formatted = response;

  // Convert URLs to clickable links (simple + safe)
  formatted = formatted.replace(/https?:\/\/[^\s<>"']+/g, (url) => {
    const clean = url.replace(/[)\].,!?;:]+$/, "");
    return `<a href="${clean}">${clean}</a>`;
  });

  // Replace new lines
  formatted = formatted.replace(/\n/g, "<br/>");
  return formatted;
}

// -------------------- MAIN --------------------
export async function processChatMessage(
  message: string,
  sessionId: string = "default"
): Promise<ChatResponse> {
  const lowerMessage = (message || "").toLowerCase().trim();

  // context
  let context = conversationContext.get(sessionId);
  if (!context) {
    context = { conversationHistory: [] };
    conversationContext.set(sessionId, context);
  }

  context.conversationHistory.push({ role: "user", content: message });

  // 1) Website data (guarded)
  let websiteData: any = {
    products: [],
    sales: [],
    blackFriday: [],
    promotions: [],
    categories: [],
    sections: [],
    trending: [],
    hasSales: false,
    hasBlackFriday: false,
  };

  try {
    websiteData = await Promise.race([
      getComprehensiveWebsiteData(),
      new Promise<any>((resolve) =>
        setTimeout(() => resolve(websiteData), 9000)
      ),
    ]);

    websiteData.products = safeArray<Product>(websiteData.products);
    websiteData.sales = safeArray<Product>(websiteData.sales);
    websiteData.blackFriday = safeArray<Product>(websiteData.blackFriday);
    websiteData.promotions = safeArray<Product>(websiteData.promotions);
    websiteData.hasSales = !!websiteData.hasSales;
    websiteData.hasBlackFriday = !!websiteData.hasBlackFriday;
  } catch (e) {
    console.warn("[Chatbot] getComprehensiveWebsiteData failed:", e);
  }

  // 2) Knowledge search (fast)
  let knowledgeHits: any[] = [];
  try {
    knowledgeHits = searchKnowledge(message, 8);
  } catch (e) {
    console.warn("[Chatbot] searchKnowledge failed:", e);
  }

  // ✅ FIX: fill missing sale names using FULL knowledge file (not only hits)
  try {
    websiteData.sales = fillMissingSaleNames(
      websiteData.sales,
      safeArray<any>(knowledgeAll)
    );
  } catch (e) {
    // non-fatal
  }

  // 3) Product search (guarded)
  let matchedProducts: Product[] = [];
  try {
    matchedProducts = await Promise.race([
      searchProducts(message),
      new Promise<Product[]>((resolve) => setTimeout(() => resolve([]), 4500)),
    ]);

    matchedProducts = safeArray<Product>(matchedProducts);

    if (matchedProducts.length === 1) context.lastProduct = matchedProducts[0];
    if (matchedProducts.length > 1) context.lastProducts = matchedProducts.slice(0, 10);

    // fetch missing details (short timeout)
    await Promise.all(
      matchedProducts.slice(0, 3).map(async (p) => {
        if (!p?.url || p.url === GTECH_BASE_URL) return;
        if (!p.price || p.price.includes("Check website") || !p.specs) {
          try {
            const full = await Promise.race([
              fetchProductDetails(p.url),
              new Promise<Product | null>((resolve) =>
                setTimeout(() => resolve(null), 3500)
              ),
            ]);
            if (full) Object.assign(p, full);
          } catch {
            // ignore
          }
        }
      })
    );
  } catch (e) {
    console.warn("[Chatbot] searchProducts failed:", e);
  }

  // 4) If user asks sale/offers -> answer with sale list directly (no GPT needed)
  if (looksLikeSaleQuery(lowerMessage)) {
    const saleList = safeArray<Product>(websiteData.sales);

    if (!saleList.length) {
      return {
        response: `At the moment, I can’t see any sale items from the website feed. Please check our offers page here: <a href="${GTECH_BASE_URL}/offers.html">${GTECH_BASE_URL}/offers.html</a>`,
      };
    }

    // show up to 20
    let resp = `Yes — we currently have products on sale. Here are ${Math.min(
      saleList.length,
      20
    )} items:<br/><br/>`;

    saleList.slice(0, 20).forEach((p, i) => {
      const name = normalize(p.name) || "Product";
      const price = normalize(p.price) || "Check website";
      const was = normalize(p.originalPrice);
      const url = normalize(p.url) || GTECH_BASE_URL;

      resp += `<strong>${i + 1}. ${name}</strong><br/>`;
      resp += `💰 ${price}${was ? ` (was ${was})` : ""}<br/>`;
      resp += `🔗 <a href="${url}">View Product</a><br/><br/>`;
    });

    resp += `You can also view all offers here: <a href="${GTECH_BASE_URL}/offers.html">${GTECH_BASE_URL}/offers.html</a>`;

    return { response: resp };
  }

  // 5) GPT response (with knowledge + live context)
  const client = getOpenAIClient();
  if (client) {
    const knowledgeContext = buildKnowledgeContext(knowledgeHits);
    const matchedContext = buildProductsContext(matchedProducts);
    const salesContext = buildSalesContext(websiteData.sales);

    const systemPrompt = `
You are NICK, Gtech Product Assistant.

Rules:
- Use KNOWLEDGE BASE if it matches the user question (names, model numbers, URLs, info).
- Use LIVE WEBSITE DATA for current prices and what's on sale.
- If user asks about product price/specs, include them if present in the context.
- If user asks "what products do you have", send them to ${GTECH_BASE_URL} and ask which product they mean.
- If user asks about categories, ALWAYS mention ALL of these: Floor Care (e.g., vacuums), Garden Tools (e.g., trimmers), Power Tools (e.g., drills and drivers), and Hair Care (e.g., hair dryers and straighteners).
- NEVER provide markdown code examples, syntax explanations, or formatting tutorials. Do not show code blocks with markdown syntax.
- NEVER show technical documentation, code snippets, or formatting guides.
- If asked about markdown, formatting, code, or technical documentation topics, politely redirect the conversation to Gtech products and services.
- Focus exclusively on Gtech products, services, support, and related information.

Product Categories:
Gtech offers products in these main categories:
1. Floor Care (e.g., vacuums)
2. Garden Tools (e.g., trimmers)
3. Power Tools (e.g., drills and drivers)
4. Hair Care (e.g., hair dryers and straighteners)

Support:
Phone: ${SUPPORT_PHONE}
Email: ${SUPPORT_EMAIL}
Website: ${GTECH_BASE_URL}
`.trim();

    const combinedContext = [
      knowledgeContext,
      matchedContext,
      salesContext,
      `Website flags: hasSales=${websiteData.hasSales}, saleCount=${safeArray(websiteData.sales).length}`,
    ].join("\n");

    try {
      const completion = await Promise.race([
        client.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.4,
          max_tokens: 900,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "system", content: combinedContext },
            ...context.conversationHistory.slice(-8),
            { role: "user", content: message },
          ],
        }),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error("OpenAI timeout")), 20000)
        ),
      ]);

      const aiText = completion?.choices?.[0]?.message?.content?.trim();
      if (!aiText) throw new Error("Empty OpenAI response");

      // linkify
      const allForLinks = [
        ...safeArray<Product>(websiteData.products),
        ...safeArray<Product>(websiteData.sales),
        ...safeArray<Product>(websiteData.promotions),
      ];
      const formatted = formatResponseWithLinks(aiText, allForLinks);

      context.conversationHistory.push({ role: "assistant", content: formatted });
      return { response: formatted };
    } catch (e) {
      console.error("[Chatbot] OpenAI failed:", e);
      // fall through to fallback
    }
  }

  // 6) Fallback (no OpenAI)
  return generateFallbackResponse(message, context, websiteData);
}

// -------------------- Fallback response --------------------
async function generateFallbackResponse(
  message: string,
  context: any,
  websiteData: any
): Promise<ChatResponse> {
  const lower = (message || "").toLowerCase();

  // Redirect markdown/formatting/code questions to product focus
  if (
    lower.includes("markdown") ||
    lower.includes("formatting") ||
    lower.includes("code example") ||
    lower.includes("syntax") ||
    lower.includes("show me") && (lower.includes("format") || lower.includes("code") || lower.includes("markdown"))
  ) {
    return {
      response: `I'm here to help you with Gtech products and services. I can assist you with product information, pricing, sales, ordering, and support.<br/><br/>What Gtech product can I help you with today?`,
    };
  }

  // basic category links
  for (const key of Object.keys(CATEGORY_URLS)) {
    if (lower.includes(key)) {
      return {
        response: `Yes — you can browse our ${key} here: <a href="${CATEGORY_URLS[key]}">${CATEGORY_URLS[key]}</a>`,
      };
    }
  }

  // product list query -> website
  if (
    lower.includes("what products") ||
    lower.includes("show me products") ||
    lower.includes("products available")
  ) {
    return {
      response: `We offer a variety of products across our main categories. Please have a look on our website: <a href="${GTECH_BASE_URL}">${GTECH_BASE_URL}</a><br/><br/>If you tell me a specific product name or model number, I can help you straight away.`,
    };
  }

  // try product match
  const products = safeArray<Product>(await searchProducts(message).catch(() => []));
  if (products.length) {
    const p = products[0];
    return {
      response: `<strong>${normalize(p.name)}</strong><br/><br/>💰 ${normalize(p.price)}${p.originalPrice ? ` (was ${p.originalPrice})` : ""}<br/>🔗 <a href="${p.url}">View Product</a>`,
    };
  }

  return {
    response: `I’m here to help with product information, prices, offers, ordering, and support.<br/><br/>You can browse our products here: <a href="${GTECH_BASE_URL}">${GTECH_BASE_URL}</a><br/><br/>What product name or model number can I help you with?`,
  };
}
