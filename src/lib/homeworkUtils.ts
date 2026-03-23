import type { Homework, Lesson } from '../types/database'
import { minutesToTime } from './scheduleUtils'

// 授業の短縮ラベル（例: '3/23(月) 10:00'）
export function lessonLabel(lesson: Lesson): string {
  const d = new Date(lesson.scheduled_at)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]}) ${minutesToTime(d.getHours() * 60 + d.getMinutes())}`
}

// 授業のフルラベル（例: '3月23日(月) 10:00の授業'）
export function lessonFullLabel(lesson: Lesson): string {
  const d = new Date(lesson.scheduled_at)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]}) ${minutesToTime(d.getHours() * 60 + d.getMinutes())}の授業`
}

// 宿題の提出期限表示ラベル
export function dueDateLabel(hw: Homework, lessonsMap: Map<string, Lesson>): string | null {
  if (!hw.due_type) return null
  if (hw.due_type === 'next_lesson') return '次回授業まで'
  if (hw.due_type === 'lesson' && hw.due_lesson_id) {
    const l = lessonsMap.get(hw.due_lesson_id)
    if (!l) return '指定授業まで'
    const d = new Date(l.scheduled_at)
    const days = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})まで`
  }
  if (hw.due_type === 'custom' && hw.due_date) {
    const d = new Date(hw.due_date)
    const days = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})まで`
  }
  return null
}

// 実際の提出期限日時を計算
export function resolvedDueDate(hw: Homework, lessonsMap: Map<string, Lesson>, sortedLessons: Lesson[]): Date | null {
  if (!hw.due_type) return null
  if (hw.due_type === 'custom' && hw.due_date) return new Date(hw.due_date + 'T23:59:59')
  if (hw.due_type === 'lesson' && hw.due_lesson_id) {
    const l = lessonsMap.get(hw.due_lesson_id)
    return l ? new Date(l.scheduled_at) : null
  }
  if (hw.due_type === 'next_lesson' && hw.lesson_id) {
    const cur = lessonsMap.get(hw.lesson_id)
    if (!cur) return null
    const curTime = new Date(cur.scheduled_at)
    const next = sortedLessons.find(l => new Date(l.scheduled_at) > curTime)
    return next ? new Date(next.scheduled_at) : null
  }
  return null
}

// 期限超過判定
export function hwIsOverdue(hw: Homework, lessonsMap: Map<string, Lesson>, sortedLessons: Lesson[]): boolean {
  const due = resolvedDueDate(hw, lessonsMap, sortedLessons)
  return due ? due < new Date() : false
}

// 授業日程別グループ化
export type LessonGroup = { lesson: Lesson | null; items: Homework[] }

export function groupByLesson(hwList: Homework[], lessonsMap: Map<string, Lesson>): LessonGroup[] {
  const map = new Map<string | null, Homework[]>()
  for (const hw of hwList) {
    const key = hw.lesson_id ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(hw)
  }
  const result: LessonGroup[] = []
  for (const [lessonId, items] of map) {
    result.push({ lesson: lessonId ? (lessonsMap.get(lessonId) ?? null) : null, items })
  }
  result.sort((a, b) => {
    if (!a.lesson) return 1
    if (!b.lesson) return -1
    return new Date(a.lesson.scheduled_at).getTime() - new Date(b.lesson.scheduled_at).getTime()
  })
  return result
}
