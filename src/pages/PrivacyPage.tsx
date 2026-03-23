import { useNavigate } from 'react-router-dom'

export default function PrivacyPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-svh bg-[#F7F9F7]">
      <div className="bg-white px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#1B1B1B" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-[#1B1B1B]">プライバシーポリシー</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6 text-sm text-[#1B1B1B] leading-relaxed">
        <p className="text-xs text-[#6B7280]">最終更新日: 2026年3月23日</p>

        <section className="space-y-2">
          <h2 className="font-bold">1. はじめに</h2>
          <p>WINDE（以下「運営者」）は、「ForClass」（以下「本サービス」）におけるユーザーの個人情報の取り扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」）を定めます。</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">2. 収集する情報</h2>
          <p>本サービスでは、以下の情報を収集します。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-medium">アカウント情報:</span> メールアドレス、パスワード、表示名、役割（講師・生徒・保護者）</li>
            <li><span className="font-medium">プロフィール情報:</span> プロフィール画像</li>
            <li><span className="font-medium">LINE連携情報:</span> LINEユーザーID（LINE連携を行った場合）</li>
            <li><span className="font-medium">利用データ:</span> 授業スケジュール、授業記録、宿題情報、学習計画、通知設定</li>
            <li><span className="font-medium">アップロードファイル:</span> 授業資料、宿題関連ファイル</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">3. 情報の利用目的</h2>
          <p>収集した情報は、以下の目的で利用します。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>本サービスの提供・運営・改善</li>
            <li>ユーザー認証・アカウント管理</li>
            <li>授業スケジュールの管理・通知の送信</li>
            <li>LINE経由での通知配信</li>
            <li>ユーザーからのお問い合わせへの対応</li>
            <li>不正利用の防止</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">4. 情報の共有</h2>
          <p>本サービスでは、以下の範囲で情報が共有されます。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-medium">ルーム内のメンバー間:</span> 同じルームに所属するユーザー間で、表示名・授業スケジュール・宿題情報等が共有されます。</li>
            <li><span className="font-medium">外部サービス:</span> 本サービスでは以下の外部サービスを利用しています。
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Supabase（データベース・認証・ストレージ）</li>
                <li>LINE Messaging API（通知配信）</li>
              </ul>
            </li>
          </ul>
          <p>上記以外の第三者への個人情報の提供は、法令に基づく場合を除き、ユーザーの同意なく行いません。</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">5. データの保存</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>データはSupabaseのサーバー（シンガポールリージョン）に保存されます。</li>
            <li>アカウント削除時、ユーザーの個人データは適切に削除されます。</li>
            <li>バックアップデータは一定期間保持される場合があります。</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">6. セキュリティ</h2>
          <p>運営者は、個人情報の漏洩・滅失・毀損を防止するため、以下の対策を講じています。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>通信の暗号化（HTTPS/TLS）</li>
            <li>データベースへのアクセス制御（Row Level Security）</li>
            <li>パスワードのハッシュ化</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">7. ユーザーの権利</h2>
          <p>ユーザーは以下の権利を有します。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>自身の個人情報の開示・訂正・削除を請求する権利</li>
            <li>アカウントを削除する権利</li>
            <li>LINE連携を解除する権利</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">8. Cookieの使用</h2>
          <p>本サービスでは、認証情報の管理のためにブラウザのローカルストレージを使用します。これはサービスの正常な動作に必要なものです。</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">9. 本ポリシーの変更</h2>
          <p>運営者は、必要に応じて本ポリシーを変更できます。重要な変更がある場合は、本サービス上で通知します。</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">10. お問い合わせ</h2>
          <p>本ポリシーに関するお問い合わせは、本サービス内の設定画面よりご連絡ください。</p>
        </section>

        <div className="pt-4 border-t border-gray-200 text-xs text-[#9CA3AF]">
          <p>運営者: WINDE</p>
          <p>サービス名: ForClass</p>
        </div>
      </div>
    </div>
  )
}
