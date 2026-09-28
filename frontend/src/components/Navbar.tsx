import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface NavbarProps {
  onOpenMedicalLock?: () => void;
  searchTerm?: string;
  onSearchChange?: (val: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenMedicalLock,
  searchTerm = '',
  onSearchChange,
}) => {
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-surface border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex items-center justify-between px-6">
      {/* Left side: Brand + Search Bar */}
      <div className="flex items-center gap-8">
        <Link to="/training/dashboard" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-lg bg-forest-deep flex items-center justify-center text-gold shadow-sm border border-gold/30 group-hover:bg-forest transition-colors">
            {/* Equine Trophy Icon SVG */}
            <svg
              className="w-5 h-5 text-gold"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-sans font-bold text-lg text-forest-deep tracking-tight">
                EquiFlow
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-gold/15 text-gold-dark border border-gold/30 rounded">
                PRO
              </span>
            </div>
            <span className="text-[11px] text-muted font-normal">
              CLB Huấn Luyện Ngựa Đua
            </span>
          </div>
        </Link>

        {/* Global Search Bar */}
        <div className="relative w-80 hidden md:block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Tìm mã ngựa (A01), tên nài, giáo án..."
            className="w-full h-9 pl-9 pr-3 text-sm bg-canvas border border-border rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest transition-all"
          />
        </div>
      </div>

      {/* Right side: Active Shift, Emergency Alert, Quick Action, Profile */}
      <div className="flex items-center gap-4">
        {/* Active shift badge */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-forest-wash border border-forest/20 rounded-full text-xs text-forest-deep">
          <span className="w-2 h-2 rounded-full bg-positive-text animate-pulse"></span>
          <span className="font-semibold">Thứ Ba, 11/03</span>
          <span className="text-muted">·</span>
          <span className="text-positive-text font-medium">Ca sáng hoạt động</span>
        </div>

        {/* Medical Lock Fast Alert Button */}
        {onOpenMedicalLock && (
          <button
            onClick={onOpenMedicalLock}
            className="h-9 px-3 rounded-lg border border-critical-border bg-critical-bg text-critical-text hover:bg-critical-text hover:text-white transition-all text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            title="Xem chi tiết 1 chiến mã đang bị Khóa Y Tế"
          >
            <svg
              className="w-4 h-4 text-critical-text group-hover:text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 2a4 4 0 00-4 4v2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V6a4 4 0 00-4-4zm2 6V6a2 2 0 10-4 0v2h4zm-3 5a1 1 0 112 0 1 1 0 01-2 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>Khóa Y Tế (1)</span>
          </button>
        )}

        {/* Quick New Plan CTA */}
        <button
          onClick={() => navigate('/training/plans')}
          className="h-9 px-3.5 rounded-lg bg-forest hover:bg-forest-deep text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">+ Lập giáo án</span>
        </button>

        <div className="h-6 w-px bg-border mx-0.5 hidden sm:block"></div>

        {/* Notification Bell */}
        <button
          aria-label="Thông báo"
          className="relative w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-forest hover:bg-forest-wash transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-critical-text ring-2 ring-white"></span>
        </button>

        {/* Head Trainer Profile */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-border">
          <div className="w-9 h-9 rounded-full bg-forest-deep text-gold flex items-center justify-center font-bold text-xs border-2 border-gold/40 shadow-sm">
            NVH
          </div>
          <div className="hidden xl:flex flex-col text-left">
            <span className="text-xs font-semibold text-ink leading-tight">
              Nguyễn Văn Hòa
            </span>
            <span className="text-[11px] text-muted">HLV Trưởng Vận hành</span>
          </div>
        </div>
      </div>
    </header>
  );
};
