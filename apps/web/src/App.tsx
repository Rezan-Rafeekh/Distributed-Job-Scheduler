import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { ProjectLayout } from "./components/Layout.js";
import { Login } from "./routes/Login.js";
import { Register } from "./routes/Register.js";
import { Orgs } from "./routes/Orgs.js";
import { Projects } from "./routes/Projects.js";
import { OrgMembers } from "./routes/OrgMembers.js";
import { QueueList } from "./routes/QueueList.js";
import { QueueDetail } from "./routes/QueueDetail.js";
import { JobExplorer } from "./routes/JobExplorer.js";
import { JobDetail } from "./routes/JobDetail.js";
import { Workers } from "./routes/Workers.js";
import { Dlq } from "./routes/Dlq.js";
import { Scheduled } from "./routes/Scheduled.js";
import { Metrics } from "./routes/Metrics.js";
import { Overview } from "./routes/Overview.js";
import { Pipeline } from "./routes/Pipeline.js";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/orgs" element={<ProtectedRoute><Orgs /></ProtectedRoute>} />
        <Route path="/orgs/:orgId/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
        <Route path="/orgs/:orgId/members" element={<ProtectedRoute><OrgMembers /></ProtectedRoute>} />

        <Route
          path="/projects/:projectId"
          element={
            <ProtectedRoute>
              <ProjectLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Overview />} />
          <Route path="queues" element={<QueueList />} />
          <Route path="queues/:queueId" element={<QueueDetail />} />
          <Route path="jobs" element={<JobExplorer />} />
          <Route path="jobs/:jobId" element={<JobDetail />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="workers" element={<Workers />} />
          <Route path="dlq" element={<Dlq />} />
          <Route path="scheduled" element={<Scheduled />} />
          <Route path="metrics" element={<Metrics />} />
        </Route>

        <Route path="*" element={<Navigate to="/orgs" replace />} />
      </Routes>
    </AuthProvider>
  );
}
