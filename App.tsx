
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chat } from '@google/genai';
import { Message, Sender, SpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionErrorEvent } from './types'; // Added SpeechRecognition types
import { geminiService } from './services/geminiService';
import MicIcon from './components/MicIcon';
import StopIcon from './components/StopIcon';
import VolumeUpIcon from './components/VolumeUpIcon';
import LoadingSpinner from './components/LoadingSpinner';
import ChatMessageBubble from './components/ChatMessageBubble';

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition: SpeechRecognition | null = null;

if (SpeechRecognitionAPI) {
  recognition = new SpeechRecognitionAPI();
  recognition.continuous = false; // Process after user stops speaking for a moment.
  recognition.interimResults = true;
  recognition.lang = 'ja-JP'; // Changed to Japanese
}

const App: React.FC = () => {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const userTranscriptRef = useRef<string>(''); // To hold transcript between recognition results
  const [isLoadingAI, setIsLoadingAI] = useState<boolean>(false);
  const [isAISpeaking, setIsAISpeaking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [apiKeyMissing, setApiKeyMissing] = useState<boolean>(false);

  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    if (!process.env.API_KEY) {
      setError("Critical Error: API_KEY is not configured. The application cannot function.");
      setApiKeyMissing(true);
      setIsInitialized(false); // Prevent further initialization
      return;
    }
    setApiKeyMissing(false);

    async function initializeChat() {
      try {
        const newChat = geminiService.createChatSession();
        setChat(newChat);

        const initialMessageText = "こんにちは！私はあなたのAI日本語練習パートナーです。今日の調子はどうですか？"; // Changed to Japanese
        
        setMessages([{ id: Date.now().toString(), text: initialMessageText, sender: Sender.AI, timestamp: new Date() }]);
        speakText(initialMessageText); // Speak after setting state
        setIsInitialized(true);
      } catch (e: any) {
        console.error("Initialization failed:", e);
        setError(`Initialization failed: ${e.message || 'Unknown error'}. Please ensure your API key is valid and check network connection.`);
        setIsInitialized(false);
      }
    }
    initializeChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      setError("Text-to-Speech not supported in this browser.");
      return;
    }
    // Cancel any ongoing speech before starting new one
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP'; // Changed to Japanese
    utterance.onstart = () => setIsAISpeaking(true);
    utterance.onend = () => setIsAISpeaking(false);
    utterance.onerror = (event) => {
      console.error("SpeechSynthesis Error:", event);
      setError(`Text-to-speech error: ${event.error}`);
      setIsAISpeaking(false);
    };
    speechSynthesis.speak(utterance);
  }, []);


  const processAndSendTranscript = useCallback(async (transcript: string) => {
    const trimmedTranscript = transcript.trim();
    if (trimmedTranscript && chat) {
      setMessages(prev => [...prev, { id: Date.now().toString(), text: trimmedTranscript, sender: Sender.USER, timestamp: new Date() }]);
      
      setIsLoadingAI(true);
      try {
        const aiResponseText = await geminiService.getAIChatResponse(trimmedTranscript, chat);
        setMessages(prev => [...prev, { id: (Date.now()+1).toString(), text: aiResponseText, sender: Sender.AI, timestamp: new Date() }]);
        speakText(aiResponseText);
      } catch (e: any) {
        console.error("AI response error:", e);
        const errorMessage = `Error getting AI response: ${e.message || 'Unknown error'}`;
        setError(errorMessage);
        const fallbackMessage = "申し訳ありません、問題が発生しました。もう一度試していただけますか？"; // Japanese fallback
        setMessages(prev => [...prev, { id: (Date.now()+1).toString(), text: fallbackMessage, sender: Sender.AI, timestamp: new Date() }]);
        speakText(fallbackMessage);
      } finally {
        setIsLoadingAI(false);
      }
    }
    userTranscriptRef.current = ''; // Clear accumulated transcript
    setInterimTranscript(''); // Clear interim display
  }, [chat, speakText]);


  useEffect(() => {
    if (!recognition || !isRecording) return;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let currentInterim = '';
      let currentFinal = userTranscriptRef.current; // Start with previously finalized parts

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          currentFinal += transcriptPart + ' ';
        } else {
          currentInterim += transcriptPart;
        }
      }
      userTranscriptRef.current = currentFinal; // Update ref with finalized parts
      setInterimTranscript(currentInterim); // Display current interim part
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        setError("何も聞こえませんでした。もう一度話してみてください。"); // Japanese error
      } else if (event.error === 'audio-capture') {
        setError("音声キャプチャエラー。マイクを確認してください。"); // Japanese error
      } else if (event.error === 'not-allowed') {
        setError("マイクへのアクセスが拒否されました。ブラウザの設定でマイクの許可を有効にしてください。"); // Japanese error
      } else {
        setError(`音声認識エラー: ${event.error}`); // Japanese error
      }
      setIsRecording(false);
      userTranscriptRef.current = '';
      setInterimTranscript('');
    };
    
    recognition.onend = () => {
        // This is called when recognition service disconnects.
        // If 'continuous' is false, it's when user stops talking.
        // If 'isRecording' is still true, it means it wasn't an intentional stop by user button.
        // We want to process the transcript gathered so far.
        if (isRecording) { 
            setIsRecording(false); 
            processAndSendTranscript(userTranscriptRef.current);
        }
    };

  }, [isRecording, processAndSendTranscript]);


  const handleToggleRecording = useCallback(async () => {
    if (apiKeyMissing || !isInitialized || !recognition) {
      if (!recognition) setError("音声認識はこのブラウザでは利用できません。"); // Japanese error
      return;
    }

    if (isAISpeaking) { 
        speechSynthesis.cancel();
        setIsAISpeaking(false);
    }

    if (isRecording) { 
      recognition.stop(); 
      setIsRecording(false); 
      // processAndSendTranscript is called by recognition.onend if isRecording was true
    } else { 
      try {
        // Ensure microphone permission before starting, good practice
        await navigator.mediaDevices.getUserMedia({ audio: true }); 
        userTranscriptRef.current = ''; 
        setInterimTranscript('');
        recognition.start();
        setIsRecording(true);
        setError(null); 
      } catch (err: any) {
        console.error("Error starting recognition or getting mic permission:", err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setError("マイクへのアクセスが拒否されました。ブラウザの設定でマイクの許可を有効にしてください。"); // Japanese error
        } else {
            setError("録音を開始できませんでした。マイクを確認してください。"); // Japanese error
        }
        setIsRecording(false);
      }
    }
  }, [isRecording, isAISpeaking, isInitialized, apiKeyMissing, processAndSendTranscript]);

  if (apiKeyMissing) {
    return (
      <div className="flex items-center justify-center h-screen bg-red-100 text-red-700 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">設定エラー</h1>
          <p>{error}</p>
          <p className="mt-2 text-sm">アプリケーション管理者に連絡してください。</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-screen max-h-screen bg-gray-100 font-sans">
      <header className="bg-blue-600 text-white p-4 shadow-md">
        <h1 className="text-xl font-semibold text-center">Khanh Chi Practice Japanese</h1>
      </header>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 m-4 rounded shadow-md" role="alert">
          <p className="font-bold">エラー</p>
          <p>{error}</p>
        </div>
      )}

      <main className="flex-grow p-4 overflow-y-auto space-y-4 bg-gray-200">
        {!isInitialized && !apiKeyMissing && (
             <div className="flex flex-col items-center justify-center h-full">
                <LoadingSpinner size="w-12 h-12"/>
                <p className="text-gray-600 mt-4">AIパートナーを初期化中...</p>
             </div>
        )}
        {isInitialized && messages.map((msg) => (
          <ChatMessageBubble key={msg.id} message={msg} />
        ))}
        {isRecording && interimTranscript && (
          <div className="flex justify-end mb-4">
            <div className="bg-blue-100 text-blue-700 max-w-xs lg:max-w-md px-4 py-3 rounded-xl shadow-md italic">
              <p className="text-sm">{userTranscriptRef.current + interimTranscript}...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="bg-white p-4 border-t border-gray-300 shadow- ऊपर">
        <div className="flex items-center justify-center space-x-4">
          <div className="w-10 h-10 flex items-center justify-center">
            {isLoadingAI && <LoadingSpinner size="w-6 h-6" />}
            {isAISpeaking && !isLoadingAI && <VolumeUpIcon />}
          </div>

          <button
            onClick={handleToggleRecording}
            disabled={!isInitialized || isLoadingAI || apiKeyMissing}
            className={`p-4 rounded-full text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-lg
                        ${isRecording ? 'bg-red-500 hover:bg-red-600 focus:ring-red-400 animate-pulse' : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-400'}
                        ${(!isInitialized || isLoadingAI || apiKeyMissing) ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-label={isRecording ? "録音停止" : "録音開始"}
          >
            {isRecording ? <StopIcon /> : <MicIcon />}
          </button>
          <div className="w-10 h-10"></div> {/* Spacer */}
        </div>
        {isRecording && !interimTranscript && !userTranscriptRef.current &&(
             <p className="text-center text-sm text-gray-500 mt-2">聞き取り中...</p>
        )}
        {isRecording && (userTranscriptRef.current || interimTranscript) && (
            <p className="text-center text-sm text-gray-500 mt-2 italic">
                {userTranscriptRef.current + interimTranscript}...
            </p>
        )}
      </footer>
    </div>
  );
};

export default App;
