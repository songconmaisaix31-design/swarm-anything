-- Human registered projects, per-operation grants and native observations.
-- Settings revision is indexed for the repository optimistic CAS.
CREATE TABLE local_agent_projects (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL CHECK(version > 0),
    data TEXT NOT NULL
);
CREATE TABLE local_agent_grants (
    project_id TEXT NOT NULL REFERENCES local_agent_projects(id),
    agent_id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY(project_id, agent_id)
);
CREATE TABLE local_agent_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES local_agent_projects(id),
    data TEXT NOT NULL
);
CREATE INDEX local_agent_sessions_project ON local_agent_sessions(project_id);
UPDATE foundation_schema SET version = 2 WHERE context = 'workspace';
INSERT OR IGNORE INTO _migrations(id) VALUES ('007_local_agent_projects');
