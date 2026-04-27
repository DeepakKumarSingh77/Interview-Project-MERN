# 🎯 AI Interview Practice Platform

A real-time AI-powered interview practice platform that analyzes your resume and conducts mock interviews with intelligent questioning.

![Project Status](https://img.shields.io/badge/Status-Active-brightgreen)
![React](https://img.shields.io/badge/React-19.2.5-61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-Express-blue)
![AI](https://img.shields.io/badge/AI-Gemini%20%2B%20Groq-purple)

---

## 🚀 Features

| Feature | Description |
|---------|-------------|
| **📄 Resume Analysis** | Upload PDF resumes, parsed and indexed using AI embeddings |
| **🤖 AI Interviewer** | Groq-powered LLM asks contextual questions based on your resume |
| **🎤 Voice Interaction** | Real-time speech-to-text using Web Speech API |
| **💬 Real-time Chat** | Socket.io powered bidirectional communication |
| **🧠 State Management** | LangGraph for conversation flow and memory |
| **📊 Vector Search** | MongoDB Atlas Vector Search for semantic resume lookup |
| **🛡️ Rate Limiting** | Built-in API protection (20 req/15min) |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React + Vite)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  App.jsx     │  │ Interview.jsx│  │   socket.js         │  │
│  │  (Upload UI) │  │ (Chat UI)    │  │   (WebSocket)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP + WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                       BACKEND (Node.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ server.js   │  │ chatController│ │ resumeController   │  │
│  │ (Express)   │  │ (LangGraph)  │  │ (PDF Processing)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Socket.io   │  │ Groq LLM      │  │ Gemini Embeddings   │  │
│  │ (Real-time) │  │ (AI Answers)  │  │ (Vector Search)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    EXTERNAL SERVICES                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ MongoDB     │  │ Google AI    │  │ Groq AI             │  │
│  │ Atlas       │  │ (Gemini)      │  │ (Llama 3.1)         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
InterviewPlatform/
├── readme.md                 # This file
├── backend/                 # Node.js + Express API
│   ├── server.js            # Main server entry
│   ├── state.js             # Interview state definitions
│   ├── package.json         # Backend dependencies
│   ├── config/
│   │   └── db.js            # MongoDB connection
│   ├── controllers/
│   │   ├── chatController.js    # AI interview logic
│   │   └── resumeController.js   # Resume upload & parsing
│   ├── middleware/
│   │   └── upload.js        # Multer file upload config
│   ├── models/
│   │   └── Interview.js     # Mongoose schema
│   ├── routes/
│   │   └── resumeRoutes.js  # API routes
│   └── uploads/             # Temp uploaded files
│
└── client/                  # React + Vite frontend
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── eslint.config.js
    └── src/
        ├── main.jsx         # React entry point
        ├── App.jsx          # Main app component
        ├── App.css         # Styles
        ├── Interview.jsx   # Interview chat component
        ├── socket.js       # Socket.io client
        └── index.css       # Global styles
```

---

## ⚙️ Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | ≥18.x | Runtime environment |
| **npm** | ≥9.x | Package manager |
| **MongoDB Atlas** | Cloud | Vector database & storage |
| **Google AI** | API Key | Gemini embeddings |
| **Groq** | API Key | Llama 3.1 LLM |

---

## 🔑 Environment Variables

Create a `.env` file in `backend/`:

```env
# Server
PORT=5000

# MongoDB Atlas (Vector Search)
MONGODB_ATLAS_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/interview_db?retryWrites=true&w=majority

# Google AI (Gemini)
GOOGLE_API_KEY=your_google_api_key_here

# Groq AI (Llama)
GROQ_API_KEY=your_groq_api_key_here
```

> **Note:** Get your API keys from:
> - [Google AI Studio](https://aistudio.google.com/app/apikey)
> - [Groq Console](https://console.groq.com/)

---

## 🛠️ Installation

### 1. Clone & Navigate
```bash
cd InterviewPlatform
```

### 2. Backend Setup
```bash
cd backend
npm install
# Create .env file with your API keys
```

### 3. Frontend Setup
```bash
cd ../client
npm install
```

---

## ▶️ Running the Project

### Terminal 1 - Backend
```bash
cd backend
npm start
```
> Server runs on `http://localhost:5000`

### Terminal 2 - Frontend
```bash
cd client
npm run dev
```
> Client runs on `http://localhost:5173`

---

## 📖 Usage Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1. Upload      │────▶│  2. AI Analyzes  │────▶│  3. Start       │
│     Resume      │     │     Resume       │     │     Interview   │
│     (PDF)       │     │     (Chunks +    │     │     (Voice/     │
│                 │     │      Embeddings)│     │      Text)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  6. View       │◀────│  5. AI          │◀────│  4. Real-time    │
│     Results    │     │     Responds    │     │     Interaction  │
│                 │     │     (Groq Llama) │     │     (Socket.io)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Step-by-Step:
1. **Upload Resume** - Drag & drop a PDF file
2. **AI Processing** - Resume is parsed, chunked, and embedded
3. **Start Interview** - Click "Start Interview" button
4. **Answer Questions** - Speak or type your responses
5. **Get AI Feedback** - Real-time responses from the AI interviewer
6. **Finish** - End session and return to home

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/resume/upload` | Upload & index resume PDF |
| `WS` | `socket.io` | Real-time interview communication |

### Socket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `start_interview` | Client → Server | Initialize interview session |
| `user_message` | Client → Server | Send user response |
| `ai_message` | Server → Client | Receive AI question/feedback |
| `disconnect` | Client → Server | Clean up session |

---

## 🧩 Key Technologies

### Backend
- **Express.js** - Web framework
- **Socket.io** - WebSocket real-time communication
- **LangChain** - AI orchestration
- **LangGraph** - State-based AI workflows
- **MongoDB Atlas** - Vector database
- **Multer** - File upload handling

### Frontend
- **React 19** - UI library
- **Vite** - Build tool
- **Socket.io Client** - Real-time client
- **Axios** - HTTP client
- **Web Speech API** - Voice input

### AI Services
- **Google Gemini** - Embeddings (gemini-embedding-001)
- **Groq Llama 3.1** - LLM for interview responses

---

## 📝 License

MIT License - Feel free to use and modify!

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📞 Support

For issues or questions, please open a GitHub issue.

---

**Built with ❤️ using AI**