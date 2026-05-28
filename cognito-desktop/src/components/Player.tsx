import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// --- Type Definitions ---
interface Word { word: string; start: number; end: number; }
interface Segment { id: string; speaker: string; start: number; end: number; text: string; source: string; words: Word[]; }
interface Transcript { segments: Segment[]; }

export default function KaraokePlayer({ folderPath, videoUrl, transcriptUrl }: { folderPath: string, videoUrl: string, transcriptUrl?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  
  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // 1. Fetch transcript if it exists
  useEffect(() => {
    if (transcriptUrl) {
      fetch(transcriptUrl)
        .then(r => {
          if (!r.ok) throw new Error("Transcript file does not exist yet.");
          return r.json();
        })
        .then(setTranscript)
        .catch(err => {
          console.log(err.message);
          setTranscript(null);
        });
    }
  }, [transcriptUrl]);

  // 2. Listen for Tauri Rust events
  useEffect(() => {
    const unlisten = listen('transcription-progress', (event) => {
      try {
        const data = JSON.parse(event.payload as string);
        setStatusMessage(data.message);
        if (data.status === 'complete' || data.status === 'finished') {
          setIsProcessing(false);
          // Auto-fetch the newly generated transcript
          if (transcriptUrl) {
            // Add a cache-buster query param so the browser doesn't load the old 404 response
            fetch(`${transcriptUrl}?t=${Date.now()}`)
              .then(r => r.json())
              .then(setTranscript)
              .catch(console.error);
          }
        }
      } catch (e) { console.error(e); }
    });
    return () => { unlisten.then(f => f()); };
  }, [transcriptUrl]);

  // 3. Trigger Rust Command
  const startTranscription = async () => {
    try {
      setIsProcessing(true);
      setStatusMessage("Spawning transcription process...");
      await invoke('process_recording', { folderPath });
    } catch (error) {
      alert(error);
      setIsProcessing(false);
    }
  };

  // 4. Karaoke Click-to-Jump
  const jumpToTime = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  const formatTime = (secs: number) => {
    const min = Math.floor(secs / 60);
    const sec = Math.floor(secs % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="flex h-[60vh] bg-white text-[#171717] overflow-hidden rounded-xl border border-[#EBEBEB] shadow-sm">
      {/* LEFT: Video Player */}
      <div className="w-1/2 p-4 flex flex-col justify-center bg-black relative">
        <video 
          ref={videoRef} 
          src={videoUrl} 
          controls 
          className="w-full h-auto max-h-full rounded-lg shadow-lg border border-white/10"
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        />
        
        {!transcript && !isProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-all p-6 text-center">
            <p className="text-white font-semibold mb-4 text-sm max-w-xs">
              No transcript is available for this recording.
            </p>
            <button 
              onClick={startTranscription} 
              className="px-5 py-2.5 bg-[#335CFF] hover:bg-[#0c38e7] text-white text-xs font-bold rounded-lg shadow-md active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Generate AI Transcript & Diarization
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: Karaoke Transcript */}
      <div className="w-1/2 overflow-y-auto p-6 bg-[#F9F9FB] border-l border-[#EBEBEB]">
        
        {isProcessing && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-[#335CFF] select-none">
            <div className="w-10 h-10 border-4 border-[#335CFF] border-t-transparent rounded-full animate-spin mb-4"></div>
            <span className="text-base font-bold text-[#171717] mb-1">Processing Recording...</span>
            <span className="text-xs text-[#5C5C5C] max-w-xs">{statusMessage}</span>
          </div>
        )}

        {!transcript && !isProcessing && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 select-none">
            <svg className="w-12 h-12 mb-3 text-[#A3A3A3]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h10.5m-10.5 3h10.5m-10.5-9h10.5M5.25 21h13.5A2.25 2.25 0 0021 18.75V5.25A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25v13.5A2.25 2.25 0 005.25 21z" />
            </svg>
            <p className="text-sm font-semibold">Transcript Empty</p>
            <p className="text-xs text-[#A3A3A3] mt-1">Start transcription from the player to generate word alignments.</p>
          </div>
        )}

        {transcript && transcript.segments.map((segment) => {
          // Check if the current time falls within this segment
          const isSegmentActive = currentTime >= segment.start && currentTime <= segment.end;
          
          return (
            <div 
              key={segment.id} 
              className={`mb-5 p-4 rounded-xl border transition-all cursor-pointer ${
                isSegmentActive 
                  ? 'bg-white border-[#335CFF] shadow-sm pl-3 border-l-4' 
                  : 'bg-transparent border-transparent hover:bg-white hover:border-[#EBEBEB]'
              }`} 
              onClick={() => jumpToTime(segment.start)}
            >
              <div className="flex justify-between items-center mb-2 select-none">
                <span className={`font-bold text-xs ${
                  segment.source === 'mic' 
                    ? 'text-[#335CFF]' 
                    : 'text-purple-600'
                }`}>
                  {segment.speaker} {segment.source === 'mic' ? '(Me)' : ''}
                </span>
                <span className="text-[10px] font-semibold text-[#A3A3A3]">
                  {formatTime(segment.start)}
                </span>
              </div>
              
              <p className="text-sm leading-relaxed text-[#5C5C5C]">
                {segment.words.map((w, idx) => {
                  const isWordActive = currentTime >= w.start && currentTime <= w.end;
                  return (
                    <span 
                      key={idx} 
                      onClick={(e) => { e.stopPropagation(); jumpToTime(w.start); }}
                      className={`mr-1.5 transition-all px-0.5 rounded ${
                        isWordActive 
                          ? 'bg-blue-100 text-[#335CFF] font-semibold' 
                          : 'text-[#171717] hover:text-[#335CFF]'
                      }`}
                    >
                      {w.word}
                    </span>
                  )
                })}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  );
}
