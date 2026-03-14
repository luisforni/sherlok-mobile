import { useState, useRef, useCallback } from 'react'
import { Audio } from 'expo-av'
import { Platform } from 'react-native'

const CHUNK_MS        = 2000
const VOICE_THRESHOLD = 14
const SILENCE_MS      = 600

export function useAudioRecorder() {
  const [isStreaming, setIsStreaming] = useState(false)

  const onChunkRef  = useRef<((data: ArrayBuffer) => void) | null>(null)
  const onFlushRef  = useRef<(() => void) | null>(null)
  const isActiveRef = useRef(false)

  const recordingRef = useRef<Audio.Recording | null>(null)
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  const streamRef    = useRef<MediaStream | null>(null)
  const audioCtxRef  = useRef<AudioContext | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const recorderRef  = useRef<MediaRecorder | null>(null)

  const captureChunk = useCallback(async () => {
    const rec = recordingRef.current
    if (!rec) return
    recordingRef.current = null
    try {
      await rec.stopAndUnloadAsync()
      const uri = rec.getURI()
      if (uri) {
        const res = await fetch(uri)
        const buf = await res.arrayBuffer()
        if (buf.byteLength > 1024) onChunkRef.current?.(buf)
      }
    } catch (e) {
      console.warn('[recorder] captureChunk error', e)
    }
    try {
      const next = new Audio.Recording()
      await next.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      await next.startAsync()
      recordingRef.current = next
    } catch (e) {
      console.warn('[recorder] failed to start next segment', e)
    }
  }, [])

  async function startWebStreaming() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    streamRef.current = stream

    const audioCtx = new AudioContext()
    const analyser  = audioCtx.createAnalyser()
    audioCtx.createMediaStreamSource(stream).connect(analyser)
    analyser.fftSize = 256
    const freq = new Uint8Array(analyser.frequencyBinCount)
    audioCtxRef.current = audioCtx

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    let speaking     = false
    let silenceTimer: ReturnType<typeof setTimeout> | null = null

    function startSpeechRecorder() {
      const chunks: BlobPart[] = []
      const rec = new MediaRecorder(stream, { mimeType })
      recorderRef.current = rec

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      rec.onstop = async () => {
        recorderRef.current = null
        if (!isActiveRef.current) return
        const blob = new Blob(chunks, { type: mimeType })
        const buf  = await blob.arrayBuffer()
        if (buf.byteLength > 2048) {
          onChunkRef.current?.(buf)
          setTimeout(() => {
            if (isActiveRef.current) onFlushRef.current?.()
          }, 80)
        }
      }

      rec.start()
    }

    const checkVolume = () => {
      if (!isActiveRef.current) return

      analyser.getByteFrequencyData(freq)
      const avg = freq.reduce((a, b) => a + b, 0) / freq.length

      if (avg > VOICE_THRESHOLD) {
        if (!speaking) {
          speaking = true
          startSpeechRecorder()
        }
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null }
      } else if (speaking && !silenceTimer) {
        silenceTimer = setTimeout(() => {
          speaking     = false
          silenceTimer = null
          if (recorderRef.current?.state === 'recording') {
            recorderRef.current.stop()
          }
        }, SILENCE_MS)
      }

      animFrameRef.current = requestAnimationFrame(checkVolume)
    }

    animFrameRef.current = requestAnimationFrame(checkVolume)
  }

  async function startStreaming(
    onChunk: (data: ArrayBuffer) => void,
    onFlush?: () => void,
  ) {
    onChunkRef.current  = onChunk
    onFlushRef.current  = onFlush ?? null
    isActiveRef.current = true

    if (Platform.OS === 'web') {
      await startWebStreaming()
    } else {
      await Audio.requestPermissionsAsync()
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
      const rec = new Audio.Recording()
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      await rec.startAsync()
      recordingRef.current = rec
      intervalRef.current  = setInterval(captureChunk, CHUNK_MS)
    }

    setIsStreaming(true)
  }

  async function stopStreaming() {
    isActiveRef.current = false
    setIsStreaming(false)

    if (Platform.OS === 'web') {
      if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      recorderRef.current = null
      if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      if (recordingRef.current) {
        try { await recordingRef.current.stopAndUnloadAsync() } catch {}
        recordingRef.current = null
      }
    }

    onChunkRef.current = null
    onFlushRef.current = null
  }

  return { isStreaming, startStreaming, stopStreaming }
}
