import { supabase } from '../lib/supabase'

type Props = {
  avatarUrl: string | null
  displayName: string
  size?: number
}

export default function Avatar({ avatarUrl, displayName, size = 40 }: Props) {
  const initial = displayName.charAt(0) || '?'

  if (avatarUrl) {
    const { data } = supabase.storage.from('avatars').getPublicUrl(avatarUrl)
    return (
      <img
        src={data.publicUrl}
        alt={displayName}
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
      />
    )
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-[#D8F3DC] flex items-center justify-center font-bold text-[#2D6A4F] shrink-0"
    >
      {initial}
    </div>
  )
}
