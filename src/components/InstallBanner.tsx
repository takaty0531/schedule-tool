import { useEffect, useState } from 'react'
import { isStandalone } from '../lib/pwa'

const DISMISSED_KEY = 'forclass-install-dismissed'

// iOS判定
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)

// Android等のインストールプロンプトイベントを保持
let deferredPrompt: Event & { prompt?: () => void; userChoice?: Promise<{ outcome: string }> } | null = null

export default function InstallBanner() {
  const [show, setShow] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    // すでにPWAとして開いている or 非表示にした場合はスキップ
    if (isStandalone()) return
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (dismissed) {
      // 7日後に再表示
      if (Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return
    }

    // iOS: 常にカスタムバナーを表示
    if (isIOS()) {
      setShow(true)
      return
    }

    // Android/Chrome: beforeinstallpromptイベントを待つ
    const handler = (e: Event) => {
      e.preventDefault()
      deferredPrompt = e as typeof deferredPrompt
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt?.prompt) {
      deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result?.outcome === 'accepted') {
        setShow(false)
      }
      deferredPrompt = null
    } else if (isIOS()) {
      setShowIOSGuide(true)
    }
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    setShow(false)
    setShowIOSGuide(false)
  }

  if (!show) return null

  // iOS向けの追加手順ガイド
  if (showIOSGuide) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={handleDismiss}>
        <div
          className="w-full max-w-sm bg-white rounded-t-2xl p-6 pb-8 space-y-4 animate-slide-up"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#1B1B1B]">ホーム画面に追加する方法</h3>
            <button onClick={handleDismiss} className="text-[#9CA3AF] p-1">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 bg-[#D8F3DC] rounded-full flex items-center justify-center text-sm font-bold text-[#2D6A4F]">1</span>
              <p className="text-sm text-[#1B1B1B] pt-0.5">
                画面下の
                <svg className="inline mx-1 -mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="#007AFF"><path d="M12 2l0 14M12 2l-4 4M12 2l4 4" stroke="#007AFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/><rect x="4" y="14" width="16" height="6" rx="1" fill="none" stroke="#007AFF" strokeWidth="2"/></svg>
                <span className="font-medium">共有ボタン</span>をタップ
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 bg-[#D8F3DC] rounded-full flex items-center justify-center text-sm font-bold text-[#2D6A4F]">2</span>
              <p className="text-sm text-[#1B1B1B] pt-0.5">
                <span className="font-medium">「ホーム画面に追加」</span>をタップ
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 bg-[#D8F3DC] rounded-full flex items-center justify-center text-sm font-bold text-[#2D6A4F]">3</span>
              <p className="text-sm text-[#1B1B1B] pt-0.5">
                右上の<span className="font-medium">「追加」</span>をタップ
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // バナー
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 flex items-center gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-[#D8F3DC] rounded-xl flex items-center justify-center">
          <span className="text-sm font-bold text-[#2D6A4F]">FC</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#1B1B1B]">ForClassをアプリとして使う</p>
          <p className="text-xs text-[#6B7280]">ホーム画面に追加して快適に</p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1">
          <button
            onClick={handleDismiss}
            className="text-xs text-[#9CA3AF] px-2 py-1.5"
          >
            後で
          </button>
          <button
            onClick={handleInstall}
            className="text-xs bg-[#2D6A4F] text-white font-medium px-3 py-1.5 rounded-lg"
          >
            追加
          </button>
        </div>
      </div>
    </div>
  )
}
