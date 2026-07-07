'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, X, RotateCcw } from 'lucide-react';

export default function SettingsPage() {
  const [groqKey, setGroqKey] = useState('');
  const [cloudflareAccountId, setCloudflareAccountId] = useState('');
  const [cloudflareApiToken, setCloudflareApiToken] = useState('');
  const [videoBackend, setVideoBackend] = useState<'ffmpeg' | 'modal'>('ffmpeg');
  const [modalTokenId, setModalTokenId] = useState('');
  const [modalTokenSecret, setModalTokenSecret] = useState('');
  const [groqStatus, setGroqStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [cloudflareStatus, setCloudflareStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
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
      if (config.cloudflareAccountId) setCloudflareAccountId(config.cloudflareAccountId);
      if (config.cloudflareApiToken) setCloudflareApiToken(config.cloudflareApiToken);
      if (config.videoBackend) setVideoBackend(config.videoBackend);
      if (config.modalTokenId) setModalTokenId(config.modalTokenId);
      if (config.modalTokenSecret) setModalTokenSecret(config.modalTokenSecret);
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  }

  async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function testGroqKey(key: string) {
    if (!key) return false;
    try {
      const response = await fetchWithTimeout('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      }, 5000);
      return response.ok;
    } catch {
      return false;
    }
  }

  async function testCloudflareCreds(accountId: string, apiToken: string) {
    if (!accountId || !apiToken) return false;
    // Hit a Workers AI endpoint, not the general account-details endpoint — a
    // token scoped only to "Workers AI: Edit" (exactly what we tell users to
    // create) can't read general account details and would fail that check
    // even though it's perfectly valid for image generation. Listing models
    // is a read, so it's free and doesn't burn the daily allocation.
    try {
      const response = await fetchWithTimeout(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`,
        { headers: { Authorization: `Bearer ${apiToken}` } },
        5000
      );
      if (!response.ok) return false;
      const data = await response.json();
      return data.success === true;
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

  async function validateCloudflare() {
    if (!cloudflareAccountId || !cloudflareApiToken) {
      setCloudflareStatus('idle');
      return;
    }
    setCloudflareStatus('validating');
    const valid = await testCloudflareCreds(cloudflareAccountId, cloudflareApiToken);
    setCloudflareStatus(valid ? 'valid' : 'invalid');
  }

  async function save() {
    if (!groqKey) {
      setMessage('Groq API key is required');
      return;
    }
    if (!cloudflareAccountId || !cloudflareApiToken) {
      setMessage('Cloudflare Account ID and API Token are required');
      return;
    }

    if (groqStatus !== 'valid') {
      setMessage('Please validate the Groq API key first');
      return;
    }

    if (cloudflareStatus !== 'valid') {
      setMessage('Please validate the Cloudflare credentials first');
      return;
    }

    if (!isElectron) {
      setMessage('Settings saving only works in the Electron app');
      return;
    }

    try {
      const config = {
        groqApiKey: groqKey,
        cloudflareAccountId,
        cloudflareApiToken,
        videoBackend,
        modalTokenId,
        modalTokenSecret,
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

          {/* Cloudflare Credentials */}
          <div className="space-y-3 pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-lg">Cloudflare Credentials *</label>
              <button
                onClick={validateCloudflare}
                className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
                  cloudflareStatus === 'validating'
                    ? 'bg-yellow-500/30 text-yellow-200 cursor-wait'
                    : cloudflareStatus === 'valid'
                      ? 'bg-green-500/30 text-green-200'
                      : cloudflareStatus === 'invalid'
                        ? 'bg-red-500/30 text-red-200'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                disabled={cloudflareStatus === 'validating' || !cloudflareAccountId || !cloudflareApiToken}
              >
                {cloudflareStatus === 'validating' && <RotateCcw className="w-4 h-4 animate-spin" />}
                {cloudflareStatus === 'valid' && <Check className="w-4 h-4" />}
                {cloudflareStatus === 'invalid' && <X className="w-4 h-4" />}
                {cloudflareStatus === 'idle' || cloudflareStatus === 'validating' ? 'Validate' : cloudflareStatus === 'valid' ? 'Valid' : 'Invalid'}
              </button>
            </div>
            <input
              type="text"
              placeholder="Account ID (32-character hex string)"
              value={cloudflareAccountId}
              onChange={(e) => {
                setCloudflareAccountId(e.target.value);
                setCloudflareStatus('idle');
              }}
              className="w-full px-4 py-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-purple-500 focus:outline-none transition text-white placeholder-gray-400"
            />
            <input
              type="password"
              placeholder="Workers AI API Token"
              value={cloudflareApiToken}
              onChange={(e) => {
                setCloudflareApiToken(e.target.value);
                setCloudflareStatus('idle');
              }}
              className="w-full px-4 py-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-purple-500 focus:outline-none transition text-white placeholder-gray-400"
            />
            <p className="text-sm text-gray-400">
              Get both at{' '}
              <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                dash.cloudflare.com
              </a>
              . Account ID is in the Workers &amp; Pages sidebar; create the token under My Profile → API Tokens with <strong>Account · Workers AI · Edit</strong> permission. Free daily image generation allowance, no credit card.
            </p>
          </div>

          {/* Video backend / Modal (optional, advanced) */}
          <div className="space-y-3 pt-4 border-t border-gray-700">
            <label className="font-semibold text-lg">Video Backend</label>
            <select
              value={videoBackend}
              onChange={(e) => setVideoBackend(e.target.value as 'ffmpeg' | 'modal')}
              className="w-full px-4 py-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-purple-500 focus:outline-none transition text-white"
            >
              <option value="ffmpeg">FFmpeg (free, Ken Burns stills — default)</option>
              <option value="modal">Modal (AI image-to-video + lip-sync, serverless GPU)</option>
            </select>
            {videoBackend === 'modal' && (
              <>
                <input
                  type="text"
                  placeholder="Modal Token ID"
                  value={modalTokenId}
                  onChange={(e) => setModalTokenId(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-purple-500 focus:outline-none transition text-white placeholder-gray-400"
                />
                <input
                  type="password"
                  placeholder="Modal Token Secret"
                  value={modalTokenSecret}
                  onChange={(e) => setModalTokenSecret(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-purple-500 focus:outline-none transition text-white placeholder-gray-400"
                />
                <p className="text-sm text-gray-400">
                  Run <code className="bg-black/40 px-1 rounded">modal token new</code> on this machine to get both values, or find them at{' '}
                  <a href="https://modal.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                    modal.com/settings/tokens
                  </a>.
                </p>
              </>
            )}
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
