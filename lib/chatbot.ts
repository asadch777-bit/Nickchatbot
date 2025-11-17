import { 
  searchProducts, 
  getProductByName, 
  getRelatedProducts, 
  getComprehensiveWebsiteData,
  fetchGtechProducts,
  fetchProductDetails,
  Product
} from './scraper';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY || '',
});

export interface ChatResponse {
  response: string;
  suggestions?: string[];
}

const GTECH_BASE_URL = 'https://www.gtech.co.uk';
const SUPPORT_EMAIL = 'support@gtech.co.uk';
const SUPPORT_PHONE = '08000 308 794';

// Store conversation context
const conversationContext = new Map<string, { 
  lastProduct?: Product; 
  lastProducts?: Product[]; 
  conversationHistory: Array<{role: string; content: string}> 
}>();

export async function processChatMessage(message: string, sessionId: string = 'default'): Promise<ChatResponse> {
  // Get or create conversation context
  let context = conversationContext.get(sessionId);
  if (!context) {
    context = { conversationHistory: [] };
    conversationContext.set(sessionId, context);
  }

  // Add user message to history
  context.conversationHistory.push({ role: 'user', content: message });

  // Fetch live data from website
  let websiteData: any;
  try {
    websiteData = await getComprehensiveWebsiteData();
    // Ensure all required fields exist
    if (!websiteData.hasSales) websiteData.hasSales = false;
    if (!websiteData.hasBlackFriday) websiteData.hasBlackFriday = false;
    if (!websiteData.products) websiteData.products = [];
    if (!websiteData.sales) websiteData.sales = [];
    if (!websiteData.blackFriday) websiteData.blackFriday = [];
    if (!websiteData.promotions) websiteData.promotions = [];
  } catch (error) {
    console.error('Error fetching website data:', error);
    // Return safe default
    websiteData = {
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
  }
  
  // Build comprehensive context for AI
  let contextInfo = '';
  
  // Add sales information
  contextInfo += `Current Sales Status:\n`;
  contextInfo += `- Has Sales: ${websiteData.hasSales}\n`;
  contextInfo += `- Has Black Friday: ${websiteData.hasBlackFriday}\n`;
  contextInfo += `- Total Sale Products: ${websiteData.sales.length}\n`;
  contextInfo += `- Total Black Friday Products: ${websiteData.blackFriday.length}\n`;
  contextInfo += `- Total Promotional Products: ${websiteData.promotions.length}\n\n`;
  
  if (context.lastProduct) {
    contextInfo += `Last product discussed: ${context.lastProduct.name} - Price: ${context.lastProduct.price}${context.lastProduct.originalPrice ? ` (was ${context.lastProduct.originalPrice})` : ''} - URL: ${context.lastProduct.url}\n`;
  }
  
  if (context.lastProducts && context.lastProducts.length > 0) {
    contextInfo += `Last products shown (${context.lastProducts.length} products):\n`;
    context.lastProducts.forEach((product, index) => {
      contextInfo += `${index + 1}. ${product.name} - ${product.price}${product.originalPrice ? ` (was ${product.originalPrice})` : ''} - ${product.url}\n`;
    });
  }
  
  if (!context.lastProduct && !context.lastProducts) {
    contextInfo += 'No previous product context\n';
  }

  // Use OpenAI to generate intelligent response
  if (process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY) {
    try {
      // Build product list for AI
      let productList = '';
      if (websiteData.products && websiteData.products.length > 0) {
        productList = '\n\nAvailable Products:\n';
        websiteData.products.slice(0, 50).forEach((product: Product, index: number) => {
          productList += `${index + 1}. ${product.name} - ${product.price}${product.originalPrice ? ` (was ${product.originalPrice})` : ''} - ${product.url}\n`;
        });
        if (websiteData.products.length > 50) {
          productList += `...and ${websiteData.products.length - 50} more products\n`;
        }
      }

      const systemPrompt = `You are NICK, an intelligent Gtech product assistant. You help customers with product information, pricing, ordering, and support.

CRITICAL RULES:
1. NEVER use predefined responses - ALWAYS generate responses based on the live data provided
2. Understand context perfectly:
   - "this" or "it" = refers to lastProduct (single product)
   - "these" or "them" = refers to lastProducts (multiple products shown)
   - If user asks "how to order these?", provide ordering steps for ALL products in lastProducts
3. Always use live data from the website - prices, products, promotions are all fetched in real-time
4. Be conversational and helpful - answer questions naturally based on the data provided
5. If user asks about ordering multiple products, explain how to order each one
6. IMPORTANT: If hasSales is true, there ARE sales going on. If hasBlackFriday is true, there IS a Black Friday sale. Always check these flags first before saying "no sales"
7. If user asks "are there any sales?" or "is there a sale going on?", check hasSales flag and respond accordingly with actual sale products

Current website data:
- Total products: ${websiteData.products.length}
- Has Sales: ${websiteData.hasSales} (IMPORTANT: If true, there ARE sales!)
- Has Black Friday: ${websiteData.hasBlackFriday} (IMPORTANT: If true, there IS Black Friday!)
- Promotional products: ${websiteData.promotions.length}
- Sale products: ${websiteData.sales.length}
- Black Friday products: ${websiteData.blackFriday.length}
- Categories: ${websiteData.categories.join(', ')}

${contextInfo}

${productList}

Support information:
- Phone: ${SUPPORT_PHONE}
- Email: ${SUPPORT_EMAIL}
- Website: ${GTECH_BASE_URL}
- Free delivery available
- 30-day guarantee
- 2-year warranty

Generate a helpful, intelligent response based on the user's query and the live data. Understand context perfectly - if user says "these", refer to the lastProducts list.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          ...context.conversationHistory.slice(-10).map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      });

      let aiResponse = completion.choices[0]?.message?.content || '';

      // If user asks about products, ensure we have the data
      const lowerMessage = message.toLowerCase();
      
      // Handle "these" or "them" - refers to lastProducts
      if ((lowerMessage.includes('these') || lowerMessage.includes('them')) && context.lastProducts && context.lastProducts.length > 0) {
        // Enhance response with actual product data
        let productsInfo = '\n\nProducts you asked about:\n';
        context.lastProducts.forEach((product, index) => {
          productsInfo += `${index + 1}. ${product.name} - ${product.price}${product.originalPrice ? ` (was ${product.originalPrice})` : ''} - ${product.url}\n`;
        });

        const enhancedCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: systemPrompt + productsInfo,
            },
            {
              role: 'user',
              content: message,
            },
          ],
          temperature: 0.7,
          max_tokens: 1500,
        });

        aiResponse = enhancedCompletion.choices[0]?.message?.content || aiResponse;
      }
      
      // Handle "this" or "it" - refers to lastProduct
      if ((lowerMessage.includes('this') || lowerMessage.includes('it')) && context.lastProduct) {
        const product = context.lastProduct;
        
        // Fetch full details if needed
        if (!product.specs && product.url !== GTECH_BASE_URL) {
          const fullDetails = await fetchProductDetails(product.url);
          if (fullDetails) {
            Object.assign(product, fullDetails);
            context.lastProduct = product;
          }
        }
        
        let productInfo = `\n\nProduct you asked about:\n`;
        productInfo += `Name: ${product.name}\n`;
        productInfo += `Price: ${product.price}${product.originalPrice ? ` (was ${product.originalPrice})` : ''}\n`;
        productInfo += `URL: ${product.url}\n`;
        if (product.description) productInfo += `Description: ${product.description}\n`;
        if (product.features) productInfo += `Features: ${product.features.join(', ')}\n`;
        if (product.specs) {
          try {
            productInfo += `Specs: ${JSON.stringify(product.specs)}\n`;
          } catch (e) {
            productInfo += `Specs: ${Object.entries(product.specs).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`;
          }
        }

        const enhancedCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: systemPrompt + productInfo,
            },
            {
              role: 'user',
              content: message,
            },
          ],
          temperature: 0.7,
          max_tokens: 1500,
        });

        aiResponse = enhancedCompletion.choices[0]?.message?.content || aiResponse;
      }

      // If user asks about sales/promotions, update context
      if (lowerMessage.includes('sale') || lowerMessage.includes('promotion') || lowerMessage.includes('discount') || lowerMessage.includes('deal')) {
        const saleProducts = websiteData.sales.length > 0 ? websiteData.sales : websiteData.products.filter((p: Product) => p && p.originalPrice);
        if (saleProducts.length > 0) {
          context.lastProducts = saleProducts.slice(0, 10);
        }
      }

      // If user searches for products, update context
      const products = await searchProducts(message);
      if (products.length > 0) {
        if (products.length === 1) {
          context.lastProduct = products[0];
        } else {
          context.lastProducts = products.slice(0, 10);
        }
      }

      // Format response with HTML links
      const formattedResponse = formatResponseWithLinks(aiResponse, websiteData.products);

      // Add assistant response to history
      context.conversationHistory.push({ role: 'assistant', content: formattedResponse });

      return { response: formattedResponse };
    } catch (error) {
      console.error('OpenAI error:', error);
      // Fallback to intelligent data-based response
    }
  }

  // Fallback: Intelligent response based on live data (no OpenAI)
  return await generateIntelligentResponse(message, context, websiteData);
}

function formatResponseWithLinks(response: string, products: Product[]): string {
  let formatted = response;
  
  // Add links to product mentions
  products.forEach(product => {
    const regex = new RegExp(`\\b${product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    formatted = formatted.replace(regex, (match) => {
      return `<a href="${product.url}" target="_blank">${match}</a>`;
    });
  });
  
  // Add links to common terms
  formatted = formatted.replace(/Gtech website/gi, `<a href="${GTECH_BASE_URL}" target="_blank">Gtech website</a>`);
  formatted = formatted.replace(/our website/gi, `<a href="${GTECH_BASE_URL}" target="_blank">our website</a>`);
  formatted = formatted.replace(/Track My Order/gi, `<a href="${GTECH_BASE_URL}/track-my-order" target="_blank">Track My Order</a>`);
  
  // Convert line breaks to HTML
  formatted = formatted.replace(/\n/g, '<br/>');
  
  return formatted;
}

async function generateIntelligentResponse(message: string, context: any, websiteData: any): Promise<ChatResponse> {
  const lowerMessage = message.toLowerCase();
  
  // Handle "these" or "them" - refers to lastProducts
  if ((lowerMessage.includes('these') || lowerMessage.includes('them')) && context.lastProducts && context.lastProducts.length > 0) {
    if (lowerMessage.includes('order') || lowerMessage.includes('buy') || lowerMessage.includes('purchase')) {
      let response = `To order these products:<br/><br/>`;
      
      context.lastProducts.forEach((product: Product, index: number) => {
        response += `<strong>${index + 1}. ${product.name}</strong><br/>`;
        response += `💰 Price: <strong>${product.price}</strong>${product.originalPrice ? ` <span style="text-decoration: line-through; color: #999;">was ${product.originalPrice}</span>` : ''}<br/>`;
        response += `🔗 <a href="${product.url}" target="_blank">View & Order ${product.name}</a><br/><br/>`;
      });
      
      response += `<strong>Ordering Steps:</strong><br/>`;
      response += `1. Click on any product link above to visit the product page<br/>`;
      response += `2. Click "Add to Basket"<br/>`;
      response += `3. You can add multiple products to your basket<br/>`;
      response += `4. Proceed to checkout when ready<br/><br/>`;
      response += `We offer:<br/>• FREE delivery*<br/>• 30-day guarantee<br/>• 2-year warranty<br/><br/>`;
      response += `Need help? Contact us:<br/>📞 ${SUPPORT_PHONE}<br/>📧 ${SUPPORT_EMAIL}`;
      
      return { response };
    }
  }
  
  // Handle "this" or "it" - refers to lastProduct
  if ((lowerMessage.includes('this') || lowerMessage.includes('it')) && context.lastProduct) {
    const product = context.lastProduct;
    
    if (lowerMessage.includes('order') || lowerMessage.includes('buy') || lowerMessage.includes('purchase')) {
      return {
        response: `To order <strong>${product.name}</strong>:<br/><br/>1. Visit the product page: <a href="${product.url}" target="_blank">${product.name}</a><br/>2. Click "Add to Basket"<br/>3. Proceed to checkout<br/><br/>Current price: <strong>${product.price}</strong>${product.originalPrice ? ` (was ${product.originalPrice})` : ''}<br/><br/>We offer:<br/>• FREE delivery*<br/>• 30-day guarantee<br/>• 2-year warranty<br/><br/>Need help? Contact us:<br/>📞 ${SUPPORT_PHONE}<br/>📧 ${SUPPORT_EMAIL}`,
      };
    }
  }
  
  // Handle sales/promotions
  if (lowerMessage.includes('sale') || lowerMessage.includes('promotion') || lowerMessage.includes('discount')) {
    const saleProducts = websiteData.sales.length > 0 ? websiteData.sales : websiteData.products.filter((p: Product) => p.originalPrice);
    
    if (saleProducts.length > 0) {
      context.lastProducts = saleProducts.slice(0, 10);
      
      let response = `<strong>Yes! We have ${saleProducts.length} products on sale right now:</strong><br/><br/>`;
      
      saleProducts.slice(0, 10).forEach((product: Product) => {
        response += `<strong>${product.name}</strong><br/>`;
        response += `💰 Price: <strong>${product.price}</strong>`;
        if (product.originalPrice) {
          response += ` <span style="text-decoration: line-through; color: #999;">was ${product.originalPrice}</span>`;
        }
        response += `<br/>🔗 <a href="${product.url}" target="_blank">View Product</a><br/><br/>`;
      });
      
      if (saleProducts.length > 10) {
        response += `...and ${saleProducts.length - 10} more products on sale!<br/><br/>`;
      }
      
      response += `Visit <a href="${GTECH_BASE_URL}" target="_blank">${GTECH_BASE_URL}</a> to see all sale products.`;
      
      return { response };
    }
  }
  
  // Handle product searches
  const products = await searchProducts(message);
  if (products.length > 0) {
    if (products.length === 1) {
      const product = products[0];
      context.lastProduct = product;
      
      // Fetch full details if needed
      if (!product.specs && product.url !== GTECH_BASE_URL) {
        const fullDetails = await fetchProductDetails(product.url);
        if (fullDetails) {
          Object.assign(product, fullDetails);
        }
      }
      
      let response = `<strong>${product.name}</strong><br/><br/>`;
      response += `💰 Price: <strong>${product.price}</strong>${product.originalPrice ? ` <span style="text-decoration: line-through; color: #999;">was ${product.originalPrice}</span>` : ''}<br/><br/>`;
      
      if (product.description) {
        response += `${product.description}<br/><br/>`;
      }
      
      if (product.specs && Object.keys(product.specs).length > 0) {
        response += `<strong>Specifications:</strong><br/>`;
        Object.entries(product.specs).slice(0, 10).forEach(([key, value]) => {
          const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          response += `• <strong>${displayKey}:</strong> ${value}<br/>`;
        });
        response += '<br/>';
      }
      
      if (product.features && product.features.length > 0) {
        response += `<strong>Features:</strong><br/>• ${product.features.slice(0, 10).join('<br/>• ')}<br/><br/>`;
      }
      
      response += `📦 Category: ${product.category}<br/>`;
      response += `🔗 <a href="${product.url}" target="_blank">View Product Page</a><br/>`;
      response += `🛒 <a href="${product.url}" target="_blank">Add to Basket</a><br/><br/>`;
      
      const related = await getRelatedProducts(product.name);
      if (related.length > 0) {
        response += `<strong>You might also like:</strong><br/>`;
        related.forEach((rel) => {
          response += `• <a href="${rel.url}" target="_blank">${rel.name}</a> (${rel.price})<br/>`;
        });
      }
      
      return { response };
    } else {
      context.lastProducts = products.slice(0, 10);
      
      let response = `I found ${products.length} products matching your query:<br/><br/>`;
      products.slice(0, 5).forEach((product) => {
        response += `<strong>${product.name}</strong><br/>`;
        response += `💰 Price: ${product.price}${product.originalPrice ? ` <span style="text-decoration: line-through; color: #999;">was ${product.originalPrice}</span>` : ''}<br/>`;
        response += `🔗 <a href="${product.url}" target="_blank">View Product</a><br/><br/>`;
      });
      
      if (products.length > 5) {
        response += `...and ${products.length - 5} more products. Visit <a href="${GTECH_BASE_URL}" target="_blank">our website</a> to see all products.`;
      }
      
      return { response };
    }
  }
  
  // Default: Use AI to generate response
  return {
    response: `I'm here to help! I can assist you with product information, pricing, sales, ordering, and support. All information is fetched live from our website. What would you like to know? Or visit <a href="${GTECH_BASE_URL}" target="_blank">${GTECH_BASE_URL}</a> to browse our full range.`,
  };
}
