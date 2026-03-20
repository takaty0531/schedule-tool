// 月曜始まりの曜日ラベル（表示順: 月〜日）
export const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']
// 表示列インデックス → day_index のマッピング（列0=月=day_index1, ..., 列6=日=day_index0）
export const COL_TO_DAY_INDEX = [1, 2, 3, 4, 5, 6, 0]

// 8:00〜21:30 を30分単位で生成
export const TIME_SLOTS: number[] = (() => {
  const slots: number[] = []
  for (let min = 8 * 60; min <= 21 * 60 + 30; min += 30) slots.push(min)
  return slots
})()

// 今週の月曜日（0時0分）を返す
export function getThisMonday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d
}

// Date → week_key（月曜日の年-月-日）
export function getWeekKey(monday: Date): string {
  return `${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`
}

// week_key → 月曜日のDate
export function mondayFromWeekKey(weekKey: string): Date {
  const [year, month, day] = weekKey.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

export function prevWeekKey(weekKey: string): string {
  const d = mondayFromWeekKey(weekKey)
  d.setDate(d.getDate() - 7)
  return getWeekKey(d)
}

export function nextWeekKey(weekKey: string): string {
  const d = mondayFromWeekKey(weekKey)
  d.setDate(d.getDate() + 7)
  return getWeekKey(d)
}

// 分 → '8:30' 形式
export function minutesToTime(min: number): string {
  return `${Math.floor(min / 60)}:${(min % 60).toString().padStart(2, '0')}`
}

// week_key + day_index + slot_start → ISO文字列（JST）
export function toScheduledAt(weekKey: string, dayIndex: number, slotStart: number): string {
  const monday = mondayFromWeekKey(weekKey)
  const offset = dayIndex === 0 ? 6 : dayIndex - 1
  const d = new Date(monday)
  d.setDate(monday.getDate() + offset)
  d.setHours(Math.floor(slotStart / 60), slotStart % 60, 0, 0)
  return d.toISOString()
}

// scheduled_at → { dayIndex, slotStart }
export function scheduledAtToSlot(scheduledAt: string): { dayIndex: number; slotStart: number } {
  const d = new Date(scheduledAt)
  return {
    dayIndex: d.getDay(),
    slotStart: d.getHours() * 60 + d.getMinutes(),
  }
}

// scheduled_at がある week_key の週に含まれるか
export function isInWeek(scheduledAt: string, weekKey: string): boolean {
  const monday = mondayFromWeekKey(weekKey)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 7)
  const d = new Date(scheduledAt)
  return d >= monday && d < sunday
}

// 日付の表示用ラベル（例: '3/17'）
export function dateLabelForDay(weekKey: string, colIndex: number): string {
  const monday = mondayFromWeekKey(weekKey)
  const dayIndex = COL_TO_DAY_INDEX[colIndex]
  const offset = dayIndex === 0 ? 6 : dayIndex - 1
  const d = new Date(monday)
  d.setDate(monday.getDate() + offset)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// 今日の day_index
export function todayDayIndex(): number {
  return new Date().getDay()
}
