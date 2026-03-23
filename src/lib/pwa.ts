// PWA standaloneモード判定・セッション橋渡しユーティリティ

/** ホーム画面から起動したPWAかどうか */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true

const DEVICE_ID_KEY = 'forclass-device-id'

/** デバイスIDを取得（なければ生成して保存） */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

/** LINEログインURLへ遷移（stateにデバイスIDを埋め込む） */
export function startLineLogin(mode: 'login' | 'link' = 'login') {
  const deviceId = getDeviceId()
  // state: "デバイスID" or "link:デバイスID"
  const state = mode === 'link' ? `link:${deviceId}` : deviceId
  const redirectUri = `${window.location.origin}/schedule-tool/line-callback`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: import.meta.env.VITE_LINE_CHANNEL_ID,
    redirect_uri: redirectUri,
    state,
    scope: 'profile openid',
  })
  window.location.href = `https://access.line.me/oauth2/v2.1/authorize?${params}`
}
