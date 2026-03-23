import { useNavigate } from 'react-router-dom'

export default function TermsPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-svh bg-[#F7F9F7]">
      <div className="bg-white px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#1B1B1B" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-[#1B1B1B]">利用規約</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6 text-sm text-[#1B1B1B] leading-relaxed">
        <p className="text-xs text-[#6B7280]">最終更新日: 2026年3月23日</p>

        <section className="space-y-2">
          <h2 className="font-bold">第1条（適用）</h2>
          <p>本利用規約（以下「本規約」）は、WINDE（以下「運営者」）が提供する「ForClass」（以下「本サービス」）の利用に関する条件を定めるものです。ユーザーは本規約に同意のうえ、本サービスを利用するものとします。</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">第2条（定義）</h2>
          <p>本規約において、以下の用語は次の意味で使用します。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>「ユーザー」とは、本サービスを利用するすべての方をいいます。</li>
            <li>「講師」とは、本サービス上で授業を提供する方をいいます。</li>
            <li>「生徒」とは、本サービス上で授業を受ける方をいいます。</li>
            <li>「保護者」とは、生徒の保護者として本サービスを利用する方をいいます。</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">第3条（アカウント）</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>ユーザーは正確な情報を登録し、常に最新の状態に保つものとします。</li>
            <li>アカウントの管理責任はユーザー自身にあります。</li>
            <li>アカウントの第三者への譲渡・貸与は禁止します。</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">第4条（禁止事項）</h2>
          <p>ユーザーは以下の行為を行ってはなりません。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>法令または公序良俗に違反する行為</li>
            <li>運営者または第三者の権利を侵害する行為</li>
            <li>本サービスの運営を妨げる行為</li>
            <li>不正アクセスまたはそれを試みる行為</li>
            <li>他のユーザーの個人情報を不正に収集・利用する行為</li>
            <li>その他、運営者が不適切と判断する行為</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">第5条（サービスの変更・停止）</h2>
          <p>運営者は、事前の通知なく本サービスの内容を変更、または提供を停止・中断することができます。これによりユーザーに生じた損害について、運営者は一切の責任を負いません。</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">第6条（免責事項）</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>本サービスは現状有姿で提供され、運営者はその完全性・正確性・有用性等を保証しません。</li>
            <li>ユーザー間のトラブルについて、運営者は一切の責任を負いません。</li>
            <li>本サービスの利用により生じた損害について、運営者の故意または重過失による場合を除き、運営者は一切の責任を負いません。</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">第7条（知的財産権）</h2>
          <p>本サービスに関する知的財産権は運営者に帰属します。ユーザーは、本サービスのコンテンツを無断で複製・転載・改変することはできません。</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">第8条（退会）</h2>
          <p>ユーザーは、設定画面から退会手続きを行うことで、いつでもアカウントを削除できます。退会後、ユーザーのデータは運営者の判断に基づき適切に処理されます。</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">第9条（規約の変更）</h2>
          <p>運営者は、必要に応じて本規約を変更できます。変更後の規約は、本サービス上に掲示した時点で効力を生じるものとします。</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">第10条（準拠法・管轄）</h2>
          <p>本規約は日本法に準拠し、本規約に関する紛争は、運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。</p>
        </section>

        <div className="pt-4 border-t border-gray-200 text-xs text-[#9CA3AF]">
          <p>運営者: WINDE</p>
          <p>サービス名: ForClass</p>
        </div>
      </div>
    </div>
  )
}
