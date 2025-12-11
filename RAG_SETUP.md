# RAG (Retrieval Augmented Generation) Setup Guide

## Overview
Your chatbot now supports RAG (Retrieval Augmented Generation), which combines:
- **Your data files** (stored knowledge base)
- **Live website data** (real-time product information)
- **OpenAI API** (intelligent response generation)

## 📁 Where to Place Your Data File

**Place your data files in the `/data` folder** at the root of your project:

```
Nick-chatbot-main/
├── data/              ← Place your data files here
│   ├── your-data.txt
│   ├── knowledge.json
│   └── ...
├── lib/
│   ├── rag.ts         ← RAG service
│   └── chatbot.ts     ← Updated with RAG integration
└── ...
```

## 📄 Supported File Formats

- `.txt` - Plain text files
- `.json` - JSON files  
- `.md` - Markdown files
- `.csv` - CSV files

## 🚀 How It Works

### 1. **Data Processing** (Automatic)
- On first chatbot use, the system automatically:
  - Reads all files from `/data` folder
  - Splits them into chunks (500 chars each)
  - Generates embeddings using OpenAI
  - Stores them for fast retrieval

### 2. **Query Processing**
When a user asks a question:
1. **RAG Retrieval**: Finds relevant chunks from your data files
2. **Live Data**: Fetches current website data (products, prices, sales)
3. **OpenAI Generation**: Combines both sources to generate accurate responses

### 3. **Response Generation**
The chatbot now uses:
- ✅ **RAG Context** - Knowledge from your data files
- ✅ **Live Website Data** - Real-time product information
- ✅ **OpenAI API** - Intelligent response generation

## 📝 Example Usage

### Step 1: Add Your Data File
```bash
# Place your data file in the data folder
cp /path/to/your/knowledge.txt ./data/
```

### Step 2: Start the Chatbot
The system will automatically:
- Process your data file on first use
- Create embeddings
- Make it searchable

### Step 3: Ask Questions
The chatbot will:
- Search your data files for relevant information
- Combine with live website data
- Generate comprehensive responses

## 🔧 Configuration

### Environment Variables
Make sure you have OpenAI API key set:
```env
OPENAI_API_KEY=your_key_here
```

### RAG Settings (in `lib/rag.ts`)
You can customize:
- `chunkSize`: Size of text chunks (default: 500)
- `overlap`: Overlap between chunks (default: 100)
- `topK`: Number of relevant chunks to retrieve (default: 5)
- Embedding model: `text-embedding-3-small`

## 📊 How RAG Enhances Responses

**Before RAG:**
- Only uses live website data
- Limited to current product information

**After RAG:**
- Uses your knowledge base + live data
- Can answer questions about:
  - Company policies
  - Product specifications
  - Support procedures
  - Historical information
  - Any content in your data files

## 🎯 Best Practices

1. **Organize Your Data**:
   - Use clear filenames: `product-specs.txt`, `faq.json`
   - Group related information together
   - Keep files updated

2. **File Structure**:
   ```
   data/
   ├── product-knowledge.txt    # Product info, specs, features
   ├── policies.md              # Warranty, returns, shipping
   ├── faq.json                 # Common questions
   └── support-guide.txt        # Troubleshooting, support
   ```

3. **Content Quality**:
   - Write clear, concise information
   - Use structured format when possible
   - Include relevant keywords

## 🔍 Testing RAG

1. Add a test file to `/data`:
   ```txt
   Gtech offers a 30-day money-back guarantee on all products.
   Free delivery is available for orders over £50.
   Customer support is available Monday-Friday, 9am-5pm.
   ```

2. Ask the chatbot:
   - "What is your return policy?"
   - "Do you offer free delivery?"
   - "What are your support hours?"

3. The chatbot should use information from your data file!

## 🐛 Troubleshooting

### RAG not working?
- Check that files are in `/data` folder
- Verify file format is supported (.txt, .json, .md, .csv)
- Check console logs for initialization messages
- Ensure OpenAI API key is set

### Slow performance?
- Large files take time to process initially
- Consider splitting large files into smaller ones
- Processing happens in memory (restart clears cache)

### No relevant results?
- Check that your data file contains relevant information
- Try rephrasing your query
- System falls back to keyword search if embeddings fail

## 📚 Technical Details

- **Embedding Model**: OpenAI `text-embedding-3-small`
- **Similarity**: Cosine similarity for chunk retrieval
- **Storage**: In-memory vector store (for production, consider Pinecone, Weaviate, etc.)
- **Chunking**: 500 characters with 100 character overlap

## 🚀 Next Steps

1. **Add your data file** to `/data` folder
2. **Start the chatbot** - it will process files automatically
3. **Test with questions** that should use your data
4. **Monitor responses** to ensure RAG is working

Your chatbot is now ready to use both RAG and OpenAI! 🎉

