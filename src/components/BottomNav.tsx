import { NavLink } from 'react-router-dom'

const navItems = [
  {
    to: '/dashboard',
    label: 'ホーム',
    icon: (active: boolean) => (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke={active ? '#2D6A4F' : '#9CA3AF'} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: '設定',
    icon: (active: boolean) => (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke={active ? '#2D6A4F' : '#9CA3AF'} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-area-inset-bottom">
      <div className="max-w-lg mx-auto flex">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className="flex-1 flex flex-col items-center py-2 gap-1"
          >
            {({ isActive }) => (
              <>
                {item.icon(isActive)}
                <span className={`text-xs ${isActive ? 'text-[#2D6A4F] font-medium' : 'text-gray-400'}`}>
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
