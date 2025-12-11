# Data Folder for RAG (Retrieval Augmented Generation)

## Purpose
This folder contains data files that will be used by the RAG system to provide accurate, context-aware responses.

## Supported File Formats
- `.txt` - Plain text files
- `.json` - JSON files
- `.md` - Markdown files
- `.csv` - CSV files

## How to Use

1. **Place your data files here**: Simply copy your data files into this `/data` folder.

2. **File Structure**: 
   - Each file will be automatically chunked into smaller pieces
   - Chunks will be embedded using OpenAI's embedding model
   - The system will retrieve relevant chunks based on user queries

3. **Example Files**:
   - `product-knowledge.txt` - Product information, specifications, features
   - `faq.json` - Frequently asked questions and answers
   - `policies.md` - Company policies, warranty, returns, etc.
   - `support-guide.txt` - Support procedures and troubleshooting

## How RAG Works

1. **Initialization**: On first use, the system will:
   - Read all files from this folder
   - Split them into chunks (500 characters each with 100 character overlap)
   - Generate embeddings for each chunk using OpenAI
   - Store them in memory for fast retrieval

2. **Query Processing**: When a user asks a question:
   - The system generates an embedding for the query
   - Finds the most similar chunks using cosine similarity
   - Retrieves top 5 most relevant chunks
   - Combines them with live website data
   - Sends everything to OpenAI for final response generation

3. **Response Generation**: 
   - OpenAI receives both RAG context and live website data
   - Generates a comprehensive response combining both sources
   - Ensures accuracy from RAG + real-time data from website

## Notes

- Files are processed automatically on first chatbot use
- Large files may take time to process initially
- The system uses OpenAI's `text-embedding-3-small` model for embeddings
- All processing happens in memory (for production, consider using a vector database)

## Best Practices

- Keep files organized and well-structured
- Use clear, descriptive filenames
- Ensure data is up-to-date
- For large datasets, consider splitting into multiple files by topic

