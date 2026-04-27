const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { MongoDBAtlasVectorSearch } = require("@langchain/mongodb");
const { MongoClient } = require("mongodb");
const fs = require("fs");

exports.uploadResume = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        // console.log("📄 File Path:", req.file.path);

        const loader = new PDFLoader(req.file.path);
        const docs = await loader.load();

        // console.log("📘 Loaded Docs Count:", docs.length);
        // console.log("📘 Sample Text:", docs[0]?.pageContent?.slice(0, 200));

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 800,
            chunkOverlap: 50,
        });

        const chunks = await splitter.splitDocuments(docs);
        // console.log("Total Chunks:", chunks.length);

        // console.log("API KEY:", process.env.GOOGLE_API_KEY ? "Loaded" : "Missing");
        // console.log("MONGO URI:", process.env.MONGODB_ATLAS_URI ? "Loaded" : "Missing");

        const client = new MongoClient(process.env.MONGODB_ATLAS_URI);
        await client.connect();
        // console.log("MongoDB Connected (inside controller)");

        const db = client.db("interview_db");
        const collection = db.collection("resumes");

        //Clear ALL old documents before storing new resume
        const deleteResult = await collection.deleteMany({});
        // console.log(`Cleared ${deleteResult.deletedCount} old documents`);

        const embeddings = new GoogleGenerativeAIEmbeddings({
            apiKey: process.env.GOOGLE_API_KEY,
            modelName: "gemini-embedding-001",
            outputDimensionality: 3072,
        });

        const testEmbedding = await embeddings.embedQuery("hello world");
        // console.log("Test Embedding Length:", testEmbedding.length);

        if (!testEmbedding || testEmbedding.length === 0) {
            throw new Error("Embedding is empty");
        }

        const fullText = docs.map(d => d.pageContent).join("\n");
        await db.collection("resume_meta").deleteMany({});
        await db.collection("resume_meta").insertOne({
            fullText: fullText,
            uploadedAt: new Date()
        });
        // console.log("Stored full resume text in resume_meta");

        await MongoDBAtlasVectorSearch.fromDocuments(chunks, embeddings, {
            collection,
            indexName: "vector_index",
            textKey: "text",
            embeddingKey: "embedding",
        });

        // console.log("Stored in MongoDB with embeddings");

        fs.unlink(req.file.path, (err) => {
            if (err) {
                // console.error("File delete error:", err);
            } else {
                // console.log("File deleted successfully");
            }
        });

        res.status(200).json({
            message: "Resume indexed in Vector DB!",
            chunks: chunks.length
        });

    } catch (error) {
        // console.error("ERROR:", error);
        res.status(500).json({ error: error.message });
    } finally {
        if (req.file?.path) {
        fs.unlink(req.file.path, (err) => {
            if (err) {
                // console.error("File delete error:", err);
            } else {
                // console.log("File deleted successfully");
            }
        });
    }
    }
};