const { ChatGroq } = require("@langchain/groq");
const { MongoClient } = require("mongodb");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { PromptTemplate } = require("@langchain/core/prompts");
const { StateGraph, START, END, MemorySaver } = require("@langchain/langgraph");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { InterviewState } = require("../state");
const { MongoDBAtlasVectorSearch } = require("@langchain/mongodb");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");

// ================= LLM =================
const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "llama-3.1-8b-instant",
    streaming: true,
    maxTokens: 300,
});

// ================= EMBEDDINGS =================
const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    modelName: "gemini-embedding-001",
    outputDimensionality: 3072,
});

// ================= MONGODB =================
const client = new MongoClient(process.env.MONGODB_ATLAS_URI);
let isConnected = false;

async function getDB() {
    if (!isConnected) {
        await client.connect();
        // console.log("MongoDB Connected");
        isConnected = true;
    }
    return client.db("interview_db");
}

// ================= SESSION STORE =================
const sessionCheckpointers = new Map();

function getSessionGraph(socketId) {
    if (!sessionCheckpointers.has(socketId)) {
        const checkpointer = new MemorySaver();
        const graph = buildGraph(checkpointer);
        sessionCheckpointers.set(socketId, graph);
    }
    return sessionCheckpointers.get(socketId);
}

function clearSession(socketId) {
    sessionCheckpointers.delete(socketId);
    // console.log(`Cleared session for socket ${socketId}`);
}

// ================= STREAM HELPER =================
async function streamChain(chain, inputs, socket) {
    let fullText = '';
    const stream = await chain.stream(inputs);
    for await (const chunk of stream) {
        if (chunk) {
            fullText += chunk;
            socket.emit("ai_answer", chunk);
        }
    }
    socket.emit("ai_done");
    // console.log(`Streamed: "${fullText.slice(0, 80)}..."`);
    return fullText;
}

// ================= STREAM PLAIN TEXT (for fallback) =================
async function streamText(text, socket) {
    socket.emit("ai_answer", text);
    socket.emit("ai_done");
    return text;
}

// ================= STREAM FEEDBACK (closing only) =================
async function streamFeedback(chain, inputs, socket) {
    let fullText = '';
    const stream = await chain.stream(inputs);
    for await (const chunk of stream) {
        if (chunk) fullText += chunk;
    }
    socket.emit("ai_feedback", fullText);
    // console.log(`✅ Feedback: "${fullText.slice(0, 80)}..."`);
    return fullText;
}

// ================= BUILD HISTORY =================
function buildHistoryText(messages) {
    return messages
        .map(m => {
            const isHuman =
                m._getType?.() === 'human' ||
                m.constructor?.name === 'HumanMessage' ||
                m.type === 'human';
            return `${isHuman ? 'Candidate' : 'Interviewer'}: ${m.content}`;
        })
        .join("\n");
}

// ================= RAG HELPER =================
async function getRelevantContext(query) {
    try {
        const db = await getDB();
        const collection = db.collection("resumes");

        const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
            collection,
            indexName: "vector_index",
            textKey: "text",
            embeddingKey: "embedding",
        });

        const docs = await vectorStore.similaritySearch(query, 1);
        const context = docs.map(doc => doc.pageContent).join("\n\n");
        // console.log("🔍 RAG: Retrieved", docs.length, "chunks for query:", query.slice(0, 50));
        return context;
    } catch (err) {
        // console.error("❌ RAG Error:", err.message);
        return null;
    }
}

// ================= NAME EXTRACTOR =================
async function extractCandidateName(resumeText) {
    const prompt = PromptTemplate.fromTemplate(`
Extract ONLY the candidate's full name from this resume.
The name is always the very first thing at the top.
Return ONLY the name. Nothing else. No punctuation. No explanation.
Example output: John Smith

Resume (first 500 characters):
{resumeText}

Full name:
`);
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    const name = await chain.invoke({ resumeText: resumeText.slice(0, 500) });
    return name.trim();
}

// ================= LEVEL DETECTOR =================
async function detectCandidateLevel(resumeText) {
    const prompt = PromptTemplate.fromTemplate(`
You are an expert HR analyst. Read this resume and determine if the candidate is a FRESHER or SENIOR.

Rules:
- FRESHER: 0-1 years experience, mostly academic projects, internships, no real work history
- SENIOR: 2+ years of real work experience, professional projects, job history

Return ONLY one word: fresher OR senior
Nothing else. No explanation.

Resume:
{resumeText}

Level:
`);
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    const level = await chain.invoke({ resumeText: resumeText.slice(0, 1000) });
    const cleaned = level.trim().toLowerCase();
    // console.log("Detected Level:", cleaned);
    return cleaned.includes("senior") ? "senior" : "fresher";
}

// ================= NODE 1: INTRO =================
const introNode = async (state, config) => {
    const socket = config.configurable?.socket;
    // console.log("🔵 introNode running...");

   const prompt = PromptTemplate.fromTemplate(`
You are a technical interviewer starting an interview.

Candidate name: {candidateName}

Resume:
{resumeContext}

Write a short opening message:
1. Start with "Hi {candidateName}, I'm your AI Interviewer."
2. In ONE sentence, say you'll be asking questions based on their resume.
3. Ask them to briefly introduce themselves.

Keep it under 3 sentences. No fluff. No project details in the intro.
`);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    const aiText = await streamChain(chain, {
        resumeContext: state.resumeContext,
        candidateName: state.candidateName,
    }, socket);

    return {
        messages: [new AIMessage(aiText)],
        questionCount: 0,
        phase: "technical"
    };
};

// ================= NODE 2: TECHNICAL (with RAG) =================
const technicalNode = async (state, config) => {
    const socket = config.configurable?.socket;

    // console.log("technicalNode state.questionCount =", state.questionCount);

    if (state.questionCount === 5) {
        // console.log("STOP → moving to closing");
        return {
            messages: [],
            questionCount: state.questionCount,
            phase: "closing",
        };
    }

    const newCount = state.questionCount + 1;
    // console.log(`technicalNode running: Q${newCount}/5`);

    const lastHumanMsg = [...state.messages]
        .reverse()
        .find(m =>
            m._getType?.() === 'human' ||
            m.constructor?.name === 'HumanMessage' ||
            m.type === 'human'
        )?.content || "skills projects experience";

    const ragContext = await getRelevantContext(lastHumanMsg);

    const contextToUse = (ragContext && ragContext.length > 50)
        ? ragContext
        : state.resumeContext;

    const historyText = buildHistoryText(state.messages);

    //NEW: Extract which topics were already covered from history
    const askedTopics = state.messages
        .filter(m =>
            m._getType?.() === 'ai' ||
            m.constructor?.name === 'AIMessage' ||
            m.type === 'ai'
        )
        .map(m => m.content)
        .join("\n");

    //NEW: Level-specific depth instruction
    const levelInstruction = state.level === "senior"
        ? `This is a SENIOR candidate. Ask deep, advanced questions:
           - Focus on architecture decisions, trade-offs, scalability
           - Ask WHY they chose certain technologies
           - Ask about edge cases, error handling, performance
           - Expect detailed, experienced answers`
        : `This is a FRESHER candidate. Ask beginner-friendly questions:
           - Focus on basic concepts of the technology they used
           - Ask what a feature does and how they implemented it
           - Keep questions simple and project-specific
           - Do not expect production-level experience`;

 const prompt = PromptTemplate.fromTemplate(`
You are a technical interviewer. This is question {questionNum} of 5.

CANDIDATE LEVEL: {level}
{levelInstruction}

RESUME:
{context}

PREVIOUS QUESTIONS ASKED:
{askedTopics}

CONVERSATION SO FAR:
{history}

Rules:
- Ask about a DIFFERENT project or skill than what's already in "PREVIOUS QUESTIONS ASKED"
- ONE question only
- Maximum 2 short sentences
- Be direct — no preamble like "Based on your resume..." or "Let's move on..."
- Do not repeat context back to the candidate
- Just ask the question

Bad example: "You mentioned you used MongoDB in WriteSpace. Can you explain what a MongoDB collection is?"
Good example: "What is a MongoDB collection and how did you use it in WriteSpace?"

Bad example: "Based on the resume context, let's move to a different topic. You deployed microservices using RabbitMQ..."
Good example: "What role does RabbitMQ play in a microservices architecture?"

Question {questionNum}:
`);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    const aiText = await streamChain(chain, {
        context: contextToUse,
        history: historyText,
        questionNum: newCount,
        level: state.level,
        levelInstruction,
        askedTopics: askedTopics || "None yet — this is the first question.",
    }, socket);

    return {
        messages: [new AIMessage(aiText)],
        questionCount: newCount,
        phase: "technical",
    };
};

// ================= NODE 3: CLOSING =================
const closingNode = async (state, config) => {
    const socket = config.configurable?.socket;
    const historyText = buildHistoryText(state.messages);

    const prompt = PromptTemplate.fromTemplate(`
You are a senior technical interviewer. The interview with {candidateName} is now over.
Review their performance based on the history below:

{history}

Your Task:
1. Provide a direct and honest evaluation of their technical knowledge.
2. If they couldn't answer questions about specific technologies (like WebSockets or Redux), mention that they need to strengthen those areas.
3. If they were honest about their limitations, acknowledge it, but be firm about the technical requirements.
4. Do not use generic praise if it wasn't earned.
5. Keep it under 5 sentences.
`);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    const aiText = await streamFeedback(chain, {
        candidateName: state.candidateName,
        history: historyText,
    }, socket);

    socket.emit("interview_done");

    return {
        messages: [new AIMessage(aiText)],
        phase: "done",
    };
};

// ================= GRAPH FACTORY =================
function buildGraph(checkpointer) {
    const workflow = new StateGraph(InterviewState)
        .addNode("intro", introNode)
        .addNode("tech", technicalNode)
        .addNode("closing", closingNode)

        .addConditionalEdges(START, (state) => {
            if (!state.phase || state.phase === "intro") return "intro";
            if (state.phase === "technical") return "tech";
            if (state.phase === "closing" || state.questionCount >= 6) return "closing";
            return "tech";
        }, {
            intro: "intro",
            tech: "tech",
            closing: "closing"
        })

        .addEdge("intro", END)

        .addConditionalEdges("tech", (state) => {
            if (state.questionCount >= 6) return "closing";
            return "wait";
        }, {
            closing: "closing",
            wait: END
        })

        .addEdge("closing", END);

    return workflow.compile({ checkpointer });
}

// ================= EXPORT: INIT INTERVIEW =================
exports.initializeInterview = async (socket) => {
    try {
        // console.log("STEP 1: Starting interview, socket:", socket.id);

        clearSession(socket.id);
        const graph = getSessionGraph(socket.id);
        socket.threadId = `${socket.id}_${Date.now()}`;

        const db = await getDB();
        const meta = await db.collection("resume_meta").findOne({});

        if (!meta) {
            socket.emit("error", "No resume found. Please upload first.");
            return;
        }

        const resumeContext = meta.fullText;
        // console.log("STEP 2: Resume loaded, chars:", resumeContext.length);
        // console.log("STEP 2.5: Top:", resumeContext.slice(0, 200));

        const candidateName = await extractCandidateName(resumeContext);
        // console.log("STEP 3: Name:", candidateName);

        const level = await detectCandidateLevel(resumeContext);
        // console.log("STEP 3.5: Level:", level);

        const config = {
            configurable: {
                thread_id: socket.threadId,
                socket,
            }
        };

        await graph.invoke({
            resumeContext,
            candidateName,
            questionCount: 0,
            phase: "intro",
            messages: [],
            level,
        }, config);

        // console.log("STEP 4: Intro done, waiting for candidate");

    } catch (err) {
        // console.error("Init Error:", err.message);
        socket.emit("error", "Failed to start interview.");
    }
};

// ================= EXPORT: HANDLE MESSAGE =================
exports.handleInterview = async (socket, userMessage) => {
    try {
        const graph = getSessionGraph(socket.id);
        const currentState = await graph.getState({
            configurable: { thread_id: socket.threadId }
        });

        const result = await graph.invoke(
            {
                ...currentState.values,
                messages: [new HumanMessage(userMessage)],
            },
            {
                configurable: {
                    thread_id: socket.threadId,
                    socket,
                }
            }
        );

        if (result?.phase === "closing") {
            const freshState = await graph.getState({
                configurable: { thread_id: socket.threadId }
            });
            await graph.invoke(
                { ...freshState.values },
                {
                    configurable: {
                        thread_id: socket.threadId,
                        socket,
                    }
                }
            );
            return;
        }

        if (result?.phase !== 'done') {
            socket.emit("question_count", result?.questionCount ?? 0);
        } else {
            socket.emit("interview_done");
        }
    } catch (err) {
        // console.error("Chat Error:", err.message);
    }
};

// ================= EXPORT: CLEANUP =================
exports.clearSession = clearSession;

