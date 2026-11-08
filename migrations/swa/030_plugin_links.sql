-- 插件正文、认知状态和业务批准继续保存在各插件自己的数据库。
CREATE TABLE swa_plugin_connections (
    project_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version > 0),
    data TEXT NOT NULL,
    PRIMARY KEY(project_id, plugin_id)
);
CREATE TABLE swa_plugin_references (
    project_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    object_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision > 0),
    PRIMARY KEY(project_id, plugin_id, kind, object_id, revision)
);
CREATE TABLE swa_plugin_events (
    source TEXT NOT NULL,
    event_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY(source, event_id)
);
