import React, { useState, useCallback, useRef } from 'react'
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, StatusBar, Animated, ActivityIndicator,
} from 'react-native'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { useVoiceSocket, VoiceMessage } from '../hooks/useVoiceSocket'
import { WS_URL } from '../config'

type ItemStatus = 'pending' | 'processing' | 'done'
type ConversationItem = {
  id:      string
  input:   string
  output:  string
  status:  ItemStatus
}

export default function App() {
  const { isStreaming, startStreaming, stopStreaming } = useAudioRecorder()
  const [connected, setConnected] = useState(false)
  const [subtitle,  setSubtitle]  = useState('')
  const [items,     setItems]     = useState<ConversationItem[]>([])
  const idRef     = useRef(0)
  const pulseAnim = useRef(new Animated.Value(1)).current

  const startPulse = () =>
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    ).start()
  const stopPulse = () => { pulseAnim.stopAnimation(); pulseAnim.setValue(1) }

  const onMessage = useCallback((msg: VoiceMessage) => {
    switch (msg.type) {
      case 'listening':
        break
      case 'subtitle':
        setSubtitle(msg.text)
        break
      case 'transcription':
        setSubtitle(msg.text)
        break
      case 'queued':
        setSubtitle('')
        setItems(prev => [{
          id:     String(idRef.current++),
          input:  msg.text,
          output: '',
          status: 'pending',
        }, ...prev])
        break
      case 'processing':
        setItems(prev => {
          const idx = prev.findIndex(i => i.input === msg.text && i.status === 'pending')
          if (idx === -1) return prev
          const next = [...prev]
          next[idx] = { ...next[idx], status: 'processing' }
          return next
        })
        break
      case 'response':
        setItems(prev => {
          const idx = prev.findIndex(i => i.input === msg.input && i.status === 'processing')
          if (idx === -1) return prev
          const next = [...prev]
          next[idx] = { ...next[idx], output: msg.output, status: 'done' }
          return next
        })
        break
      case 'status':
        break
    }
  }, [])

  const { send, sendFlush } = useVoiceSocket(WS_URL, onMessage, setConnected)

  async function toggleStream() {
    if (isStreaming) {
      stopPulse()
      await stopStreaming()
      setSubtitle('')
    } else {
      startPulse()
      await startStreaming(send, sendFlush)
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Sherlok</Text>
          <Text style={styles.subtitle}>la voz de tu conciencia</Text>
        </View>
        <View style={styles.headerRight}>
          {(isStreaming || items.length > 0) && (
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[styles.btn, isStreaming ? styles.btnStop : styles.btnRec, styles.btnCompact]}
                onPress={toggleStream}
                activeOpacity={0.85}
              >
                <Text style={styles.btnTxt}>{isStreaming ? '⏹  Detener' : '🎙  Escuchar'}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
          <View style={[styles.dot, connected ? styles.dotGreen : styles.dotRed]} />
        </View>
      </View>

      {isStreaming && (
        <View style={styles.subtitleBox}>
          <Text style={subtitle ? styles.subtitleTxt : styles.mutedTxt}>
            {subtitle || '…'}
          </Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <ConversationCard item={item} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>
              {isStreaming ? 'Escuchando la sala…' : 'Listo para escuchar'}
            </Text>
            <Text style={styles.emptyHint}>
              {isStreaming
                ? 'Cada oración detectada aparecerá aquí'
                : 'Pulsá el botón para que Sherlok empiece a analizar'}
            </Text>
          </View>
        }
      />

      {!isStreaming && items.length === 0 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.btn, styles.btnRec]}
            onPress={toggleStream}
            activeOpacity={0.85}
          >
            <Text style={styles.btnTxt}>🎙  Escuchar</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  )
}

function ConversationCard({ item }: { item: ConversationItem }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardIcon}>💬</Text>
        <Text style={styles.cardInput}>{item.input}</Text>
      </View>

      <View style={styles.cardDivider} />

      {item.status === 'pending' && (
        <View style={styles.stateRow}>
          <Text style={styles.stateIcon}>⏳</Text>
          <Text style={styles.pendingTxt}>En cola…</Text>
        </View>
      )}
      {item.status === 'processing' && (
        <View style={styles.stateRow}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={styles.processingTxt}>  Analizando…</Text>
        </View>
      )}
      {item.status === 'done' && (
        <View style={styles.responseWrap}>
          <Text style={styles.responseLabel}>Sherlok dice</Text>
          <Text style={styles.cardOutput}>{item.output}</Text>
        </View>
      )}
    </View>
  )
}

const C = {
  bg:        '#080d1a',
  surface:   '#0f1828',
  card:      '#111c30',
  border:    '#1a2a45',
  accent:    '#4f8ef7',
  accentDim: '#4f8ef722',
  green:     '#22c55e',
  red:       '#ef4444',
  muted:     '#4a5a72',
  text:      '#dce8f8',
  subtext:   '#6b82a0',
  amber:     '#f59e0b',
  pipe:      '#8b9eb5',
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  title:    { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  subtitle: { color: C.subtext, fontSize: 11, letterSpacing: 1.2, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:      { width: 9, height: 9, borderRadius: 5 },
  dotGreen: { backgroundColor: C.green },
  dotRed:   { backgroundColor: C.red },

  listeningBadge: {
    backgroundColor: C.accentDim,
    borderWidth: 1, borderColor: C.accent + '55',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  listeningTxt: { color: C.accent, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },

  subtitleBox: {
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    minHeight: 44, backgroundColor: C.surface,
    borderRadius: 10, borderWidth: 1, borderColor: C.accent + '44',
    paddingHorizontal: 14, paddingVertical: 10,
    justifyContent: 'center',
  },
  subtitleTxt: { color: C.text,  fontSize: 14, lineHeight: 20 },
  mutedTxt:    { color: C.muted, fontSize: 13, fontStyle: 'italic' },

  list:        { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },

  emptyWrap:  { alignItems: 'center', marginTop: 72, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 40, marginBottom: 14 },
  emptyTitle: { color: C.text,    fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  emptyHint:  { color: C.subtext, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  card: {
    backgroundColor: C.card,
    borderRadius: 14, borderWidth: 1, borderColor: C.border,
    marginBottom: 12, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingTop: 13, paddingBottom: 10, gap: 8,
  },
  cardIcon:    { fontSize: 14, marginTop: 1 },
  cardInput:   { flex: 1, color: C.pipe, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  cardDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 14 },

  stateRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  stateIcon:     { fontSize: 14, marginRight: 6 },
  pendingTxt:    { color: C.amber,  fontSize: 13 },
  processingTxt: { color: C.accent, fontSize: 13 },

  responseWrap:  { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14 },
  responseLabel: { color: C.subtext, fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginBottom: 6 },
  cardOutput:    { color: C.text, fontSize: 15, lineHeight: 23 },

  bottomBar: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: C.border,
    backgroundColor: C.bg, alignItems: 'center',
  },
  btn:        { paddingVertical: 15, paddingHorizontal: 56, borderRadius: 50 },
  btnCompact: { paddingVertical: 8,  paddingHorizontal: 16 },
  btnRec:  { backgroundColor: C.accent },
  btnStop: { backgroundColor: C.red },
  btnTxt:  { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
})
