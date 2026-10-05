import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Search, ShieldCheck } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { adminService } from '@/services/adminService';
import { AccountMenu, Avatar } from '@/components/layout/AccountMenu';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { formatDate, formatRelative } from '@/utils/format';
import type { AdminOverview, AdminUser, AdminUserUpdate } from '@/types';

const ADMIN_KEY = ['admin'] as const;

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className="bg-background px-4 py-3">
      <div className={tone === 'danger' && value > 0 ? 'text-lg font-semibold tabular-nums text-red-700 dark:text-red-300' : 'text-lg font-semibold tabular-nums'}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function OverviewStats({ o }: { o: AdminOverview }) {
  return (
    <section aria-label="System overview" className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
      <Stat label="Users" value={o.users} />
      <Stat label="Admins" value={o.admins} />
      <Stat label="New users (7 days)" value={o.newUsers7d} />
      <Stat label="Suspended" value={o.suspended} />
      <Stat label="Active sessions" value={o.activeSessions} />
      <Stat label="Repositories" value={o.repositories} />
      <Stat label="Synced repositories" value={o.syncedRepositories} />
      <Stat label="Failed syncs" value={o.failedSyncs} tone="danger" />
      <Stat label="Webhook failures (24 h)" value={o.webhookFailures24h} tone="danger" />
    </section>
  );
}

function UserActions({ user, isSelf, onUpdate, onDelete, busy }: {
  user: AdminUser;
  isSelf: boolean;
  onUpdate: (update: AdminUserUpdate) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (isSelf) return <span className="text-xs text-muted-foreground">You</span>;
  const isAdmin = user.role === 'admin';
  const adminLocked = isAdmin ? 'Change this admin to member first' : undefined;

  if (confirmDelete) {
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
        <span className="text-xs text-muted-foreground">Delete {user.login}?</span>
        <Button size="sm" variant="danger" disabled={busy} onClick={() => { setConfirmDelete(false); onDelete(); }}>
          Delete
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
          Cancel
        </Button>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <Button size="sm" disabled={busy} onClick={() => onUpdate({ role: isAdmin ? 'member' : 'admin' })}>
        {isAdmin ? 'Make member' : 'Make admin'}
      </Button>
      <Button
        size="sm"
        disabled={busy || isAdmin}
        title={adminLocked}
        onClick={() => onUpdate({ suspended: !user.suspendedAt })}
      >
        {user.suspendedAt ? 'Reinstate' : 'Suspend'}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy || isAdmin} title={adminLocked} onClick={() => setConfirmDelete(true)}>
        Delete
      </Button>
    </span>
  );
}

export function AdminPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const isAdmin = session?.user.role === 'admin';
  const [search, setSearch] = useState('');

  const overview = useQuery({ queryKey: [...ADMIN_KEY, 'overview'], queryFn: adminService.overview, enabled: isAdmin });
  const users = useQuery({ queryKey: [...ADMIN_KEY, 'users'], queryFn: adminService.users, enabled: isAdmin });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ADMIN_KEY });

  const update = useMutation({
    mutationFn: ({ id, change }: { id: string; change: AdminUserUpdate }) => adminService.updateUser(id, change),
    onSettled: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => adminService.deleteUser(id), onSettled: refresh });
  const actionError = update.error ?? remove.error;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users.data ?? []).filter((u) => !q || u.login.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q));
  }, [users.data, search]);

  return (
    <div className="min-h-screen bg-background">
      <header className="h-11 border-b border-border px-4 sm:px-6 flex items-center gap-3">
        <Link to="/repositories" className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold tracking-tight whitespace-nowrap">RepoPulse</span>
        </Link>
        <span className="text-muted-foreground text-sm whitespace-nowrap hidden sm:inline">/ Admin</span>
        <div className="flex-1" />
        <ThemeToggle />
        {session && (
          <div className="w-36 sm:w-44 min-w-0">
            <AccountMenu user={session.user} />
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Admin
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage users and roles. Repository data stays visible only to people GitHub gives access.
          </p>
        </div>

        {session && !isAdmin && (
          <ErrorState message="Admin access required. Ask a RepoPulse admin to change your role." />
        )}

        {isAdmin && (
          <>
            {overview.isLoading && <LoadingState message="Loading overview…" />}
            {overview.error && <ErrorState message={overview.error.message} onRetry={() => overview.refetch()} />}
            {overview.data && <OverviewStats o={overview.data} />}

            <Panel
              title="Users"
              description="Admins manage users; members use RepoPulse on the repositories GitHub lets them see"
              flush
              actions={
                <div className="relative w-48">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input aria-label="Search users" placeholder="Search users" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-7" />
                </div>
              }
            >
              {actionError && (
                <p role="alert" className="border-b border-border px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {actionError.message}
                </p>
              )}
              {users.isLoading && <LoadingState message="Loading users…" />}
              {users.error && <ErrorState message={users.error.message} onRetry={() => users.refetch()} />}
              {users.data && (
                <Table>
                  <Thead>
                    <tr>
                      <Th>User</Th>
                      <Th>Role</Th>
                      <Th>Status</Th>
                      <Th className="hidden md:table-cell">Joined</Th>
                      <Th className="hidden md:table-cell">Last active</Th>
                      <Th className="hidden sm:table-cell text-right">Repos</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </Thead>
                  <Tbody>
                    {filtered.map((u) => {
                      const busy = (update.isPending && update.variables?.id === u.id) || (remove.isPending && remove.variables === u.id);
                      return (
                        <Tr key={u.id}>
                          <Td>
                            <span className="inline-flex items-center gap-2 min-w-0">
                              <Avatar user={u} size={20} />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{u.login}</span>
                                {u.name && <span className="block truncate text-xs text-muted-foreground">{u.name}</span>}
                              </span>
                            </span>
                          </Td>
                          <Td>
                            <Badge variant={u.role === 'admin' ? 'default' : 'muted'}>{u.role === 'admin' ? 'Admin' : 'Member'}</Badge>
                          </Td>
                          <Td>
                            {u.suspendedAt ? (
                              <Badge variant="danger" title={`Suspended ${formatDate(u.suspendedAt)}`}>Suspended</Badge>
                            ) : (
                              <Badge variant="success">Active</Badge>
                            )}
                          </Td>
                          <Td className="hidden md:table-cell text-xs text-muted-foreground">{formatDate(u.createdAt)}</Td>
                          <Td className="hidden md:table-cell text-xs text-muted-foreground">{u.lastActiveAt ? formatRelative(u.lastActiveAt) : 'Never'}</Td>
                          <Td className="hidden sm:table-cell text-right tabular-nums">{u.repositoryCount}</Td>
                          <Td className="text-right">
                            <UserActions
                              user={u}
                              isSelf={u.id === session?.user.id}
                              busy={busy}
                              onUpdate={(change) => update.mutate({ id: u.id, change })}
                              onDelete={() => remove.mutate(u.id)}
                            />
                          </Td>
                        </Tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <Tr>
                        <Td colSpan={7} className="py-6 text-center text-xs text-muted-foreground">
                          No users match “{search}”.
                        </Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>
              )}
            </Panel>
          </>
        )}
      </main>
    </div>
  );
}
