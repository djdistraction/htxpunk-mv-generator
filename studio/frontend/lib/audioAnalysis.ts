// Client-side BPM + musical key detection — runs in the browser via
// essentia.js (WASM), never on the server. Locked decision: this is cheap
// enough to run during upload and keeps it off the backend's CPU budget
// entirely (see CLAUDE.md's Audio Analysis section).
//
// Decoding happens on the main thread (decodeAudioData isn't available in
// Workers in most browsers); only the raw resampled mono PCM crosses into
// the Worker, which does the actual essentia.js computation off the main
// thread so the upload form doesn't freeze.

export type AudioAnalysisResult = {
  bpm: string
  musicalKey: string
  beatGrid: number[]
}

export type AudioAnalysisStep = 'bpm' | 'beatgrid' | 'key'

const ESSENTIA_SAMPLE_RATE = 44100 // RhythmExtractor2013/KeyExtractor assume this; no sampleRate param to override it

export async function analyzeAudioFromUrl(
  url: string,
  onProgress?: (step: AudioAnalysisStep) => void
): Promise<AudioAnalysisResult | null> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load audio for analysis (${res.status})`)
  const blob = await res.blob()
  const file = new File([blob], "song.mp3", { type: blob.type || "audio/mpeg" })
  return analyzeAudioFile(file, onProgress)
}

export async function analyzeAudioFile(
  file: File,
  onProgress?: (step: AudioAnalysisStep) => void
): Promise<AudioAnalysisResult | null> {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null

  const AudioCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext
  if (!AudioCtx) return null

  try {
    const arrayBuffer = await file.arrayBuffer()
    // decodeAudioData resamples to whatever rate the context was built with,
    // regardless of the source file's native sample rate; length/channel
    // count passed to the constructor don't matter since we never render.
    const offlineCtx = new AudioCtx(1, 1, ESSENTIA_SAMPLE_RATE)
    const audioBuffer: AudioBuffer = await offlineCtx.decodeAudioData(arrayBuffer)

    const mono = downmixToMono(audioBuffer)
    const result = await runEssentiaWorker(mono, onProgress)

    if (!result.ok) {
      console.error('[audioAnalysis] essentia worker failed:', result.error)
      return null
    }
    return {
      bpm: String(result.bpm),
      musicalKey: result.musicalKey,
      beatGrid: result.beatGrid,
    }
  } catch (err) {
    console.error('[audioAnalysis] BPM/key detection failed:', err)
    return null
  }
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels
  if (channels === 1) return new Float32Array(buffer.getChannelData(0))
  const mono = new Float32Array(buffer.length)
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / channels
  }
  return mono
}

function runEssentiaWorker(
  signal: Float32Array,
  onProgress?: (step: AudioAnalysisStep) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/vendor/essentia/essentia-worker.js')
    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new Error('essentia worker timed out'))
    }, 180000)

    worker.onmessage = (e: MessageEvent) => {
      // Intermediate progress messages ({progress: 'bpm'|'beatgrid'|'key'})
      // arrive before the final {ok, ...} result — keep listening until then.
      if (e.data && e.data.progress) {
        onProgress?.(e.data.progress)
        return
      }
      clearTimeout(timeout)
      worker.terminate()
      resolve(e.data)
    }
    worker.onerror = (e: ErrorEvent) => {
      clearTimeout(timeout)
      worker.terminate()
      reject(e.error || new Error(e.message))
    }

    // Transfer the buffer instead of copying it across the postMessage boundary.
    const copy = new Float32Array(signal)
    worker.postMessage({ signal: copy }, [copy.buffer])
  })
}
