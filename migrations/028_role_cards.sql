CREATE TABLE swarm_role_cards (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL CHECK (version >= 1),
    data TEXT NOT NULL CHECK (json_valid(data))
);

INSERT INTO _migrations (id) VALUES ('028_role_cards');
