// Supabase DB テーブル型定義

export type Role = 'instructor' | 'learner' | 'guardian'

export type Profile = {
  id: string
  role: Role
  display_name: string
  line_user_id: string | null
  avatar_url: string | null
  created_at: string
}

export type Room = {
  id: string
  name: string
  instructor_id: string
  lesson_minutes: number
  description: string | null
  created_at: string
}

export type RoomMember = {
  id: string
  room_id: string
  learner_id: string
  display_name: string
  joined_at: string
}

export type GuardianLearner = {
  guardian_id: string
  learner_id: string
}

export type Invitation = {
  id: string
  room_id: string
  display_name: string
  role: 'learner' | 'guardian'
  learner_id: string | null
  token: string
  status: 'pending' | 'accepted'
  expires_at: string
  created_at: string
}

export type Slot = {
  id: string
  room_id: string
  person_id: string
  week_key: string
  day_index: number
  slot_start: number // 分単位（例: 510 = 8:30）
  status: string
}

export type Lesson = {
  id: string
  room_id: string
  learner_id: string | null
  scheduled_at: string
  duration_minutes: number
  status: 'scheduled' | 'done' | 'cancelled'
  created_at: string
}

export type LessonRecord = {
  id: string
  lesson_id: string
  content: string | null
  homework: string | null
  created_at: string
}

export type LessonFile = {
  id: string
  lesson_id: string
  uploader_id: string
  file_type: 'homework' | 'material'
  file_path: string
  file_name: string
  created_at: string
}

export type StudyPlanItem = {
  id: string
  room_id: string
  subject: string
  title: string
  parent_id: string | null
  lesson_id: string | null
  order_index: number
  created_at: string
}

export type Homework = {
  id: string
  room_id: string
  lesson_id: string | null
  title: string
  description: string | null
  reference_text: string | null
  due_type: 'lesson' | 'next_lesson' | 'custom' | null
  due_date: string | null        // YYYY-MM-DD（custom時）
  due_lesson_id: string | null   // lesson時: 指定の授業日
  created_at: string
}

export type NotificationSetting = {
  id: string
  user_id: string
  room_id: string
  lesson_confirmed: boolean
  morning_notify: boolean
  morning_time: string
  pre_lesson_notify: boolean
  pre_lesson_minutes: number
  created_at: string
  updated_at: string
}
