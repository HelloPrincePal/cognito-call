import React, { useState } from 'react';
import { User, Check } from 'lucide-react';

export default function OnboardingModal({ 
  onSave 
}: { 
  onSave: (name: string) => void; 
}) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    localStorage.setItem('cognito_user_name', cleanName);
    onSave(cleanName);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-150 p-6 flex flex-col gap-6">
        {/* Header Branding */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center border border-purple-100 flex-shrink-0">
            <img src="/Logo_icon.svg" alt="Cognito Call" className="w-7 h-7 object-contain" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              Welcome to Cognito Call
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              100% Local & Private Meeting Intelligence
            </p>
          </div>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="user-name-input" className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-purple-600" />
              What is your name?
            </label>
            <input
              id="user-name-input"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ram"
              className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-purple-600 focus:bg-white focus:ring-2 focus:ring-purple-100 transition-all outline-none"
            />
            <p className="text-xs text-gray-400 leading-relaxed">
              Your name will be used to label your microphone stream and personalize AI transcriptions during meetings.
            </p>
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
              name.trim()
                ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <span>Get Started</span>
            <Check className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
