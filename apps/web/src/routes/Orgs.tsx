import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card, CardBody } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";

interface Org {
  id: string;
  name: string;
  slug: string;
}

export function Orgs() {
  const queryClient = useQueryClient();
  const { data: orgs, isLoading } = useQuery({ queryKey: ["orgs"], queryFn: () => api.get<Org[]>("/orgs") });
  const [name, setName] = useState("");

  const createOrg = useMutation({
    mutationFn: (input: { name: string; slug: string }) => api.post<Org>("/orgs", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgs"] });
      setName("");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!name.trim() || !slug) return;
    createOrg.mutate({ name: name.trim(), slug });
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <PageHeader title="Your organizations" subtitle="Pick an organization to see its projects and queues." />

      <form onSubmit={onSubmit} className="mb-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New organization name"
          className="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button type="submit" variant="primary" disabled={createOrg.isPending}>
          Create
        </Button>
      </form>

      {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

      <div className="grid gap-3">
        {orgs?.map((org) => (
          <Link key={org.id} to={`/orgs/${org.id}/projects`}>
            <Card className="p-5 transition-shadow hover:shadow-raised">
              <div className="font-medium text-text-primary">{org.name}</div>
              <div className="text-sm text-text-secondary">{org.slug}</div>
            </Card>
          </Link>
        ))}
        {orgs?.length === 0 && (
          <Card>
            <CardBody className="text-sm text-text-secondary">
              No organizations yet — create one above to get started.
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
