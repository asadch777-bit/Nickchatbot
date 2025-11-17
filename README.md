# Gtech Chatbot - NICK

An intelligent chatbot assistant for Gtech products, built with Next.js 14 and TypeScript.

## Features

- **Live Data Integration**: Fetches real-time product information, prices, and promotions from the Gtech website
- **Intelligent Responses**: Uses OpenAI for context-aware, intelligent responses
- **Automatic Sales Detection**: Automatically detects sales, Black Friday deals, and promotions
- **Comprehensive Product Search**: Searches and displays product information, specifications, and features
- **Context-Aware Conversations**: Remembers conversation context and understands references like "this", "these", "it"
- **100% Accurate Data**: All information is fetched live from the website - no predefined responses

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **OpenAI API** - Intelligent query understanding and response generation
- **Cheerio** - Web scraping
- **Axios** - HTTP requests

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenAI API key (optional but recommended)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd Chatbot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file:
```env
OPENAI_API_KEY=your_openai_api_key_here
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import your repository in Vercel
3. Add environment variable `OPENAI_API_KEY` in Vercel dashboard
4. Deploy!

The project is configured for Vercel deployment with `vercel.json`.

## Project Structure

```
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts      # API route for chat
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Main page
│   └── globals.css           # Global styles
├── components/
│   ├── Chatbot.tsx           # Chatbot UI component
│   └── Chatbot.module.css    # Chatbot styles
├── lib/
│   ├── ai.ts                 # OpenAI integration
│   ├── chatbot.ts            # Chatbot logic
│   └── scraper.ts            # Web scraping logic
└── public/                   # Static assets
```

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key (optional but recommended for better responses)

## Features

### Product Information
- Search products by name
- View product details, specifications, and features
- Get current prices and sale information

### Sales & Promotions
- Automatically detects active sales
- Shows Black Friday deals
- Lists promotional products

### Ordering Support
- Provides ordering instructions
- Links to product pages
- Contact information

## License

Private project - All rights reserved
