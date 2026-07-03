import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card, CardBody } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";


interface Project {
  id: string;
  name: string;
  description: string | null;
}

export function Projects() {
  const { orgId } = useParams();
  const queryClient = useQueryClient();
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => api.get<Project[]>(`/orgs/${orgId}/projects`),
  });
  const [name, setName] = useState("");

  const createProject = useMutation({
    mutationFn: (input: { name: string }) => api.post<Project>(`/orgs/${orgId}/projects`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", orgId] });
      setName("");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createProject.mutate({ name: name.trim() });
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <PageHeader
        title="Projects"
        subtitle="Each project owns its own job queues."
        actions={
          <Link to={`/orgs/${orgId}/members`}>
            <Button variant="ghost">Manage members</Button>
          </Link>
        }
      />

      <form onSubmit={onSubmit} className="mb-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name"
          className="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button type="submit" variant="primary" disabled={createProject.isPending}>
          Create
        </Button>
      </form>

      {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

      <div className="grid gap-3">
        {projects?.map((project) => (
          <Link key={project.id} to={`/projects/${project.id}/queues`}>
            <Card className="p-5 transition-shadow hover:shadow-raised">
              <div className="font-medium text-text-primary">{project.name}</div>
              {project.description && <div className="text-sm text-text-secondary">{project.description}</div>}
            </Card>
          </Link>
        ))}
        {projects?.length === 0 && (
          <Card>
            <CardBody className="text-sm text-text-secondary">No projects yet — create one above.</CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
