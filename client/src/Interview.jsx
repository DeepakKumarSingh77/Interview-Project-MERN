import { useState, useEffect, useRef, useCallback } from 'react';
import socket from './socket';

const SILENCE_TIMEOUT = 7;

const Interview = ({ onFinish }) => {
    const [isListening, setIsListening]   = useState(false);
    const [isSpeaking, setIsSpeaking]     = useState(false);
    const [transcript, setTranscript]     = useState('');
    const [aiResponse, setAiResponse]     = useState('');
    const [questionNum, setQuestionNum]   = useState(0);
    const [elapsed, setElapsed]           = useState(0);
    const [messages, setMessages]         = useState([]);
    const [isThinking, setIsThinking]     = useState(true);
    const [phase, setPhase]               = useState('intro');
    const [countdownVal, setCountdownVal] = useState(SILENCE_TIMEOUT);

    // ── Refs ──────────────────────────────────────────────────────────────────
    const phaseRef             = useRef('intro');
    const fullResponseRef      = useRef('');
    const startTimeRef         = useRef(Date.now());
    const silenceTimerRef      = useRef(null);
    const countdownIntervalRef = useRef(null);
    const recognitionRef       = useRef(null);
    const messagesEndRef       = useRef(null);

    // Keep phaseRef in sync
    useEffect(() => { phaseRef.current = phase; }, [phase]);

    // ── Session timer ─────────────────────────────────────────────────────────
    useEffect(() => {
        const t = setInterval(() =>
            setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
        return () => clearInterval(t);
    }, []);

    const formatTime = (s) =>
        `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    // ── Silence countdown helpers ─────────────────────────────────────────────
    const clearSilenceCountdown = useCallback(() => {
        clearTimeout(silenceTimerRef.current);
        clearInterval(countdownIntervalRef.current);
    }, []);

    const startSilenceCountdown = useCallback((onExpire) => {
        clearSilenceCountdown();
        setCountdownVal(SILENCE_TIMEOUT);
        let remaining = SILENCE_TIMEOUT;
        countdownIntervalRef.current = setInterval(() => {
            remaining -= 1;
            setCountdownVal(remaining);
            if (remaining <= 0) clearInterval(countdownIntervalRef.current);
        }, 1000);
        silenceTimerRef.current = setTimeout(onExpire, SILENCE_TIMEOUT * 1000);
    }, [clearSilenceCountdown]);

    // ── Hard stop everything ──────────────────────────────────────────────────
    const stopAll = useCallback(() => {
        // 1. Kill mic
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (_) {}
            recognitionRef.current = null;
        }
        // 2. Kill TTS
        window.speechSynthesis.cancel();
        // 3. Kill countdown
        clearSilenceCountdown();
        setCountdownVal(SILENCE_TIMEOUT);
        // 4. Update UI state
        setIsListening(false);
        setIsSpeaking(false);
        setIsThinking(false);
        // 5. Lock phase
        phaseRef.current = 'done';
        setPhase('done');
    }, [clearSilenceCountdown]);

    // Wire stopAll so speakText can reference it
    useEffect(() => { }, [stopAll]);

    // ── startListening ────────────────────────────────────────────────────────
    const startListening = useCallback(() => {
        if (phaseRef.current === 'done') return;
        if (recognitionRef.current) return;

        window.speechSynthesis.cancel();
        setIsSpeaking(false);

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { console.warn('SpeechRecognition not supported'); return; }

        const recognition = new SR();
        recognitionRef.current = recognition;
        recognition.continuous     = true;
        recognition.interimResults = true;
        recognition.lang           = 'en-US';

        let finalTranscript = '';

        recognition.onstart = () => {
            setIsListening(true);
            startSilenceCountdown(() => recognition.stop());
        };

        recognition.onresult = (e) => {
            startSilenceCountdown(() => recognition.stop());
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; ++i) {
                if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
                else interim += e.results[i][0].transcript;
            }
            setTranscript(finalTranscript + interim);
        };

        recognition.onend = () => {
            setIsListening(false);
            clearSilenceCountdown();
            setCountdownVal(SILENCE_TIMEOUT);
            recognitionRef.current = null;

            // ✅ Double-check — never emit once done
            if (phaseRef.current === 'done') return;

            const textToSend = finalTranscript.trim() || '[No answer provided]';
            setMessages(prev => [...prev, { role: 'human', text: textToSend }]);
            setIsThinking(true);
            socket.emit('user_message', textToSend);
            setTranscript('');
        };

        recognition.onerror = (err) => {
            console.error('Speech error:', err.error);
            setIsListening(false);
            clearSilenceCountdown();
            recognitionRef.current = null;
        };

        recognition.start();

        // Hard ceiling 60 s
        setTimeout(() => {
            if (recognitionRef.current === recognition) recognition.stop();
        }, 60000);
    }, [startSilenceCountdown, clearSilenceCountdown]);

    // ── speakText — plays AI audio then AUTO-OPENS mic (unless phase=done) ─────
    const speakText = useCallback((text) => {
        if (!text) return;
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.lang = 'en-US';

        utterance.onstart = () => setIsSpeaking(true);

        utterance.onend = () => {
            setIsSpeaking(false);
            // Only open mic if interview is still active
            if (phaseRef.current !== 'done') {
                setTimeout(startListening, 400);
            }
        };

        utterance.onerror = () => {
            setIsSpeaking(false);
            if (phaseRef.current !== 'done') {
                setTimeout(startListening, 400);
            }
        };

        const keepAlive = setInterval(() => {
            if (!window.speechSynthesis.speaking) { clearInterval(keepAlive); return; }
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
        }, 10000);

        window.speechSynthesis.speak(utterance);
    }, [startListening]);

    // ── Socket events ─────────────────────────────────────────────────────────
    useEffect(() => {
        socket.on('ai_answer', (chunk) => {
            setIsThinking(false);
            fullResponseRef.current += chunk;
            setAiResponse(prev => prev + chunk);
        });

        // Normal question answer — mic auto-opens after
        socket.on('ai_done', () => {
            const text = fullResponseRef.current;
            setMessages(prev => [...prev, { role: 'ai', text }]);
            setAiResponse('');
            fullResponseRef.current = '';
            speakText(text);
        });

        // ✅ Final feedback — speak it, then redirect home
        socket.on('ai_feedback', (text) => {
            setIsThinking(false);
            setAiResponse('');
            fullResponseRef.current = '';

            // 1. Stop mic + countdown but DO NOT cancel TTS yet
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (_) {}
                recognitionRef.current = null;
            }
            clearSilenceCountdown();
            setIsListening(false);
            setIsThinking(false);
            phaseRef.current = 'done';
            setPhase('done');

            // 2. Show feedback in chat
            setMessages(prev => [...prev, { role: 'ai', text, isFeedback: true }]);

            // 3. Speak feedback, redirect home when speech finishes
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.05;
            utterance.lang = 'en-US';
            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => {
                setIsSpeaking(false);
                // ✅ Redirect to home after feedback is fully spoken
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500); // 1.5s pause so user knows it's done
            };
            utterance.onerror = () => {
                setIsSpeaking(false);
                setTimeout(() => { window.location.href = '/'; }, 1500);
            };
            window.speechSynthesis.speak(utterance);
        });

        socket.on('question_count', (count) => {
            setQuestionNum(count);
            setPhase(count >= 5 ? 'closing' : 'technical');
        });

        socket.on('interview_done', () => {
            // Only stop mic — don't cancel TTS (feedback may still be speaking)
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (_) {}
                recognitionRef.current = null;
            }
            clearSilenceCountdown();
            phaseRef.current = 'done';
            setPhase('done');
            setIsListening(false);
            setIsThinking(false);
        });

        return () => {
            socket.off('ai_answer');
            socket.off('ai_done');
            socket.off('ai_feedback');
            socket.off('question_count');
            socket.off('interview_done');
        };
    }, [speakText, stopAll, clearSilenceCountdown]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, aiResponse]);

    // ── Derived UI ────────────────────────────────────────────────────────────
    const progressPct    = Math.min((questionNum / 5) * 100, 100);
    const countdownColor = countdownVal <= 3 ? '#ef4444' : countdownVal <= 5 ? '#f59e0b' : '#10b981';
    const radius         = 26;
    const circ           = 2 * Math.PI * radius;
    const dash           = circ - (circ * countdownVal) / SILENCE_TIMEOUT;

    const statusLabel =
        phase === 'done'   ? '✅ Interview Complete — Thank you!'
        : isListening      ? `Listening... auto-submit in ${countdownVal}s`
        : isSpeaking       ? 'AI is speaking — mic opens automatically after'
        : isThinking       ? 'AI is thinking...'
        : phase === 'intro'? 'Interviewer is greeting you...'
        :                    'Mic will open automatically after AI speaks';

    const micBg =
        isListening        ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
        : isSpeaking       ? 'rgba(99,102,241,0.15)'
        : phase === 'done' ? 'rgba(52,211,153,0.15)'
        :                    'linear-gradient(135deg, #6366f1, #8b5cf6)';

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');
                *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
                body { background: #0a0a0f; font-family: 'DM Sans', sans-serif; color: #e8e8f0; }
                .iv-wrap { max-width: 760px; margin: 0 auto; padding: 24px; min-height: 100vh; display: flex; flex-direction: column; gap: 16px; }
                .iv-topbar { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px 20px; backdrop-filter: blur(12px); }
                .iv-logo { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 800; background: linear-gradient(135deg, #a5b4fc, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
                .iv-meta { display: flex; align-items: center; gap: 16px; }
                .iv-timer { font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; color: #6b7280; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; }
                .timer-dot { width: 6px; height: 6px; border-radius: 50%; background: #ef4444; animation: pulse 1s infinite; }
                .iv-qcount { font-size: 12px; font-weight: 500; color: #4b5563; letter-spacing: 0.05em; text-transform: uppercase; }
                .iv-progress-bar { height: 3px; background: rgba(255,255,255,0.05); border-radius: 100px; overflow: hidden; }
                .iv-progress-fill { height: 100%; width: ${progressPct}%; background: linear-gradient(90deg, #6366f1, #c084fc); border-radius: 100px; transition: width 0.6s ease; }
                .iv-status { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; font-size: 13px; }
                .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
                .iv-chat { flex: 1; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 24px; overflow-y: auto; min-height: 360px; max-height: 420px; display: flex; flex-direction: column; gap: 16px; scroll-behavior: smooth; }
                .iv-chat::-webkit-scrollbar { width: 4px; }
                .iv-chat::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 100px; }
                .msg { display: flex; gap: 10px; animation: msgIn 0.3s ease both; }
                .msg.human { flex-direction: row-reverse; }
                .msg-avatar { width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; }
                .msg.ai .msg-avatar { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
                .msg.human .msg-avatar { background: rgba(255,255,255,0.07); }
                .msg-bubble { max-width: 80%; padding: 12px 16px; border-radius: 14px; font-size: 14px; line-height: 1.65; font-weight: 300; }
                .msg.ai .msg-bubble { background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.15); color: #e0e0f0; border-top-left-radius: 4px; }
                .msg.human .msg-bubble { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: #9ca3af; border-top-right-radius: 4px; }
                .msg-streaming { display: flex; gap: 10px; }
                .msg-streaming .msg-bubble { background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.15); color: #e0e0f0; font-size: 14px; line-height: 1.65; font-weight: 300; padding: 12px 16px; border-radius: 14px; border-top-left-radius: 4px; max-width: 80%; }
                .thinking { display: flex; gap: 5px; align-items: center; padding: 4px 0; }
                .thinking span { width: 6px; height: 6px; border-radius: 50%; background: #6366f1; animation: bounce 1.2s infinite; }
                .thinking span:nth-child(2) { animation-delay: 0.2s; }
                .thinking span:nth-child(3) { animation-delay: 0.4s; }
                .iv-done-banner { background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.2); border-radius: 14px; padding: 20px 24px; text-align: center; }
                .iv-done-banner h3 { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700; color: #34d399; margin-bottom: 6px; }
                .iv-done-banner p { font-size: 13px; color: #6b7280; font-weight: 300; }
                .iv-controls { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 24px; }
                .iv-mic-row { display: flex; align-items: center; gap: 16px; }
                .mic-ring-wrap { position: relative; width: 64px; height: 64px; flex-shrink: 0; }
                .mic-ring-wrap svg { position: absolute; top: 0; left: 0; transform: rotate(-90deg); pointer-events: none; }
                .mic-btn { position: absolute; top: 0; left: 0; width: 64px; height: 64px; border-radius: 18px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 24px; transition: all 0.3s ease; }
                .mic-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
                .mic-info { flex: 1; }
                .mic-label { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; color: #f0f0f8; margin-bottom: 4px; }
                .mic-sub { font-size: 12px; color: #4b5563; font-weight: 300; }
                .transcript-preview { margin-top: 16px; padding: 12px 16px; background: rgba(245,158,11,0.05); border: 1px solid rgba(245,158,11,0.15); border-radius: 10px; font-size: 13px; color: #fbbf24; font-style: italic; }
                .iv-hint { text-align: center; font-size: 12px; color: #374151; margin-top: 12px; font-weight: 300; }
                @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
                @keyframes bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
                @keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                @media (max-width: 480px) { .iv-wrap { padding: 12px; } .iv-chat { min-height: 280px; max-height: 320px; } .msg-bubble { max-width: 90%; } }
            `}</style>

            <div className="iv-wrap">

                <div className="iv-topbar">
                    <span className="iv-logo">⚡ AI Interviewer</span>
                    <div className="iv-meta">
                        <span className="iv-qcount">
                            {phase === 'intro' ? 'Intro' : phase === 'done' ? 'Complete' : `Q ${questionNum} / 5`}
                        </span>
                        <div className="iv-timer">
                            <span className="timer-dot" />
                            {formatTime(elapsed)}
                        </div>
                    </div>
                </div>

                <div className="iv-progress-bar">
                    <div className="iv-progress-fill" />
                </div>

                <div className="iv-status">
                    <div className="status-dot" style={{
                        background: phase === 'done' ? '#34d399' : isListening ? '#f59e0b' : isSpeaking ? '#6366f1' : isThinking ? '#10b981' : '#374151',
                        animation: (isListening || isSpeaking || isThinking) && phase !== 'done' ? 'pulse 1s infinite' : 'none',
                    }} />
                    <span style={{ color: '#6b7280', fontSize: '13px' }}>{statusLabel}</span>
                </div>

                <div className="iv-chat">
                    {messages.map((m, i) => (
                        <div key={i} className={`msg ${m.role}`}>
                            <div className="msg-avatar">{m.role === 'ai' ? '🤖' : '👤'}</div>
                            <div className="msg-bubble">{m.text}</div>
                        </div>
                    ))}

                    {aiResponse && (
                        <div className="msg-streaming">
                            <div className="msg-avatar" style={{ width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0 }}>🤖</div>
                            <div className="msg-bubble">{aiResponse}</div>
                        </div>
                    )}

                    {isThinking && !aiResponse && phase !== 'done' && (
                        <div className="msg-streaming">
                            <div className="msg-avatar" style={{ width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0 }}>🤖</div>
                            <div className="msg-bubble">
                                <div className="thinking"><span /><span /><span /></div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* ── Done banner replaces controls ── */}
                {phase === 'done' ? (
                    <div className="iv-done-banner">
                        <h3>✅ Interview Complete</h3>
                        <p>{isSpeaking ? '🔊 Playing your feedback — redirecting after...' : 'Redirecting to home page...'}</p>
                    </div>
                ) : (
                    <div className="iv-controls">
                        <div className="iv-mic-row">
                            <div className="mic-ring-wrap">
                                {isListening && (
                                    <svg width="64" height="64" viewBox="0 0 64 64">
                                        <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                                        <circle
                                            cx="32" cy="32" r={radius} fill="none"
                                            stroke={countdownColor} strokeWidth="3"
                                            strokeDasharray={circ} strokeDashoffset={dash}
                                            strokeLinecap="round"
                                            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                                        />
                                    </svg>
                                )}
                                <button
                                    className="mic-btn"
                                    style={{
                                        background: micBg,
                                        border: `1px solid ${isListening ? 'rgba(245,158,11,0.4)' : 'transparent'}`,
                                        boxShadow: isListening ? '0 0 32px rgba(245,158,11,0.3)' : '0 8px 32px rgba(99,102,241,0.25)',
                                    }}
                                    onClick={startListening}
                                    disabled={isListening || isSpeaking || isThinking}
                                >
                                    {isListening ? '🔴' : '🎤'}
                                </button>
                            </div>

                            <div className="mic-info">
                                <div className="mic-label">
                                    {isListening  ? `Recording... ${countdownVal}s`
                                    : isSpeaking  ? 'AI is speaking...'
                                    : isThinking  ? 'AI is thinking...'
                                    :               'Your turn to speak'}
                                </div>
                                <div className="mic-sub">
                                    {isListening  ? 'Auto-submits if silent for 7s'
                                    : isSpeaking  ? 'Mic opens automatically when AI finishes'
                                    : isThinking  ? 'Please wait...'
                                    :               'Mic opens automatically after AI speaks'}
                                </div>
                            </div>
                        </div>

                        {transcript && (
                            <div className="transcript-preview">"{transcript}"</div>
                        )}

                        <p className="iv-hint">🔒 Session is private • mic opens automatically after each question</p>
                    </div>
                )}
            </div>
        </>
    );
};

export default Interview;

