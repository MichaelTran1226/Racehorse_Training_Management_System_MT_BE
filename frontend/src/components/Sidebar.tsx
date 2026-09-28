import React from 'react';
import { NavLink } from 'react-router-dom';

interface SidebarProps {
  onOpenMedicalLock?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenMedicalLock }) => {
  const navItems = [
    {
      to: '/training/dashboard',
      label: 'Tổng quan huấn luyện',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
      ),
      badge: 'Flow 2',
    },
    {
      to: '/training/plans',
      label: 'Lập giáo án',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      ),
      badge: 'FR-004',
    },
    {
      to: '/training/schedule',
      label: 'Lịch tập tuần',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
      badge: 'FR-006',
    },
    {
      to: '/training/sessions/sess-tue-1',
      label: 'Kết quả buổi tập',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      badge: 'FR-007',
    },
  ];

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-56 z-30 bg-surface border-r border-border flex flex-col justify-between py-5 px-3.5 shadow-sm">
      {/* Upper Navigation */}
      <div className="space-y-6">
        {/* Brand Banner */}
        <div className="px-2 pb-2 border-b border-border/80">
          <div className="text-xs font-bold uppercase tracking-wider text-forest">
            Phòng Huấn Luyện
          </div>
          <p className="text-[11px] text-muted mt-0.5">
            Quy trình HLV Trưởng & Nài ngựa
          </p>
        </div>

        {/* Main Nav Links */}
        <nav className="flex flex-col gap-1.5" aria-label="Điều hướng chính HLV Trưởng">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-forest-wash text-forest font-semibold shadow-xs border-l-4 border-forest'
                    : 'text-ink-light hover:bg-forest-wash/60 hover:text-forest'
                }`
              }
            >
              <div className="flex items-center gap-2.5">
                <span className="text-muted group-hover:text-forest transition-colors">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted font-mono">
                {item.badge}
              </span>
            </NavLink>
          ))}

          {/* Medical Lock Quick Inspector Trigger */}
          {onOpenMedicalLock && (
            <button
              onClick={onOpenMedicalLock}
              className="mt-2 flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-critical-text bg-critical-bg/60 hover:bg-critical-bg border border-critical-border transition-all text-left"
            >
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-critical-text" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="font-semibold">Lệnh Khóa Y Tế</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-critical-text text-white font-bold animate-pulse">
                FR-005
              </span>
            </button>
          )}
        </nav>
      </div>

      {/* Footer Role Info */}
      <div className="pt-4 border-t border-border flex flex-col gap-2">
        <div className="px-3 py-2 rounded-lg bg-canvas border border-border flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-forest-deep block">Vai trò: HLV Trưởng</span>
            <span className="text-[11px] text-muted">Quyền phê duyệt ca tập</span>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-forest animate-ping"></span>
        </div>
        <button
          className="w-full text-center py-1.5 text-xs text-muted hover:text-critical-text transition-colors"
          onClick={() => alert('Phiên làm việc bảo mật')}
        >
          Đăng xuất an toàn
        </button>
      </div>
    </aside>
  );
};
