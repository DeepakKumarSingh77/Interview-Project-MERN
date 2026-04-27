import { useState } from 'react';
import axios from 'axios';
import socket from './socket';
import Interview from './Interview';

function App() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [readyToInterview, setReadyToInterview] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('resume', file);
    try {
      setStatus('loading');
      setStatusMsg('Analyzing your resume...');
      const response = await axios.post('http://localhost:5000/api/resume/upload', formData);
      if (response.status === 200) {
        setStatus('success');
        setStatusMsg('Resume indexed successfully!');
        setReadyToInterview(true);
      }
    } catch (err) {
      console.error("FULL ERROR:", err);
      setStatus('error');
      setStatusMsg('Upload failed. Please try again.');
    }
  };

  const handleStartInterview = () => {
    setInterviewStarted(true);
    socket.emit('start_interview');
  };

  // ✅ Reset everything and go back to home page
  const handleFinish = () => {
    setInterviewStarted(false);
    setReadyToInterview(false);
    setFile(null);
    setStatus('idle');
    setStatusMsg('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') setFile(dropped);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #0a0a0f;
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
          color: #e8e8f0;
          overflow-x: hidden;
        }

        .bg-grid {
          position: fixed; inset: 0; z-index: 0;
          background-image: 
            linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        .bg-glow {
          position: fixed; inset: 0; z-index: 0;
          background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.15), transparent),
                      radial-gradient(ellipse 60% 40% at 80% 80%, rgba(168,85,247,0.08), transparent);
        }

        .container {
          position: relative; z-index: 1;
          max-width: 720px;
          margin: 0 auto;
          padding: 60px 24px;
        }

        .header {
          text-align: center;
          margin-bottom: 56px;
          animation: fadeDown 0.7s ease both;
        }

        .badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(99,102,241,0.12);
          border: 1px solid rgba(99,102,241,0.25);
          border-radius: 100px;
          padding: 6px 16px;
          font-size: 12px; font-weight: 500; letter-spacing: 0.08em;
          text-transform: uppercase; color: #a5b4fc;
          margin-bottom: 20px;
        }

        .badge-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #6366f1;
          animation: pulse 2s infinite;
        }

        .title {
          font-family: 'Syne', sans-serif;
          font-size: clamp(36px, 7vw, 56px);
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, #fff 0%, #a5b4fc 50%, #c084fc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 16px;
        }

        .subtitle {
          color: #6b7280;
          font-size: 16px;
          font-weight: 300;
          line-height: 1.6;
        }

        .card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 32px;
          margin-bottom: 16px;
          backdrop-filter: blur(12px);
          animation: fadeUp 0.7s ease both;
        }

        .step-label {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 24px;
        }

        .step-num {
          width: 28px; height: 28px; border-radius: 8px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Syne', sans-serif;
          font-size: 13px; font-weight: 700; color: white;
          flex-shrink: 0;
        }

        .step-title {
          font-family: 'Syne', sans-serif;
          font-size: 18px; font-weight: 700;
          color: #f0f0f8;
        }

        .drop-zone {
          border: 1.5px dashed rgba(99,102,241,0.3);
          border-radius: 14px;
          padding: 40px 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.25s ease;
          background: rgba(99,102,241,0.03);
          position: relative;
        }

        .drop-zone:hover {
          border-color: rgba(99,102,241,0.5);
          background: rgba(99,102,241,0.06);
        }

        .drop-zone input[type="file"] {
          position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%;
        }

        .upload-icon { font-size: 36px; margin-bottom: 12px; display: block; }
        .drop-text { color: #9ca3af; font-size: 14px; line-height: 1.6; }
        .drop-text strong { color: #a5b4fc; }

        .file-pill {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(99,102,241,0.12);
          border: 1px solid rgba(99,102,241,0.2);
          border-radius: 100px;
          padding: 8px 16px;
          font-size: 13px; color: #a5b4fc;
          margin-top: 16px;
        }

        .btn-primary {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none; border-radius: 12px;
          color: white;
          font-family: 'Syne', sans-serif;
          font-size: 15px; font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          margin-top: 20px;
          transition: all 0.2s ease;
          position: relative; overflow: hidden;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 32px rgba(99,102,241,0.4);
        }

        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .status-bar {
          display: flex; align-items: center; gap: 10px;
          margin-top: 16px; padding: 12px 16px;
          border-radius: 10px;
          font-size: 13px; font-weight: 500;
        }

        .spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(165,180,252,0.3);
          border-top-color: #a5b4fc;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }

        .btn-start {
          width: 100%;
          padding: 20px;
          background: transparent;
          border: 1.5px solid rgba(99,102,241,0.4);
          border-radius: 16px;
          color: #a5b4fc;
          font-family: 'Syne', sans-serif;
          font-size: 17px; font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex; align-items: center; justify-content: center; gap: 12px;
          animation: fadeUp 0.5s ease both;
          position: relative; overflow: hidden;
        }

        .btn-start:hover {
          border-color: rgba(99,102,241,0.8);
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(99,102,241,0.2);
          background: rgba(99,102,241,0.08);
        }

        @keyframes fadeDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="bg-grid" />
      <div className="bg-glow" />

      <div className="container">
        {!interviewStarted ? (
          <>
            <div className="header">
              <div className="badge">
                <span className="badge-dot" />
                AI-Powered Interview Platform
              </div>
              <h1 className="title">Your Interview,<br />Reimagined</h1>
              <p className="subtitle">Upload your resume and get a personalized<br />technical interview experience powered by AI</p>
            </div>

            <div className="card">
              <div className="step-label">
                <div className="step-num">1</div>
                <span className="step-title">Upload Resume</span>
              </div>

              <div
                className="drop-zone"
                style={{ borderColor: dragOver ? 'rgba(99,102,241,0.6)' : 'rgba(99,102,241,0.3)', background: dragOver ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.03)' }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files[0])} />
                <span className="upload-icon">📄</span>
                <p className="drop-text">
                  <strong>Click to upload</strong> or drag & drop<br />
                  PDF files only · Max 5MB
                </p>
                {file && <div className="file-pill">📎 {file.name}</div>}
              </div>

              <button
                className="btn-primary"
                onClick={handleUpload}
                disabled={!file || status === 'loading'}
              >
                {status === 'loading' ? 'Processing...' : 'Analyze Resume →'}
              </button>

              {statusMsg && (
                <div className="status-bar" style={{
                  background: status === 'success' ? 'rgba(16,185,129,0.1)' : status === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)',
                  border: `1px solid ${status === 'success' ? 'rgba(16,185,129,0.2)' : status === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)'}`,
                  color: status === 'success' ? '#34d399' : status === 'error' ? '#f87171' : '#a5b4fc',
                }}>
                  {status === 'loading' && <div className="spinner" />}
                  {status === 'success' && '✓'}
                  {status === 'error' && '✕'}
                  {statusMsg}
                </div>
              )}
            </div>

            {readyToInterview && (
              <div className="card" style={{ animationDelay: '0.1s' }}>
                <div className="step-label">
                  <div className="step-num">2</div>
                  <span className="step-title">Begin Interview</span>
                </div>
                <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px', lineHeight: 1.6 }}>
                  Your resume has been analyzed. The AI interviewer will greet you, ask about your experience, and conduct a structured 5-question technical interview.
                </p>
                <button className="btn-start" onClick={handleStartInterview}>
                  <span>🎙</span> Start Live Interview
                </button>
              </div>
            )}
          </>
        ) : (
          <Interview onFinish={handleFinish} />
        )}
      </div>
    </>
  );
}

export default App;
