'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, X, RotateCcw } from 'lucide-react';

export default function SettingsPage() {
  const [groqKey, setGroqKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [groqStatus, setGroqStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [geminiStatus, setGeminiStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [message, setMessage] = useState('');
  const [isElectron] = useState(() => typeof window !== 'undefined' && !!(window as any).electron);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    if (!(window as any).electron) return;
    try {
      const config = await (window as any).electron.getConfig();
      if (config.groqApiKey) setGroqKey(config.groqApiKey);
      if (config.geminiApiKey) setGeminiKey(config.geminiApiKey);
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  }

  async function testGroqKey(key: string) {
    if (!key) return false;
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function testGeminiKey(key: string) {
    if (!key) return false;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2-5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'test' }] }],
          }),
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async function validateGroq() {
    if (!groqKey) {
      setGroqStatus('invalid');
      return;
    }
    setGroqStatus('validating');
    const valid = await testGroqKey(groqKey);
    setGroqStatus(valid ? 'valid' : 'invalid');
  }

  async function validateGemini() {
    if (!geminiKey) {
      setGeminiStatus('idle');
      return;
    }
    setGeminiStatus('validating');
    const valid = await testGeminiKey(geminiKey);
    setGeminiStatus(valid ? 'valid' : 'invalid');
  }

  async function save() {
    if (!groqKey) {
      setMessage('Groq API key is required');
      return;
    }
    if (!geminiKey) {
      setMessage('Gemini API key is required');
      return;
    }

    if (groqStatus !== 'valid') {
      setMessage('Please validate the Groq API key first');
      return;
    }

    if (geminiStatus !== 'valid') {
      setMessage('Please validate the Gemini API key first');
      return;
    }

    if (!isElectron) {
      setMessage('Settings saving only works in the Electron app');
      return;
    }

    try {
      const config = {
        groqApiKey: groqKey,
        geminiApiKey: geminiKey,
      };
      await (window as any).electron.saveConfig(config);
      setMessage('Settings saved! Restart the app for changes to take effect.');
    } catch (err: any) {
      setMessage(`Save failed: ${err.message}`);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/" className="hover:text-purple-400 transition">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-3xl font-bold">API Settings</h1>
        </div>

        {/* Message */}
        {message && (
          <div className="mb-6 p-4 rounded-lg bg-blue-500/20 border border-blue-500/50 text-blue-200">
            {message}
          </div>
        )}

        {/* Settings Card */}
        <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-6 space-y-6">
          {/* Groq Key */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-lg">Groq API Key *</label>
              <button
                onClick={validateGroq}
                className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
                  groqStatus === 'validating'
                    ? 'bg-yellow-500/30 text-yellow-200 cursor-wait'
                    : groqStatus === 'valid'
                      ? 'bg-green-500/30 text-green-200'
                      : groqStatus === 'invalid'
                        ? 'bg-red-500/30 text-red-200'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                disabled={groqStatus === 'validating'}
              >
                {groqStatus === 'validating' && <RotateCcw className="w-4 h-4 animate-spin" />}
                {groqStatus === 'valid' && <Check className="w-4 h-4" />}
                {groqStatus === 'invalid' && <X className="w-4 h-4" />}
                {groqStatus === 'idle' || groqStatus === 'validating' ? 'Validate' : groqStatus === 'valid' ? 'Valid' : 'Invalid'}
              </button>
            </div>
            <input
              type="password"
              placeholder="gsk_..."
              value={groqKey}
              onChange={(e) => {
                setGroqKey(e.target.value);
                setGroqStatus('idle');
              }}
              className="w-full px-4 py-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-purple-500 focus:outline-none transition text-white placeholder-gray-400"
            />
            <p className="text-sm text-gray-400">
              Get your key at{' '}
              <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                console.groq.com
              </a>
              . Required for text analysis.
            </p>
          </div>

          {/* Gemini Key */}
          <div className="space-y-3 pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-lg">Gemini API Key *</label>
              <button
                onClick={validateGemini}
                className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
                  geminiStatus === 'validating'
                    ? 'bg-yellow-500/30 text-yellow-200 cursor-wait'
                    : geminiStatus === 'valid'
                      ? 'bg-green-500/30 text-green-200'
                      : geminiStatus === 'invalid'
                        ? 'bg-red-500/30 text-red-200'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                disabled={geminiStatus === 'validating' || !geminiKey}
              >
                {geminiStatus === 'validating' && <RotateCcw className="w-4 h-4 animate-spin" />}
                {geminiStatus === 'valid' && <Check className="w-4 h-4" />}
                {geminiStatus === 'invalid' && <X className="w-4 h-4" />}
                {geminiStatus === 'idle' || geminiStatus === 'validating' ? 'Validate' : geminiStatus === 'valid' ? 'Valid' : 'Invalid'}
              </button>
            </div>
            <input
              type="password"
              placeholder="AIzaSy_..."
              value={geminiKey}
              onChange={(e) => {
                setGeminiKey(e.target.value);
                setGeminiStatus('idle');
              }}
              className="w-full px-4 py-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-purple-500 focus:outline-none transition text-white placeholder-gray-400"
            />
            <p className="text-sm text-gray-400">
              Get your key at{' '}
              <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                aistudio.google.com
              </a>
              . Free: 500 images/day, no credit card.
            </p>
          </div>

          {/* Save Button */}
          <div className="pt-4 border-t border-gray-700">
            <button
              onClick={save}
              disabled={groqStatus !== 'valid'}
              className={`w-full py-3 rounded-lg font-semibold transition ${
                groqStatus !== 'valid'
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700'
              }`}
            >
              Save Settings
            </button>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Note: You'll need to restart the app for changes to take effect.
            </p>
          </div>

          {!isElectron && (
            <div className="p-4 rounded-lg bg-yellow-500/20 border border-yellow-500/50 text-yellow-200">
              <p className="text-sm">
                ⚠️ Settings saving only works when running the Electron desktop app. In web mode, edit your .env file directly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
