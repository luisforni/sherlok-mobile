import { useEffect, useRef, useCallback } from 'react'

export type VoiceMessage =
  | { type: 'listening' }
  | { type: 'subtitle';      text: string }
  | { type: 'transcription'; text: string }
  | { type: 'queued';        text: string; position: number }
  | { type: 'processing';    text: string }
  | { type: 'response';      input: string; output: string }
  | { type: 'status';        queue_size: number }
  | { type: 'error';         msg: string }

export function useVoiceSocket(
  url: string,
  onMessage: (msg: VoiceMessage) => void,
  onConnectionChange?: (connected: boolean) => void,
) {
  const wsRef       = useRef<WebSocket | null>(null)
  const stoppedRef  = useRef(false)
  const onMsgRef    = useRef(onMessage)
  const onConnRef   = useRef(onConnectionChange)
  onMsgRef.current  = onMessage
  onConnRef.current = onConnectionChange

  useEffect(() => {
    stoppedRef.current = false

    function connect() {
      if (stoppedRef.current) return
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen    = () => onConnRef.current?.(true)
      ws.onclose   = () => {
        onConnRef.current?.(false)
        if (!stoppedRef.current) setTimeout(connect, 2000)
      }
      ws.onerror   = () => ws.close()
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as VoiceMessage
          onMsgRef.current(msg)
        } catch {}
      }
    }

    connect()
    return () => {
      stoppedRef.current = true
      wsRef.current?.close()
    }
  }, [url])

  const send = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
  }, [])

  const sendFlush = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send('flush')
    }
  }, [])

  return { send, sendFlush }
}
