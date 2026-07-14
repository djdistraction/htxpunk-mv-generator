'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Win95Alert,
  Win95Button,
  Win95GroupBox,
  Win95Input,
  Win95Label,
  Win95Select,
  Win95StatusBadge,
} from '@/components/win95/Win95Primitives'

export default function SettingsPage() {
  const [groqKey, setGroqKey] = useState('')
  const [cloudflareAccountId, setCloudflareAccountId] = useState('')
  const [cloudflareApiToken, setCloudflareApiToken] = useState('')
  const [videoBackend, setVideoBackend] = useState<'ffmpeg' | 'modal'>('ffmpeg')
  const [allowFallbackVideo, setAllowFallbackVideo] = useState(false)
  const [modalTokenId, setModalTokenId] = useState('')
  const [modalTokenSecret, setModalTokenSecret] = useState('')
  const [groqStatus, setGroqStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [cloudflareStatus, setCloudflareStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [message, setMessage] = useState('')
  const [isElectron] = useState(() => typeof window !== 'undefined' && !!(window as any).electron)

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    if (!(window as any).electron) return
    try {
      const config = await (window as any).electron.getConfig()
      if (config.groqApiKey) setGroqKey(config.groqApiKey)
      if (config.cloudflareAccountId) setCloudflareAccountId(config.cloudflareAccountId)
      if (config.cloudflareApiToken) setCloudflareApiToken(config.cloudflareApiToken)
      if (config.videoBackend) setVideoBackend(config.videoBackend)
      setAllowFallbackVideo(Boolean(config.allowFallbackVideo))
      if (config.modalTokenId) setModalTokenId(config.modalTokenId)
      if (config.modalTokenSecret) setModalTokenSecret(config.modalTokenSecret)
    } catch (err) {
      console.error('Failed to load config:', err)
    }
  }

  async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...options, signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async function testGroqKey(key: string) {
    if (!key) return false
    try {
      const response = await fetchWithTimeout('/api/settings/validate-groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key }),
      }, 8000)
      if (!response.ok) return false
      const data = await response.json()
      return data.valid === true
    } catch {
      return false
    }
  }

  async function testCloudflareCreds(accountId: string, apiToken: string) {
    if (!accountId || !apiToken) return false
    try {
      const response = await fetchWithTimeout('/api/settings/validate-cloudflare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, api_token: apiToken }),
      }, 8000)
      if (!response.ok) return false
      const data = await response.json()
      return data.valid === true
    } catch {
      return false
    }
  }

  async function validateGroq() {
    if (!groqKey) {
      setGroqStatus('invalid')
      return
    }
    setGroqStatus('validating')
    const valid = await testGroqKey(groqKey)
    setGroqStatus(valid ? 'valid' : 'invalid')
  }

  async function validateCloudflare() {
    if (!cloudflareAccountId || !cloudflareApiToken) {
      setCloudflareStatus('idle')
      return
    }
    setCloudflareStatus('validating')
    const valid = await testCloudflareCreds(cloudflareAccountId, cloudflareApiToken)
    setCloudflareStatus(valid ? 'valid' : 'invalid')
  }

  async function save() {
    if (!groqKey) {
      setMessage('Groq API key is required')
      return
    }
    if (!cloudflareAccountId || !cloudflareApiToken) {
      setMessage('Cloudflare Account ID and API Token are required')
      return
    }
    if (groqStatus !== 'valid') {
      setMessage('Please validate the Groq API key first')
      return
    }
    if (cloudflareStatus !== 'valid') {
      setMessage('Please validate the Cloudflare credentials first')
      return
    }
    if (!isElectron) {
      setMessage('Settings saving only works in the Electron app. For browser/dev mode, edit the root .env file instead.')
      return
    }

    try {
      const config = {
        groqApiKey: groqKey,
        cloudflareAccountId,
        cloudflareApiToken,
        videoBackend,
        allowFallbackVideo,
        modalTokenId,
        modalTokenSecret,
      }
      await (window as any).electron.saveConfig(config)
      setMessage('Settings saved! Restart the app for changes to take effect.')
    } catch (err: any) {
      setMessage(`Save failed: ${err.message}`)
    }
  }

  const statusBadge = (status: typeof groqStatus) => {
    if (status === 'valid') return <Win95StatusBadge status="ok">Valid</Win95StatusBadge>
    if (status === 'invalid') return <Win95StatusBadge status="error">Invalid</Win95StatusBadge>
    if (status === 'validating') return <Win95StatusBadge status="running">Checking…</Win95StatusBadge>
    return <Win95StatusBadge status="muted">Not checked</Win95StatusBadge>
  }

  return (
    <div className="win95-page">
      <div className="win95-page-header">
        <div>
          <h1 className="win95-page-title">API Settings</h1>
          <p className="win95-page-sub">
            Configure keys used for analysis and image generation. Changes in the desktop app require a restart.
          </p>
        </div>
        <Link href="/" className="win95-btn win95-btn-link">← Projects</Link>
      </div>

      {!isElectron && (
        <Win95Alert tone="info" title="Browser / development mode">
          You are not running inside the Electron desktop app. Validation still works through the backend proxy.
          To persist keys for local web mode, edit the project root <code>.env</code> file.
        </Win95Alert>
      )}

      {message && (
        <Win95Alert tone="info" title="Notice" onDismiss={() => setMessage('')}>
          {message}
        </Win95Alert>
      )}

      <Win95GroupBox title="Groq API Key *">
        <div className="win95-row" style={{ marginBottom: 8 }}>
          {statusBadge(groqStatus)}
          <Win95Button onClick={validateGroq} disabled={groqStatus === 'validating'}>
            {groqStatus === 'validating' ? 'Validating…' : 'Validate'}
          </Win95Button>
        </div>
        <Win95Label>
          Key
          <Win95Input
            type="password"
            placeholder="gsk_..."
            value={groqKey}
            onChange={e => {
              setGroqKey(e.target.value)
              setGroqStatus('idle')
            }}
          />
        </Win95Label>
        <p className="win95-muted" style={{ margin: 0 }}>
          Get your key at{' '}
          <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer">
            console.groq.com
          </a>
          . Required for song analysis and treatment generation.
        </p>
      </Win95GroupBox>

      <Win95GroupBox title="Cloudflare Workers AI *">
        <div className="win95-row" style={{ marginBottom: 8 }}>
          {statusBadge(cloudflareStatus)}
          <Win95Button
            onClick={validateCloudflare}
            disabled={cloudflareStatus === 'validating' || !cloudflareAccountId || !cloudflareApiToken}
          >
            {cloudflareStatus === 'validating' ? 'Validating…' : 'Validate'}
          </Win95Button>
        </div>
        <Win95Label>
          Account ID
          <Win95Input
            type="text"
            placeholder="32-character hex string"
            value={cloudflareAccountId}
            onChange={e => {
              setCloudflareAccountId(e.target.value)
              setCloudflareStatus('idle')
            }}
          />
        </Win95Label>
        <Win95Label>
          API Token
          <Win95Input
            type="password"
            placeholder="Workers AI API Token"
            value={cloudflareApiToken}
            onChange={e => {
              setCloudflareApiToken(e.target.value)
              setCloudflareStatus('idle')
            }}
          />
        </Win95Label>
        <p className="win95-muted" style={{ margin: 0 }}>
          From{' '}
          <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer">
            dash.cloudflare.com
          </a>
          . Token needs <strong>Account · Workers AI · Edit</strong>. Free daily image allowance, no credit card.
        </p>
      </Win95GroupBox>

      <Win95GroupBox title="Video Backend">
        <Win95Label>
          Backend
          <Win95Select
            value={videoBackend}
            onChange={e => setVideoBackend(e.target.value as 'ffmpeg' | 'modal')}
          >
            <option value="ffmpeg">FFmpeg (Ken Burns slideshow — preview only)</option>
            <option value="modal">Modal (AI image-to-video + lip-sync)</option>
          </Win95Select>
        </Win95Label>

        {videoBackend === 'ffmpeg' && (
          <label className="win95-row" style={{ alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={allowFallbackVideo}
              onChange={e => setAllowFallbackVideo(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span className="win95-muted">
              Enable Ken Burns preview rendering. Off by default so the app fails clearly instead of
              silently producing a slideshow when you asked for a real music video.
            </span>
          </label>
        )}

        {videoBackend === 'modal' && (
          <>
            <Win95Label>
              Modal Token ID
              <Win95Input
                type="text"
                placeholder="Modal Token ID"
                value={modalTokenId}
                onChange={e => setModalTokenId(e.target.value)}
              />
            </Win95Label>
            <Win95Label>
              Modal Token Secret
              <Win95Input
                type="password"
                placeholder="Modal Token Secret"
                value={modalTokenSecret}
                onChange={e => setModalTokenSecret(e.target.value)}
              />
            </Win95Label>
          </>
        )}
      </Win95GroupBox>

      <div className="win95-row">
        <Win95Button variant="primary" onClick={save}>
          Save Settings
        </Win95Button>
        <Link href="/" className="win95-btn win95-btn-link">Cancel</Link>
      </div>
    </div>
  )
}
