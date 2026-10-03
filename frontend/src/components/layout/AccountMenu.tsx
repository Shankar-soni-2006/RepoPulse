import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { authService } from '@/services/authService';
import { SESSION_QUERY_KEY } from '@/hooks/useSession';
import type { SessionUser } from '@/types';
import { cn } from '@/utils/cn';

interface AccountMenuProps {
  user: SessionUser;
  /** Which way the menu opens */
  placement?: 'up' | 'down';
}

export function Avatar({ user, size = 20 }: { user: SessionUser; size?: number }) {
  if (!user.avatarUrl) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground"
        style={{ width: size, height: size }}
      >
        <User className="h-3 w-3" />
      </span>
    );
  }
  return (
    <img
      src={user.avatarUrl}
      alt=""
      width={size}
      height={size}
      className="rounded-full border border-border"
    />
  );
}

export function AccountMenu({ user, placement = 'down' }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      await authService.logout();
    } finally {
      // Even if the request failed, drop local state; the cookie expires server-side
      queryClient.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      navigate('/login', { replace: true });
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted/60 transition-colors"
      >
        <Avatar user={user} />
        <span className="flex-1 min-w-0 truncate text-xs font-medium">{user.login}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 z-20 w-52 rounded border border-border bg-background py-1 shadow-sm',
            placement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="text-xs text-muted-foreground">Signed in as</div>
            <div className="text-sm font-medium truncate">{user.name ?? user.login}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/60 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
