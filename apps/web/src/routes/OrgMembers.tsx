import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OrgRole, type OrgRole as OrgRoleType } from "@codity/shared";
import { api, ApiError } from "../lib/apiClient.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { useToast } from "../components/ui/Toast.js";

interface Member {
  id: string;
  role: OrgRoleType;
  user: { id: string; email: string; name: string };
}

const ROLES: OrgRoleType[] = [OrgRole.VIEWER, OrgRole.MEMBER, OrgRole.ADMIN, OrgRole.OWNER];

export function OrgMembers() {
  const { orgId } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: members, isLoading } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => api.get<Member[]>(`/orgs/${orgId}/members`),
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRoleType>(OrgRole.MEMBER);
  const [error, setError] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: (input: { email: string; role: OrgRoleType }) => api.post(`/orgs/${orgId}/members`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members", orgId] });
      setEmail("");
      setError(null);
      toast.show("Member invited");
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to invite member";
      setError(message);
      toast.show(message, "error");
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: OrgRoleType }) =>
      api.patch(`/orgs/${orgId}/members/${memberId}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members", orgId] });
      toast.show("Role updated");
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : "Failed to update role", "error"),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => api.delete(`/orgs/${orgId}/members/${memberId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members", orgId] });
      toast.show("Member removed", "info");
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : "Failed to remove member", "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    invite.mutate({ email: email.trim(), role });
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <PageHeader
        title="Organization members"
        subtitle="Invite teammates and manage role-based access (VIEWER < MEMBER < ADMIN < OWNER)."
        actions={
          <Link to={`/orgs/${orgId}/projects`}>
            <Button variant="ghost">Back to projects</Button>
          </Link>
        }
      />

      <form onSubmit={onSubmit} className="mb-6 flex flex-wrap items-end gap-2">
        {error && <p className="w-full rounded-lg bg-cherry-50 px-3 py-2 text-sm text-cherry-700">{error}</p>}
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            Member email (must already have a Codity account)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="w-36">
          <label className="mb-1 block text-xs font-medium text-text-secondary">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as OrgRoleType)}
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="primary" disabled={invite.isPending}>
          Invite
        </Button>
      </form>

      {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-5 py-3 font-medium">Member</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {members?.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3">
                    <div className="text-text-primary">{m.user.name}</div>
                    <div className="text-xs text-text-secondary">{m.user.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={m.role}
                      onChange={(e) => updateRole.mutate({ memberId: m.id, role: e.target.value as OrgRoleType })}
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-sm"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="danger" size="sm" onClick={() => removeMember.mutate(m.id)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {members?.length === 0 && <p className="px-5 py-4 text-sm text-text-secondary">No members yet.</p>}
      </Card>
    </div>
  );
}
