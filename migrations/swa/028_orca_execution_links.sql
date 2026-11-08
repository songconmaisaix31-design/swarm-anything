CREATE TABLE orca_execution_links (
    authority_domain TEXT NOT NULL,
    native_run_id TEXT NOT NULL,
    native_root_task_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES local_agent_projects(id),
    grant_agent_id TEXT NOT NULL,
    settings_revision INTEGER NOT NULL CHECK (settings_revision > 0),
    created_at TEXT NOT NULL,
    PRIMARY KEY (authority_domain, native_run_id)
);

CREATE INDEX orca_execution_links_project ON orca_execution_links(project_id);
