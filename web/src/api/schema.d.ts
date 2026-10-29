// Generated from contracts/openapi.yaml. Run pnpm generate; do not edit.
export interface paths {
    "/local-projects/{id}/orca/commands": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Execute one authorized command against the installed private Orca runtime
         * @description Uses current project grants and fixed context. Mutations require the same canonical UUID in request_id and Idempotency-Key. Native Run, Task, Dispatch, receipt and transcript remain authoritative; unknown operations are never resent automatically. Authenticated human safety stops recheck exact native ownership and remain available after execution approval changes.
         */
        post: operations["executeOrcaCommand"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/openviking/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read optional OpenViking configuration and verified identity */
        get: operations["getOpenVikingStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/project-spaces/{id}/openviking/submissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read actual persistent submissions in one project space */
        get: operations["listOpenVikingSubmissions"];
        put?: never;
        /**
         * Human approves sending one included fixed revision to the current destination
         * @description Credentials do not authorize sending. Existing in-flight or unknown submissions prevent a second upstream action, including with a new request_id. No automatic replay.
         */
        post: operations["submitOpenVikingSource"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/openviking/submissions/{id}/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Observe the upstream task linked to one local submission
         * @description Reads the persisted task_id and saves its actual observation. Never resubmits upload or resource creation.
         */
        post: operations["refreshOpenVikingSubmission"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/project-spaces/{id}/openviking/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Human searches the current project destination */
        post: operations["searchOpenVikingProject"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/project-spaces/{id}/openviking/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Read one authorized resource tier using its actual URI
         * @description L0 and L1 read directory abstract or overview; L2 reads file text. URI and current fixed project permission are checked before and after reading.
         */
        post: operations["readOpenVikingProjectContent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/experiences/completions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Draft an experience from one actual completed task
         * @description Human-only command bound to an actual LocalProject.ID and immutable completion event. Missing Interpreter returns provider_unavailable; unknown model delivery is never replayed. A successful candidate remains quarantine until the user approves it.
         */
        post: operations["captureCompletionExperience"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/experiences/{id}/evidence": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Resolve safe references using current project permissions */
        get: operations["readExperienceEvidence"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admissions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read the original human or delegated admission */
        get: operations["readOpportunityAdmission"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admissions/{id}/revocations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Revoke a current admission with an explicit human reason
         * @description Does not change a separately issued execution grant.
         */
        post: operations["revokeOpportunityAdmission"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/attention-taste-profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read current human taste configuration */
        get: operations["readAttentionTasteProfile"];
        /** Save an explicit versioned human taste profile */
        put: operations["updateAttentionTasteProfile"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{project_id}/judgment-snapshots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Capture explicitly selected approved files */
        post: operations["captureJudgmentSnapshot"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{project_id}/judgment-policies/{question_type}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read the current question policy under human authority */
        get: operations["readJudgmentPolicy"];
        /**
         * Save an explicit current-project policy
         * @description Requires an actual snapshot, matching settings revision and approved sources. Public snapshot root is empty; the internal root comes from the authorized project.
         */
        put: operations["updateJudgmentPolicy"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{project_id}/judgments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Evaluate an explicitly authorized fixed-source question
         * @description The body project must match the path. Context-bound questions use the delegation workflow. Backend, language and budgets are supplied explicitly; unavailable configured models fail without a replacement.
         */
        post: operations["submitProjectJudgment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{project_id}/judgments/{decision_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read an actual judgment under current source permissions */
        get: operations["readProjectJudgment"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{project_id}/judgments/{decision_id}/feedback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read actual feedback for the fixed judgment */
        get: operations["readJudgmentFeedback"];
        put?: never;
        /** Record explicit human feedback for the exact result version */
        post: operations["recordJudgmentFeedback"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{project_id}/delegation-rules": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List current project delegation rules */
        get: operations["listJudgmentDelegationRules"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{project_id}/delegation-rules/{rule_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read the original current-project rule */
        get: operations["readJudgmentDelegationRule"];
        /** Save an explicit human delegation rule */
        put: operations["updateJudgmentDelegationRule"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{project_id}/delegation-rules/{rule_id}/state": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Apply an explicit current rule state change */
        post: operations["changeJudgmentDelegationState"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{project_id}/delegation-rules/{rule_id}/judgments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Evaluate a fixed opportunity using its current authorized rule */
        post: operations["evaluateJudgmentDelegation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{project_id}/judgments/{decision_id}/admissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Consume a complete authorized judgment into a draft proposal */
        post: operations["admitDelegatedJudgment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/intents/{id}/prepare": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Initialize the original owned controller with an empty message
         * @description Human permission confirmation reserves the original workspace and initializes the same controller without a model input. The task remains ready. First input requires a separate Confirm operation; delivery_unknown must never be replayed.
         */
        post: operations["prepareRelayIntent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/context-packets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Build a fixed packet from the current approved project snapshot */
        post: operations["buildWorkspaceContextPacket"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/context-packets/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read a fixed context packet under the current project permission */
        get: operations["readWorkspaceContextPacket"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/session-bindings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Bind a current owned native session to a fixed approved packet
         * @description Requires the original owned-session provider. An absent provider returns unsupported_capability and creates no binding.
         */
        post: operations["bindWorkspaceSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/missions/{id}/work-items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read authorized mission work items */
        get: operations["listSwarmWorkItems"];
        put?: never;
        /** Add a work item within the current approved mission */
        post: operations["addSwarmWorkItem"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/missions/{id}/dag": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read current authorized task dependencies and original Worker participation */
        get: operations["readSwarmMissionDAG"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/missions/{id}/timeline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read actual outbox event references for an authorized mission */
        get: operations["readSwarmTimeline"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/missions/{id}/recover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reconcile original executions before explicitly resuming a mission
         * @description Human command preserves unknown usage, leases and reservations. It does not start a replacement executor.
         */
        post: operations["recoverSwarmMission"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/artifacts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read an authorized artifact or its fixed version */
        get: operations["readSwarmArtifact"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/artifacts/{id}/diff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read the verified Git diff object of an authorized artifact */
        get: operations["readSwarmArtifactDiff"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/artifacts/{id}/rejection": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Record the human rejection of an actual artifact */
        post: operations["rejectSwarmArtifact"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/repository-context/map": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read the current authorized repository map without rebuilding */
        get: operations["readRepositoryContextMap"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/repository-context/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Search the current authorized code index with explicit bounds
         * @description Human requests require X-CSRF-Token; project Agent tokens require a current read_context grant.
         */
        post: operations["searchRepositoryContextCode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/repository-context/impact": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Read bounded impact relationships from the current code index
         * @description Human requests require X-CSRF-Token; project Agent tokens require a current read_context grant.
         */
        post: operations["queryRepositoryContextImpact"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/repository-context/index": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Explicitly maintain the selected repository index
         * @description Requires the current human session and X-CSRF-Token. The backend rechecks the authorized source snapshot before publishing a generation.
         */
        post: operations["updateRepositoryContextIndex"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/repository-context/map/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Explicitly refresh the authored map for the authorized snapshot
         * @description Requires the current human session and X-CSRF-Token. Reads do not invoke this command.
         */
        post: operations["refreshRepositoryContextMap"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/goals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List goals within current project access */
        get: operations["listWorkspaceGoals"];
        put?: never;
        /** Create a human goal with expected_version zero */
        post: operations["createWorkspaceGoal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/goals/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read a goal or fixed revision with current project access */
        get: operations["readWorkspaceGoal"];
        /** Revise a human goal with expected_version CAS */
        put: operations["reviseWorkspaceGoal"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/proposals/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read a proposal or fixed revision with current project access */
        get: operations["readWorkspaceProposal"];
        /** Revise content and preserve the prior proposal revision */
        put: operations["reviseWorkspaceProposal"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/proposals/{id}/decline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Decline an in-review proposal by human command */
        post: operations["declineWorkspaceProposal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/approvals/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read an approval with current project access */
        get: operations["readWorkspaceApproval"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/approvals/{id}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Complete an active approval by human command */
        post: operations["completeWorkspaceApproval"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/approvals/{id}/expire": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mark an elapsed active approval expired by human command */
        post: operations["expireWorkspaceApproval"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/tasks/{id}/facts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read persisted safe action facts and session relations
         * @description Human session and Origin required. GET reads persisted facts with current project permission; no controller observation, source-file IO, input delivery, receipt write or state transition. Six-field session-events remains unchanged.
         */
        get: operations["listRelayTaskFacts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/session-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read local owned session admissions
         * @description Existing human session and Origin guard. Rechecks project grant, revision and owned binding on every GET, returns cached/persisted six-field derived events by source timestamp descending. GET never captures, launches or resumes. Snapshot extent is separate from complete native session coverage. No raw/native IDs/paths/commands or cognitive values.
         */
        get: operations["listRelaySessionEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/tasks/{id}/events/reconcile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Explicit human reconciliation of the same derived event origins
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset. Does not re-execute Agent or clear original receipts. Published means admitted to isolated app observations, not cognitive normalization or snapshot publication.
         */
        post: operations["reconcileRelayTaskEvents"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read current human project permission scope
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        get: operations["listRelayProjects"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/agents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listRelayAgents
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        get: operations["listRelayAgents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/tasks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listRelayTasks
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        get: operations["listRelayTasks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/tasks/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getRelayTask
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        get: operations["getRelayTask"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/tasks/{id}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listRelayTaskEvents
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        get: operations["listRelayTaskEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/tasks/{id}/receipts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listRelayTaskReceipts
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        get: operations["listRelayTaskReceipts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/intents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * createRelayIntent
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        post: operations["createRelayIntent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/intents/{id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * confirmRelayIntent
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        post: operations["confirmRelayIntent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/tasks/{id}/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * sendRelayTask
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        post: operations["sendRelayTask"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/tasks/{id}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * readRelayTask
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        post: operations["readRelayTask"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/tasks/{id}/stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * stopRelayTask
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        post: operations["stopRelayTask"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/tasks/{id}/resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * resumeRelayTask
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        post: operations["resumeRelayTask"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relay/tasks/{id}/transition": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * transitionRelayTask
         * @description Candidate Works Relay v1.2 contract. Existing human session and Origin guard; POST also requires CSRF and Idempotency-Key. Sole runtime Service owns state and immutable action receipts. No automatic retry or dispatch. Unconfirmed user seams remain unset.
         */
        post: operations["transitionRelayTask"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cognition/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read cognitive workbench health
         * @description Read-only published snapshot. Human session, loopback and origin guard apply; no source DB fallback. Events use exactly six safe fields. Shanghai dates are inclusive; missing state is preserved.
         */
        get: operations["getWorkbenchHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cognition/today": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read cognitive workbench today
         * @description Read-only published snapshot. Human session, loopback and origin guard apply; no source DB fallback. Events use exactly six safe fields. Shanghai dates are inclusive; missing state is preserved.
         */
        get: operations["getWorkbenchToday"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cognition/focus": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read cognitive workbench focus
         * @description Read-only published snapshot. Human session, loopback and origin guard apply; no source DB fallback. Events use exactly six safe fields. Shanghai dates are inclusive; missing state is preserved.
         */
        get: operations["getWorkbenchFocus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cognition/topics/evidence": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read cognitive workbench topics/evidence
         * @description Read-only published snapshot. Human session, loopback and origin guard apply; no source DB fallback. Events use exactly six safe fields. Shanghai dates are inclusive; missing state is preserved.
         */
        get: operations["getWorkbenchEvidence"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cognition/agents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read cognitive workbench agents
         * @description Read-only published snapshot. Human session, loopback and origin guard apply; no source DB fallback. Events use exactly six safe fields. Shanghai dates are inclusive; missing state is preserved.
         */
        get: operations["getWorkbenchAgents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cognition/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read cognitive workbench events
         * @description Read-only published snapshot. Human session, loopback and origin guard apply; no source DB fallback. Events use exactly six safe fields. Shanghai dates are inclusive; missing state is preserved.
         */
        get: operations["getWorkbenchEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cognition/filters": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read cognitive workbench filters
         * @description Read-only published snapshot. Human session, loopback and origin guard apply; no source DB fallback. Events use exactly six safe fields. Shanghai dates are inclusive; missing state is preserved.
         */
        get: operations["getWorkbenchFilters"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/source-collections/discover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Discover explicitly selected source collections
         * @description Human CSRF command invokes a bounded public provider or an explicitly configured selected browser folder bridge and caches metadata. Failure preserves prior catalog; GET only reads cache. No binding, full body extraction, model call, credentials or automatic selection.
         */
        post: operations["discoverSourceCollections"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/github-repositories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read public repository cache
         * @description Human cached GET only; no network, code checkout, credential access, model processing or Agent launch.
         */
        get: operations["listGitHubRepositories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/github-repositories/sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sync explicitly named public GitHub metadata
         * @description Anonymous fixed-program metadata retrieval capped at 100 repositories. No clone or README/body extraction; only explicit human input and CSRF. Account/private scope remains pending.
         */
        post: operations["syncGitHubRepositories"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/github-repositories/{id}/placement": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Place repository in top-level development space
         * @description Human selects an existing ProjectSpace; fixed program clones into its managed root and records actual HEAD. Repeated placement reuses the clone. Default A only; B/C, control, model and each action remain independently human approved. No Mission or Agent autostart.
         */
        post: operations["placeGitHubRepository"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/sessions/probe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify chosen native CLI connection
         * @description Human explicitly verifies one registered native adapter in the approved project: initialize a bounded empty native session, confirm owned stop, and cache actual observations. No model turn or automatic dispatch; unknown stays unknown until observed.
         */
        post: operations["probeNativeCLI"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/source-collections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list Source Collections
         * @description Cached favorite folder metadata for one explicit owner; GET never invokes a browser, CLI or provider. Explicit human POST discovery refreshes this cache.
         */
        get: operations["listSourceCollections"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/agent-token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * issue Project Agent Token
         * @description Human-only issuance for an already approved project Agent grant. Returned once, never stored in browser fixtures or logs; tokens recheck current grant on every operation.
         */
        post: operations["issueProjectAgentToken"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/sessions/discover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * discover Native Sessions
         * @description Reads only explicitly registered CLI history roots and filters exact project identity. External observations do not confer process control.
         */
        post: operations["discoverNativeSessions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/sessions/{session_id}/context": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * read Native Context
         * @description Project-scoped native context; registered history paths remain internal and do not authorize arbitrary transcript reads.
         */
        get: operations["readNativeContext"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tracking-sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list Tracking Sources
         * @description Public metadata only; no cookies, login, credentials or body extraction before human selection. Binding never starts execution; unavailable services return 501.
         */
        get: operations["listTrackingSources"];
        put?: never;
        /**
         * bind Tracking Source
         * @description Public metadata only; no cookies, login, credentials or body extraction before human selection. Binding never starts execution; unavailable services return 501.
         */
        post: operations["bindTrackingSource"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tracking-sources/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * get Tracking Source
         * @description Public metadata only; no cookies, login, credentials or body extraction before human selection. Binding never starts execution; unavailable services return 501.
         */
        get: operations["getTrackingSource"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tracking-sources/{id}/sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * sync Tracking Source
         * @description Sync up to 100 public metadata records; startup runs once and has no timer. Partial pages retain cached records and warnings.
         */
        post: operations["syncTrackingSource"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tracking-sources/{id}/recommend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * recommend Source Items
         * @description Selected metadata revisions sent only to the human-approved project CLI. Recommendations do not import content or approve themselves. Unknown model outcomes are not replayed.
         */
        post: operations["recommendSourceItems"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tracking-sources/{id}/select": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * select Source Items
         * @description Human selection of exact metadata revisions queues normal reusable summarize imports; no full-list auto import.
         */
        post: operations["selectSourceItems"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/registered": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read cached registered project observations
         * @description Human-only cached SQLite observations. GET never scans roots, invokes Git or starts a CLI. Candidates must be manually bound to an Attention space; discovery grants no context, model or control permission.
         */
        get: operations["listRegisteredProjects"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/registered/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Refresh observations of Orca registered project roots
         * @description Explicit human action runs bounded fixed discovery over actual registered roots and associated worktrees. It runs no project scripts, installs no dependencies, and never launches an Agent. Source failures retain old observations with stale status.
         */
        post: operations["refreshRegisteredProjects"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/registered/{project_id}/metadata": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Save human notes, review, grouping and archive state
         * @description Human session and CSRF only. The revision is the expected manual metadata revision (zero before the first save). Observations and refresh never replace these fields. This command grants no project access, model consent or Agent control and accepts no inferred progress.
         */
        put: operations["setRegisteredProjectMetadata"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list Local Projects
         * @description Human registered roots only; no whole-drive discovery.
         */
        get: operations["listLocalProjects"];
        put?: never;
        /**
         * register Local Project
         * @description Human registers one explicit root and Attention project space; default A selected fixed refs, B/C and external model permission disabled.
         */
        post: operations["registerLocalProject"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/discover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * discover Local Projects
         * @description Human chooses a bounded parent root for project discovery; no arbitrary disk scanning.
         */
        post: operations["discoverLocalProjects"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * set Local Project Settings
         * @description Human-only CAS settings. B allowlisted directories, C reference expansion and model CLI are explicit project permissions; revoke checked per operation.
         */
        put: operations["setLocalProjectSettings"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/grants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * grant Local Project Agent
         * @description Human-only operation-scoped Agent grant; token cannot confer permissions on itself.
         */
        post: operations["grantLocalProjectAgent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/grants/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * revoke Local Project Agent
         * @description Human-only revoke; subsequent reads and native operations reload current authority.
         */
        post: operations["revokeLocalProjectAgent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/context": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * read Local Project Context
         * @description Current project scoped A fixed references plus explicitly enabled B/C only; read does not increase human attention.
         */
        post: operations["readLocalProjectContext"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list Native Sessions
         * @description Native session observations for this project only; no arbitrary native histories.
         */
        get: operations["listNativeSessions"];
        put?: never;
        /**
         * start Native Session
         * @description Explicitly approved project CLI and actions only; automatic Agent dispatch remains disabled pending user clarification. Cooperative mode does not promise OS isolation.
         */
        post: operations["startNativeSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/sessions/{session_id}/resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * resume Native Session
         * @description Native session identity and ownership must be verified; unsupported native resume never becomes a new session silently.
         */
        post: operations["resumeNativeSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/sessions/{session_id}/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * send Native Message
         * @description Operation-scoped input to this project session. Unknown effects are never resent automatically.
         */
        post: operations["sendNativeMessage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/sessions/{session_id}/stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * stop Native Session
         * @description Stop only the owned native session and preserve actual stop confirmation; failed stop remains blocked.
         */
        post: operations["stopNativeSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/sessions/{session_id}/observe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * observe Native Session
         * @description Read factual native output and current state; no guessed completion, no synthetic history.
         */
        get: operations["observeNativeSession"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/papers/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * search public academic papers
         * @description Public metadata search only. It performs no import, no full-text extraction and no model call. A human selects a result and imports it through the existing ImportMaterial path (kind=paper, adapter per site, source_key dedup, new revision). Paywalled or login-restricted content is reported, never bypassed. A server without the search service returns 501.
         */
        get: operations["searchPapers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/progress": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * read cached project progress
         * @description Cached human-authored or model-inferred project stage read from approved fixed TASK/STATUS files only. It is never authoritative project state, a grant or a human approval; evidence carries source, version and freshness. A server without the progress service returns 501, not an empty success.
         */
        get: operations["getProjectProgress"];
        /**
         * set human-authored project progress
         * @description Human-authored project stage, summary and optional 0..100 percent. It is an advisory observation and never grants or expands project permission. A server without the progress service returns 501.
         */
        put: operations["setProjectProgress"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-projects/{id}/progress/infer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * infer project progress from approved TASK/STATUS files
         * @description Triggers a model inference over approved fixed TASK/STATUS files only. The caller-supplied Idempotency-Key header is the verified operation identity, persisted before the model turn so a retry cannot silently re-charge; unknown delivery is never replayed. Evidence carries source, version and freshness and never reads credentials, unapproved files or grants project control. A server without the progress service returns 501.
         */
        post: operations["inferProjectProgress"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/local-agents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read cached local CLI inventory
         * @description Human-session read of bounded PATH-based CLI observations. This GET never executes CLI probes, reads credentials or scans private sessions/projects. Installation, configuration and startability are independent observations; native capabilities require actual native runtime checks. Unknown is not support. No project access or native control is granted by this inventory. A server without the inventory service returns 501, not an empty success.
         */
        get: operations["listLocalAgents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * get Health
         * @description S0 implements this read-only operation.
         */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/foundation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * get Foundation
         * @description S0 implements this read-only operation.
         */
        get: operations["getFoundation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/materials": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list Materials
         * @description S0 implements this read-only operation.
         */
        get: operations["listMaterials"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/opportunities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list Opportunitys
         * @description S0 implements this read-only operation.
         */
        get: operations["listOpportunitys"];
        put?: never;
        /**
         * createOpportunity
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        post: operations["createOpportunity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list Projects
         * @description S0 implements this read-only operation.
         */
        get: operations["listProjects"];
        put?: never;
        /**
         * register Project
         * @description S0 MUST return HTTP 501 unsupported_capability without side effects. Examples describe future DTOs only.
         */
        post: operations["registerProject"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/proposals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list Proposals
         * @description Read persisted proposals within current human or scoped Agent project access.
         */
        get: operations["listProposals"];
        put?: never;
        /**
         * Create a draft proposal with expected_version zero
         * @description Existing human CSRF or scoped Agent authentication; the application rechecks current project access and fixed input references. No execution is launched.
         */
        post: operations["createWorkspaceProposal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list Sessions
         * @description S0 implements this read-only operation.
         */
        get: operations["listSessions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/missions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List missions within current project permissions
         * @description Reads the actual approved Swarm ledger without creating an executor.
         */
        get: operations["listMissions"];
        put?: never;
        /**
         * Create or retrieve the unique mission of a current human approval
         * @description Requires the human session, CSRF and an unchanged approved proposal and project scope. HTTP cannot supply a trusted consumer event.
         */
        post: operations["createSwarmMission"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/missions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read the current authorized mission and execution references
         * @description Returns the actual ledger, work items, leases, artifacts and safe timeline references.
         */
        get: operations["getMission"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/materials/imports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * import Material
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        post: operations["importMaterial"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/opportunities/{id}/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * review Opportunity
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        post: operations["reviewOpportunity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/opportunities/{id}/admissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Admit an actual review-ready opportunity into a draft proposal
         * @description Human command binds the current opportunity version and fixed revision. An explicit project rechecks current project and selected-source permission. The proposal remains unassigned and creates no execution grant, native session or Mission.
         */
        post: operations["admitOpportunity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sessions/{id}/resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * resume Session
         * @description S0 MUST return HTTP 501 unsupported_capability without side effects. Examples describe future DTOs only.
         */
        post: operations["resumeSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sessions/{id}/handoff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * handoff Session
         * @description S0 MUST return HTTP 501 unsupported_capability without side effects. Examples describe future DTOs only.
         */
        post: operations["handoffSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/proposals/{id}/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * submit Proposal
         * @description Submit a draft for review after current project and executable-content validation. Human writes require session CSRF; a scoped Agent must retain current project access. No execution starts.
         */
        post: operations["submitProposal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/proposals/{id}/approvals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * approve Proposal
         * @description Human approval requires expected_version CAS, the fixed expected_revision, current project permission and an expiry within stopping conditions. Proposal, approval, receipt and outbox are written in one actual transaction; approval does not launch execution.
         */
        post: operations["approveProposal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/approvals/{id}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * revoke Approval
         * @description Human revocation checks expected_version against the current approval epoch and persists the next epoch and outbox in the same transaction. Later protected actions must recheck the current grant.
         */
        post: operations["revokeApproval"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/missions/{id}/pause": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * pause Mission
         * @description Human command preserves the original execution and retains unknown leases until actual reconciliation.
         */
        post: operations["pauseMission"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/missions/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * cancel Mission
         * @description Human cancellation persists before stopping original executions; unknown outcomes retain their reservations.
         */
        post: operations["cancelMission"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/work-items/{id}/claims": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * claim Work Item
         * @description Requires a current approved binding and original prepared input operation. Missing verified native dependencies returns 501.
         */
        post: operations["claimWorkItem"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/work-items/{id}/artifacts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * submit Artifact
         * @description Saves verified Git and actual project checks under the original lease. Usage remains unknown where evidence is unavailable.
         */
        post: operations["submitArtifact"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/artifacts/{id}/acceptance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * accept Artifact
         * @description Human adoption records the actual accepted artifact and experience provenance separately from submission.
         */
        post: operations["acceptArtifact"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Stream scoped events
         * @description Future cursor-based SSE projection of EventV1. S0 returns 501; the browser must never infer mission state from accumulated events.
         */
        get: operations["streamEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getLocalSession
         * @description S1 Attention service. Human writes require local session cookie and CSRF token; Agent bearer credentials are read-only. Reads do not increase human attention.
         */
        get: operations["getLocalSession"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/materials/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getMaterial
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        get: operations["getMaterial"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * updateMaterial
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        patch: operations["updateMaterial"];
        trace?: never;
    };
    "/materials/{id}/revisions/{revision}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getMaterialContent
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        get: operations["getMaterialContent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/materials/{id}/uses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * recordMaterialUse
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        post: operations["recordMaterialUse"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/distillations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listDistillations
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        get: operations["listDistillations"];
        put?: never;
        /**
         * recordDistillation
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        post: operations["recordDistillation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/opportunities/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getOpportunity
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        get: operations["getOpportunity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/opportunities/{id}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * reviseOpportunity
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        post: operations["reviseOpportunity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listJobs
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        get: operations["listJobs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getJob
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        get: operations["getJob"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/{id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * retryJob
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        post: operations["retryJob"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * cancelJob
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        post: operations["cancelJob"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/materials/{id}/revisions/{revision}/attachments/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read original immutable source attachment
         * @description S1 Attention service. Human writes require local session cookie and CSRF token. Agent credentials identify the caller but deny all protected data access until explicit user material scopes are configured. Reads never increase human attention.
         */
        get: operations["getMaterialAttachment"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/material-domains": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listMaterialDomains
         * @description Human-owned classification and project-space reference. Original material remains in its classification. References pin an existing material revision; they grant no Agent access or execution authority. Agent read scopes are pending and denied by default.
         */
        get: operations["listMaterialDomains"];
        put?: never;
        /**
         * createMaterialDomain
         * @description Human-owned classification and project-space reference. Original material remains in its classification. References pin an existing material revision; they grant no Agent access or execution authority. Agent read scopes are pending and denied by default.
         */
        post: operations["createMaterialDomain"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/material-domains/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * reviseMaterialDomain
         * @description Human-owned classification and project-space reference. Original material remains in its classification. References pin an existing material revision; they grant no Agent access or execution authority. Agent read scopes are pending and denied by default.
         */
        patch: operations["reviseMaterialDomain"];
        trace?: never;
    };
    "/materials/{id}/domains": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * setMaterialDomains
         * @description Human-owned classification and project-space reference. Original material remains in its classification. References pin an existing material revision; they grant no Agent access or execution authority. Agent read scopes are pending and denied by default.
         */
        put: operations["setMaterialDomains"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/project-spaces": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listProjectSpaces
         * @description Human-owned classification and project-space reference. Original material remains in its classification. References pin an existing material revision; they grant no Agent access or execution authority. Agent read scopes are pending and denied by default.
         */
        get: operations["listProjectSpaces"];
        put?: never;
        /**
         * createProjectSpace
         * @description Human-owned classification and project-space reference. Original material remains in its classification. References pin an existing material revision; they grant no Agent access or execution authority. Agent read scopes are pending and denied by default.
         */
        post: operations["createProjectSpace"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/project-spaces/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getProjectSpace
         * @description Human-owned classification and project-space reference. Original material remains in its classification. References pin an existing material revision; they grant no Agent access or execution authority. Agent read scopes are pending and denied by default.
         */
        get: operations["getProjectSpace"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/project-spaces/{id}/references": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * referenceMaterial
         * @description Human-owned classification and project-space reference. Original material remains in its classification. References pin an existing material revision; they grant no Agent access or execution authority. Agent read scopes are pending and denied by default.
         */
        post: operations["referenceMaterial"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/project-spaces/{id}/references/remove": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * removeMaterialReference
         * @description Human-owned classification and project-space reference. Original material remains in its classification. References pin an existing material revision; they grant no Agent access or execution authority. Agent read scopes are pending and denied by default.
         */
        post: operations["removeMaterialReference"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/distillations/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Queue automatic distillation from explicitly selected fixed source snapshots
         * @description Human-triggered durable processing. Only configured authorized source keys and real adapter provenance may be sent to the local Codex processor. Native read isolation is mandatory; unavailable processing remains explicit unsupported/failed. No source database or object paths are passed to the processor.
         */
        post: operations["requestDistillation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/attention-ranking-profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read explicit versioned candidate ranking profile
         * @description No configured profile means manual order; no default composite weights. Settings never grant data access or execution permission.
         */
        get: operations["getRankingProfile"];
        /**
         * Update human-owned candidate ranking weights
         * @description Human CAS+idempotent update. All weights positive; goal_progress is primary. Unknown candidate dimensions retain unknown; no delegation/approval rights are changed.
         */
        put: operations["updateRankingProfile"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/distillations/processor": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read actual processor availability and frozen configuration
         * @description Runtime facts only. Unconfigured or failed native isolation remains unavailable with required_action; no synthetic automatic capability.
         */
        get: operations["getDistillerStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/knowledge/{id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Confirm a KnowledgeEntry for workspace reference
         * @description Human gate that moves a KnowledgeEntry from inbox to confirmed so a Project Workspace may reference it. M0 returns 501; the assembled gate (W4 store) performs exactly one status transition and no model call.
         */
        post: operations["confirmKnowledge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/experiences/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approve a quarantined Experience
         * @description Human gate that moves an Experience from quarantine to approved so it becomes retrievable. M0 returns 501; the assembled gate (W5 store) performs exactly one status transition and no model call.
         */
        post: operations["approveExperience"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/conflicts/{id}/adjudications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Record the human decision on a pending Conflict
         * @description Human gate that records a decision on a pending Conflict. M0 returns 501; the assembled gate (W2 store) applies the decision value and never merges evidence automatically.
         */
        post: operations["adjudicateConflict"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/knowledge/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read project-scoped knowledge
         * @description Human-session cached read with persisted project visibility checks; never starts discovery.
         */
        get: operations["readEngineknowledge"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/knowledge/{id}/shares": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Human shares knowledge
         * @description Human-session command with CSRF, caller-scoped idempotency and version checks. Service implementation owns persisted mutation and audit.
         */
        post: operations["sharesEngineknowledge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/knowledge/{id}/demote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Human demote knowledge
         * @description Human-session command with CSRF, caller-scoped idempotency and version checks. Service implementation owns persisted mutation and audit.
         */
        post: operations["demoteEngineknowledge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/experiences/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read project-scoped experiences
         * @description Human-session cached read with persisted project visibility checks; never starts discovery.
         */
        get: operations["readEngineexperiences"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/experiences/{id}/shares": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Human shares experiences
         * @description Human-session command with CSRF, caller-scoped idempotency and version checks. Service implementation owns persisted mutation and audit.
         */
        post: operations["sharesEngineexperiences"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/experiences/{id}/demote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Human demote experiences
         * @description Human-session command with CSRF, caller-scoped idempotency and version checks. Service implementation owns persisted mutation and audit.
         */
        post: operations["demoteEngineexperiences"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/knowledge/{id}/references": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reference confirmed knowledge
         * @description Human-session command with CSRF, caller-scoped idempotency and version checks. Service implementation owns persisted mutation and audit.
         */
        post: operations["referenceEngineKnowledge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/works": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listWorks
         * @description Read the persisted Works album without filesystem access.
         */
        get: operations["listWorks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/works/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * refreshWorks
         * @description Scan only registered approved metadata roots; omitted roots use the cached registered roots. Supplied roots cannot extend that boundary.
         */
        post: operations["refreshWorks"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/works/delivery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * importWorksDelivery
         * @description Human-session Works command with CSRF, idempotency and independent metadata revision.
         */
        post: operations["importWorksDelivery"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/works/{work_id}/attitude": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * setWorkAttitude
         * @description Human-session Works command with CSRF, idempotency and independent metadata revision.
         */
        put: operations["setWorkAttitude"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/works/{work_id}/group": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * setWorkGroup
         * @description Human-session Works command with CSRF, idempotency and independent metadata revision.
         */
        put: operations["setWorkGroup"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/works/{work_id}/handoff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * setWorkHandoff
         * @description Human-session Works command with CSRF, idempotency and independent metadata revision.
         */
        put: operations["setWorkHandoff"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/works/{work_id}/hidden": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * setWorkHidden
         * @description Human-session Works command with CSRF, idempotency and independent metadata revision.
         */
        put: operations["setWorkHidden"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        SwaTaskSpecV1: components["schemas"]["taskSpec"];
        SwaRegisteredAgentV1: components["schemas"]["registeredAgent"];
        SwaAgentCapabilitiesV1: components["schemas"]["capabilities"];
        SwaAgentSelectionV1: components["schemas"]["agentSelection"];
        SwaNativeLaunchPolicyV1: components["schemas"]["nativeLaunchPolicy"];
        OpenVikingStatusV1: {
            /** @constant */
            schema_version: 1;
            configured: boolean;
            connected: boolean;
            base_url: string;
            root_uri: string;
            version: string;
            user: string;
            account: string;
            message: string;
        };
        OpenVikingSubmissionV1: {
            id: string;
            version: number;
            request_id: string;
            space_id: string;
            space_version: number;
            material_id: string;
            revision: number;
            locator: string;
            title: string;
            destination: string;
            base_url: string;
            account: string;
            user: string;
            actor_id: string;
            /** Format: date-time */
            approved_at: string;
            /** Format: date-time */
            updated_at: string;
            /** @enum {string} */
            status: "submitting" | "submitted" | "pending" | "running" | "cancelling" | "completed" | "failed" | "cancelled" | "unknown";
            stage: string;
            temp_file_id: string;
            task_id: string;
            root_uri: string;
            error: string;
            task_snapshot: {
                [key: string]: unknown;
            } | null;
        };
        OpenVikingSubmissionListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["OpenVikingSubmissionV1"][];
        };
        OpenVikingSubmissionResultV1: {
            /** @constant */
            schema_version: 1;
            submission: components["schemas"]["OpenVikingSubmissionV1"];
            task?: {
                [key: string]: unknown;
            } | null;
        };
        OpenVikingSubmitRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            /** @constant */
            expected_version: 0;
            expected_space_version: number;
            material_id: string;
            revision: number;
            destination: string;
            base_url: string;
            account: string;
            user: string;
        };
        OpenVikingHitV1: {
            uri: string;
            abstract: string;
            overview: string | null;
            /** @enum {integer} */
            level: 0 | 1 | 2;
            score: number;
            /** @constant */
            context_type: "resource";
        };
        CaptureCompletionExperienceRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            /** @constant */
            expected_version: 1;
            local_project_id: string;
            event_id: string;
        };
        CompletionArtifactReferenceV1: {
            id: string;
            version: number;
            commit?: string;
            object_refs: string[] | null;
            inputs: components["schemas"]["SourceRefV1"][] | null;
        };
        ExperienceCompletionEvidenceV1: {
            /** @enum {string} */
            source_kind: "swarm_artifact_accepted" | "relay_task_completed";
            event_id: string;
            version: number;
            occurred_at: number;
            local_project_id: string;
            owner_project: string;
            actor_id: string;
            /** @constant */
            actor_kind: "human";
            task_id: string;
            outcome: string;
            origin_event_ids: string[] | null;
            artifacts: components["schemas"]["CompletionArtifactReferenceV1"][] | null;
            /** @enum {string} */
            completion_channel?: "verified_complete" | "user_confirmed_complete";
            completion_receipt_id?: string;
        };
        SafeExperienceEvidenceV1: {
            /** @enum {string} */
            source_kind: "original_event" | "swarm_artifact_accepted" | "relay_task_completed";
            event_id: string;
            occurred_at: number;
            completion?: components["schemas"]["ExperienceCompletionEvidenceV1"];
        };
        ExperienceEvidenceResultV1: {
            /** @constant */
            schema_version: 1;
            evidence: components["schemas"]["SafeExperienceEvidenceV1"][];
        };
        AdmissionRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            expected_revision: number;
            /** @description An explicit project requires current permission; omitted or empty keeps the draft unassigned */
            project_id?: string;
        };
        RevokeAdmissionRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            reason: string;
        };
        OpportunityAdmissionV1: {
            id: string;
            version: number;
            opportunity_id: string;
            opportunity_revision: number;
            opportunity_version: number;
            project_id?: string;
            inputs: {
                kind: string;
                id: string;
                revision: number;
            }[];
            owner_id: string;
            owner_namespace: string;
            actor_id: string;
            /** @enum {string} */
            authority: "human" | "delegated_judgment";
            decision_id?: string;
            policy_version?: string;
            model?: string;
            model_version?: string;
            backend?: string;
            question_type?: string;
            purpose?: string;
            /** @enum {string} */
            status: "active" | "revoked";
            admitted_event_id: string;
            revoked_event_id?: string;
            reason?: string;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
        };
        AdmissionResultV1: {
            /** @constant */
            schema_version: 1;
            admission: components["schemas"]["OpportunityAdmissionV1"];
            draft?: {
                id: string;
                version: number;
            };
        };
        JudgmentEvidenceRefV1: {
            material_id: string;
            revision: number;
            digest: string;
        };
        JudgmentOptionV1: {
            id: string;
            description?: string;
            required_evidence?: components["schemas"]["JudgmentEvidenceRefV1"][] | null;
        };
        JudgmentQuestionV1: {
            question_id: string;
            /** @enum {string} */
            question_type: "choice" | "score" | "truth";
            instructions: string;
            options?: components["schemas"]["JudgmentOptionV1"][] | null;
            levels?: string[] | null;
            rule?: string;
        };
        JudgmentVersionsV1: {
            goal_version: string;
            taste_version: string;
            policy_version: string;
            model_revision: string;
            access_epoch: string;
        };
        JudgmentBudgetV1: {
            timeout_ms: number;
            max_input_bytes: number;
            max_input_tokens: number;
            max_output_tokens?: number;
        };
        JudgmentProfileReferenceV1: {
            id: string;
            version: number;
        };
        JudgmentSourceReferencesV1: {
            goal: {
                id: string;
                revision: number;
            };
            taste: components["schemas"]["JudgmentProfileReferenceV1"];
            ranking?: components["schemas"]["JudgmentProfileReferenceV1"];
        };
        JudgmentOpportunitySnapshotV1: {
            id: string;
            revision: number;
            version: number;
            state: string;
            title: string;
            next_step: string;
            goal_refs: string[] | null;
            missing_evidence: string[] | null;
            evidence: {
                reference: components["schemas"]["JudgmentEvidenceRefV1"];
                locator: string;
                span: string | null;
            }[] | null;
        };
        JudgmentDecisionContextV1: {
            purpose: string;
            rule_id: string;
            rule_version: number;
            workflow_id: string;
            owner_id: string;
            opportunity: components["schemas"]["JudgmentOpportunitySnapshotV1"];
        };
        JudgmentRequestV1: {
            /** @constant */
            schema_version: "1.0";
            project_id: string;
            worktree_id: string;
            snapshot_id: string;
            question: components["schemas"]["JudgmentQuestionV1"];
            evidence_refs?: components["schemas"]["JudgmentEvidenceRefV1"][] | null;
            language: string;
            /** @enum {string} */
            backend: "rule" | "jev" | "laya";
            external_scope?: string;
            versions: components["schemas"]["JudgmentVersionsV1"];
            budget: components["schemas"]["JudgmentBudgetV1"];
            /** @description Bound context is produced only by the actual delegation workflow */
            context?: null;
            sources?: components["schemas"]["JudgmentSourceReferencesV1"];
        };
        JudgmentOptionCoverageV1: {
            total: number;
            distinct: number;
            tokens_per_option: number;
        };
        JudgmentUsageV1: {
            input_tokens: number;
            output_tokens: number;
            state_tokens: number | null;
            state_tokens_dropped: number | null;
            truncated: boolean | null;
            truncated_questions: string[] | null;
            options: {
                [key: string]: components["schemas"]["JudgmentOptionCoverageV1"];
            } | null;
        };
        JudgmentResultV1: {
            /** @constant */
            schema_version: "1.0";
            decision_id: string;
            result_version: number;
            question_id: string;
            /** @enum {string} */
            question_type: "choice" | "score" | "truth";
            selected: string | null;
            value: number | null;
            distribution: {
                [key: string]: number;
            } | null;
            provider_confidence: number | null;
            /** @enum {string} */
            provider: "rule" | "jev" | "laya";
            provider_model: string | null;
            model_revision: string | null;
            input_digest: string;
            truncated: boolean;
            options: {
                [key: string]: components["schemas"]["JudgmentOptionCoverageV1"];
            } | null;
            usage: components["schemas"]["JudgmentUsageV1"] | null;
            /** @enum {string} */
            decision: "recommend" | "abstain" | "need_evidence";
            reason_code: string;
            versions: components["schemas"]["JudgmentVersionsV1"];
            evidence_refs: components["schemas"]["JudgmentEvidenceRefV1"][] | null;
            /** Format: date-time */
            created_at: string;
            cache_hit: boolean;
            context?: components["schemas"]["JudgmentDecisionContextV1"];
            sources?: components["schemas"]["JudgmentSourceReferencesV1"];
        };
        JudgmentPolicyV1: {
            revision: number;
            project_id: string;
            project_settings_revision: number;
            worktree_id: string;
            snapshot_id: string;
            snapshot_files: string[] | null;
            snapshot: components["schemas"]["JudgmentSnapshotV1"];
            /** @enum {string} */
            question_type: "choice" | "score" | "truth";
            versions: components["schemas"]["JudgmentVersionsV1"];
            /** @enum {string} */
            backend: "rule" | "jev" | "laya";
            languages: string[] | null;
            external_scope?: string;
            external_evidence?: components["schemas"]["JudgmentEvidenceRefV1"][] | null;
            budget: components["schemas"]["JudgmentBudgetV1"];
            min_confidence?: number | null;
            truth_accept_min?: number | null;
            truth_accept_max?: number | null;
            sources?: components["schemas"]["JudgmentSourceReferencesV1"];
            external_sources?: components["schemas"]["JudgmentSourceReferencesV1"];
        };
        JudgmentFeedbackRequestV1: {
            result_version: number;
            /** @enum {string} */
            kind: "adopt" | "later" | "reject" | "revise" | "already_solved";
            reason: string;
        };
        JudgmentFeedbackV1: {
            id: string;
            result_id: string;
            result_version: number;
            actor_id: string;
            actor_kind: string;
            kind: string;
            reason: string;
            /** Format: date-time */
            created_at: string;
        };
        JudgmentResultEnvelopeV1: {
            /** @constant */
            schema_version: 1;
            judgment: components["schemas"]["JudgmentResultV1"];
        };
        JudgmentPolicyResultV1: {
            /** @constant */
            schema_version: 1;
            policy: components["schemas"]["JudgmentPolicyV1"];
        };
        JudgmentSnapshotV1: {
            environment_id: string;
            repo_id: string;
            worktree_id: string;
            project_id: string;
            /** @constant */
            root: "";
            head: string;
            index_digest: string;
            worktree_digest: string;
            generation: string;
            /** Format: date-time */
            observed_at: string;
        };
        JudgmentSnapshotResultV1: {
            /** @constant */
            schema_version: 1;
            snapshot: components["schemas"]["JudgmentSnapshotV1"];
        };
        JudgmentFeedbackResultV1: {
            /** @constant */
            schema_version: 1;
            feedback: components["schemas"]["JudgmentFeedbackV1"];
        };
        JudgmentFeedbackListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["JudgmentFeedbackV1"][];
            next_cursor: string | null;
        };
        DelegationRuleV1: {
            id: string;
            project_id: string;
            workflow_id: string;
            owner_id: string;
            revision: number;
            state: string;
            purpose: string;
            question: components["schemas"]["JudgmentQuestionV1"];
            policy_revision: number;
            language: string;
            materials: components["schemas"]["JudgmentEvidenceRefV1"][] | null;
            admission_choice: string | null;
            admission_value_min: number | null;
            admission_value_max: number | null;
            allow_opportunity_external: boolean | null;
            review_conditions: string[] | null;
        };
        DelegationRuleResultV1: {
            /** @constant */
            schema_version: 1;
            delegation_rule: components["schemas"]["DelegationRuleV1"];
        };
        DelegationRuleListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["DelegationRuleV1"][];
            next_cursor: string | null;
        };
        DelegatedAdmissionResultV1: {
            /** @constant */
            schema_version: 1;
            admission: {
                admission_id: string;
                admission_version: number;
                proposal_id: string;
                proposal_version: number;
            };
        };
        TasteRubricV1: {
            id: string;
            /** @enum {string} */
            question_type: "choice" | "score" | "truth";
            criteria: string;
            options: {
                id: string;
                description: string;
            }[];
            levels: string[];
        };
        TasteExampleV1: {
            id: string;
            rubric_id: string;
            material_id: string;
            revision: number;
            content_digest: string;
            expected: string;
        };
        TasteDelegationV1: {
            rule_id: string;
            revision: number;
            workflow_id: string;
        };
        TasteProfileV1: {
            /** @constant */
            id: "attention";
            version: number;
            enabled: boolean;
            rubrics: components["schemas"]["TasteRubricV1"][];
            examples: components["schemas"]["TasteExampleV1"][];
            delegations: components["schemas"]["TasteDelegationV1"][];
            /** Format: date-time */
            created_at: string;
            configured_by: string;
        };
        TasteProfileResultV1: {
            /** @constant */
            schema_version: 1;
            configured: boolean;
            profile: components["schemas"]["TasteProfileV1"] | null;
        };
        UpdateTasteProfileRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            enabled: boolean;
            rubrics: components["schemas"]["TasteRubricV1"][];
            examples: components["schemas"]["TasteExampleV1"][];
            delegations: components["schemas"]["TasteDelegationV1"][];
        };
        SwarmMetaV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
        };
        SwarmCreateRequestV1: components["schemas"]["SwarmMetaV1"] & {
            grant_id: string;
            epoch: number;
            proposal_revision: number;
            project_id: string;
            root: string;
            /**
             * @description Reserved for the trusted event consumer; HTTP rejects nonempty values.
             * @constant
             */
            event_id?: "";
        };
        SwarmSourceVersionV1: {
            id: string;
            revision: string;
        };
        SwarmArtifactReferenceV1: {
            id: string;
            version: number;
            commit: string;
            object_ref: string;
        };
        SwarmResourcesV1: {
            calls: number;
            tokens: number;
            money: number | null;
            currency: string;
        };
        /** @description Actual usage quantities remain null when their evidence is unknown; known zero is preserved as zero. */
        SwarmUsageV1: {
            calls: number | null;
            tokens: number | null;
            money: number | null;
            currency: string;
        };
        SwarmBudgetV1: {
            calls: number | null;
            tokens: number | null;
            money: number | null;
            currency: string;
        };
        SwarmLimitsV1: {
            max_work_items: number;
            max_attempts: number;
            max_no_progress: number;
            no_progress_seconds: number;
            max_active: number;
            /** Format: date-time */
            deadline: string;
        };
        SwarmGrantV1: {
            inputs: components["schemas"]["SwarmSourceVersionV1"][] | null;
            id: string;
            epoch: number;
            proposal_id: string;
            proposal_revision: number;
            project_id: string;
            root: string;
            goal: string;
            actions: string[] | null;
            write_paths: string[] | null;
            budget: components["schemas"]["SwarmBudgetV1"];
            limits: components["schemas"]["SwarmLimitsV1"];
            /** Format: date-time */
            expires_at: string;
        };
        SwarmMissionV1: {
            settled_operations: number;
            id: string;
            version: number;
            grant: components["schemas"]["SwarmGrantV1"];
            state: string;
            reason: string;
            reserved: components["schemas"]["SwarmResourcesV1"];
            used: components["schemas"]["SwarmUsageV1"];
            work_item_count: number;
            no_progress: number;
            /** Format: date-time */
            last_progress_at: string;
            /** Format: date-time */
            created_at: string;
        };
        SwarmWorkItemRequestV1: components["schemas"]["SwarmMetaV1"] & {
            mission_id?: string;
            title: string;
            inputs: components["schemas"]["SwarmSourceVersionV1"][];
            dependencies?: string[];
            write_paths: string[];
            required_capabilities?: string[];
            artifact_inputs?: components["schemas"]["SwarmArtifactReferenceV1"][];
        };
        SwarmWorkItemV1: {
            created_by?: string;
            /** @enum {string} */
            creator_kind?: "human" | "agent" | "consumer";
            artifact_inputs: components["schemas"]["SwarmArtifactReferenceV1"][] | null;
            required_capabilities: string[] | null;
            id: string;
            mission_id: string;
            version: number;
            state: string;
            title: string;
            inputs: components["schemas"]["SwarmSourceVersionV1"][] | null;
            dependencies: string[] | null;
            write_paths: string[] | null;
            attempts: number;
            fence: number;
            artifact_id: string;
            reason: string;
        };
        SwarmTransitionRequestV1: components["schemas"]["SwarmMetaV1"] & {
            mission_id?: string;
            reason?: string;
        };
        SwarmClaimRequestV1: components["schemas"]["SwarmMetaV1"] & {
            mission_id: string;
            work_item_id?: string;
            binding_id: string;
            session_id: string;
            member_version: string;
            worktree: string;
            /** Format: uuid */
            operation_id: string;
            resources: components["schemas"]["SwarmResourcesV1"];
            /** Format: date-time */
            expires_at: string;
        };
        SwarmLeaseV1: {
            context_packet_id: string;
            binding_id: string;
            policy_version: string;
            work_item_id: string;
            mission_id: string;
            project_id: string;
            holder_id: string;
            fence: number;
            operation_id: string;
            session_id: string;
            member_version: string;
            worktree: string;
            base_commit: string;
            write_paths: string[] | null;
            reserved: components["schemas"]["SwarmResourcesV1"];
            /** Format: date-time */
            expires_at: string;
        };
        SwarmSubmitRequestV1: components["schemas"]["SwarmMetaV1"] & {
            mission_id: string;
            work_item_id?: string;
            fence: number;
            commit: string;
            object_ref: string;
            checks_ref: string;
            changed_paths: string[];
            inputs: components["schemas"]["SwarmSourceVersionV1"][];
            usage: components["schemas"]["SwarmUsageV1"];
        };
        SwarmAcceptRequestV1: components["schemas"]["SwarmMetaV1"] & {
            mission_id: string;
            artifact_id?: string;
        };
        SwarmRejectRequestV1: components["schemas"]["SwarmMetaV1"] & {
            mission_id: string;
            artifact_id?: string;
            reason: string;
        };
        SwarmStopRequestV1: components["schemas"]["SwarmTransitionRequestV1"] & {
            reason: string;
        };
        SwarmArtifactV1: {
            usage: components["schemas"]["SwarmUsageV1"] | null;
            accepted_actor_kind: string;
            execution_outcome: string;
            execution_failure_code: string;
            experience_status: string;
            context_packet_id: string;
            project_checks_ref: string;
            base_commit: string;
            review_reason: string;
            reviewed_by: string;
            /** Format: date-time */
            reviewed_at: string | null;
            id: string;
            version: number;
            work_item_id: string;
            operation_id: string;
            session_id: string;
            fence: number;
            inputs: components["schemas"]["SwarmSourceVersionV1"][] | null;
            commit: string;
            object_ref: string;
            checks_ref: string;
            changed_paths: string[] | null;
            state: string;
            acceptance_id: string;
            accepted_by: string;
            experience_id: string;
            /** Format: date-time */
            created_at: string;
        };
        SwarmTimelineEventV1: {
            event_id: string;
            type: string;
            aggregate_id: string;
            aggregate_version: number;
            /** Format: date-time */
            occurred_at: string;
        };
        SwarmToolEventV1: {
            event_id: string;
            type: string;
            tool: string;
            /** Format: date-time */
            occurred_at: string;
        };
        SwarmExecutionV1: {
            stop_reason?: string;
            stop_event?: components["schemas"]["SwarmTimelineEventV1"];
            reconciliation_reason?: string;
            holder_id?: string;
            exit_confirmed?: boolean;
            release_confirmed?: boolean;
            exit_event?: components["schemas"]["SwarmTimelineEventV1"];
            outcome?: string;
            reason?: string;
            operation_id: string;
            session_id: string;
            work_item_id: string;
            binding_id: string;
            fence: number;
            context_packet_id: string;
            policy_version: string;
            events: components["schemas"]["SwarmTimelineEventV1"][] | null;
            tool_events_status: string;
            tool_events: components["schemas"]["SwarmToolEventV1"][] | null;
        };
        SwarmDAGNodeV1: {
            work_item: components["schemas"]["SwarmWorkItemV1"];
            creation_event: components["schemas"]["SwarmTimelineEventV1"] | null;
        };
        SwarmDAGEdgeV1: {
            from: string;
            to: string;
            /** @constant */
            required: true;
            event_id: string;
        };
        SwarmWorkerObservationV1: {
            /** @enum {string} */
            state: "observed" | "exited" | "unverifiable";
            reason: string;
            source: string;
            /** Format: date-time */
            observed_at: string;
            exit_confirmed: boolean;
            /** Format: date-time */
            exit_observed_at: string | null;
            current_input: boolean | null;
        };
        SwarmDAGWorkerV1: {
            execution: components["schemas"]["SwarmExecutionV1"];
            /** @enum {string} */
            lease_state: "current" | "expired" | "retained" | "absent";
            observation: components["schemas"]["SwarmWorkerObservationV1"];
        };
        SwarmMissionDAGV1: {
            /** @constant */
            schema_version: 1;
            mission_id: string;
            mission_version: number;
            mission_state: string;
            reason: string;
            /** Format: date-time */
            observed_at: string;
            nodes: components["schemas"]["SwarmDAGNodeV1"][];
            edges: components["schemas"]["SwarmDAGEdgeV1"][];
            workers: components["schemas"]["SwarmDAGWorkerV1"][];
            events: components["schemas"]["SwarmTimelineEventV1"][];
        };
        SwarmMissionDetailV1: {
            /** @constant */
            schema_version: 1;
            max_active_executors: number;
            executions: components["schemas"]["SwarmExecutionV1"][] | null;
            mission: components["schemas"]["SwarmMissionV1"];
            work_items: components["schemas"]["SwarmWorkItemV1"][] | null;
            leases: components["schemas"]["SwarmLeaseV1"][] | null;
            artifacts: components["schemas"]["SwarmArtifactV1"][] | null;
            timeline: components["schemas"]["SwarmTimelineEventV1"][] | null;
        };
        SwarmMissionEnvelopeV1: {
            /** @constant */
            schema_version: 1;
            mission: components["schemas"]["SwarmMissionV1"];
        };
        SwarmWorkItemEnvelopeV1: {
            /** @constant */
            schema_version: 1;
            work_item: components["schemas"]["SwarmWorkItemV1"];
        };
        SwarmLeaseEnvelopeV1: {
            /** @constant */
            schema_version: 1;
            lease: components["schemas"]["SwarmLeaseV1"];
        };
        SwarmArtifactEnvelopeV1: {
            /** @constant */
            schema_version: 1;
            artifact: components["schemas"]["SwarmArtifactV1"];
        };
        SwarmMissionListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["SwarmMissionV1"][];
            next_cursor: string | null;
        };
        SwarmWorkItemListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["SwarmWorkItemV1"][];
            next_cursor: string | null;
        };
        SwarmTimelineListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["SwarmTimelineEventV1"][];
            next_cursor: string | null;
        };
        SwarmArtifactDiffV1: {
            /** @constant */
            schema_version: 1;
            artifact_id: string;
            commit: string;
            base_commit: string;
            diff: string;
        };
        /** @description Explicit project-relative path. The backend rejects absolute paths, parent traversal, redirects and unauthorized roots. */
        RepositoryRelativeRootV1: string;
        RepositoryBudgetV1: {
            max_files: number;
            max_bytes: number;
            max_results: number;
            max_depth: number;
        };
        RepositoryQueryRequestV1: {
            /** @constant */
            schema_version: 1;
            purpose: string;
            roots: components["schemas"]["RepositoryRelativeRootV1"][];
            budget: components["schemas"]["RepositoryBudgetV1"];
            query?: string;
            symbol_id?: string;
        };
        RepositorySearchRequestV1: components["schemas"]["RepositoryQueryRequestV1"] & {
            /** @description Nonblank search query; the backend also enforces at most 1024 UTF-8 bytes. */
            query: string;
        };
        RepositoryImpactRequestV1: components["schemas"]["RepositoryQueryRequestV1"] & {
            /** @description Nonblank symbol identity; the backend also enforces at most 512 UTF-8 bytes. */
            symbol_id: string;
        };
        RepositoryIndexRequestV1: {
            /** @constant */
            schema_version: 1;
            purpose: string;
            roots: components["schemas"]["RepositoryRelativeRootV1"][];
            budget: components["schemas"]["RepositoryBudgetV1"];
            query?: string;
            symbol_id?: string;
            /** @enum {string} */
            action: "index" | "sync" | "rebuild";
        };
        RepositoryVersionV1: {
            environment_id: string;
            repo_id: string;
            worktree_id: string;
            project_id: string;
            head: string;
            index_digest: string;
            worktree_digest: string;
            settings_revision: number;
            roots: string[] | null;
            dirty: boolean;
            /** Format: date-time */
            observed_at: string;
        };
        RepositorySpanV1: {
            path: string;
            start_line: number;
            end_line: number;
        };
        RepositorySymbolV1: {
            id: string;
            name: string;
            kind: string;
            source_span: components["schemas"]["RepositorySpanV1"];
            score: number;
        };
        RepositoryRelationV1: {
            source: string;
            target: string;
            kind: string;
            evidence_kind: string;
            source_span: components["schemas"]["RepositorySpanV1"];
            extractor_version: string;
        };
        RepositoryMapEntryV1: {
            path: string;
            responsibility: string;
            relationships: string;
            api: string;
            constraints: string;
            evidence_kind: string;
        };
        RepositoryIndexV1: {
            backend: string;
            version: string;
            generation: string;
            snapshot: components["schemas"]["RepositoryVersionV1"];
            state: string;
            /** Format: date-time */
            built_at: string;
            map_entries?: components["schemas"]["RepositoryMapEntryV1"][];
        };
        RepositoryResultV1: {
            index: components["schemas"]["RepositoryIndexV1"];
            symbols: components["schemas"]["RepositorySymbolV1"][] | null;
            relations: components["schemas"]["RepositoryRelationV1"][] | null;
            coverage: string[] | null;
            gaps: string[] | null;
            map_entries?: components["schemas"]["RepositoryMapEntryV1"][];
        };
        RepositoryResultEnvelopeV1: {
            /** @constant */
            schema_version: 1;
            repository_context: components["schemas"]["RepositoryResultV1"];
        };
        RepositoryIndexEnvelopeV1: {
            /** @constant */
            schema_version: 1;
            repository_context: components["schemas"]["RepositoryIndexV1"];
        };
        S2GoalListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["S2GoalV1"][];
            next_cursor: null;
        };
        RelaySessionCoverageV1: {
            /**
             * @description archive counts complete JSONL lines and byte extents; native_notifications counts public app-server notifications, with zero byte counters. Session completeness is bounded to the selected source protocol; internal events not exposed by it are outside that claim.
             * @enum {string}
             */
            source?: "unknown" | "archive" | "native_notifications";
            /** Format: uuid */
            task_id: string;
            /** Format: uuid */
            terminal_id: string;
            /** Format: uuid */
            worktree_id: string;
            project_id: string;
            /** @enum {string} */
            status: "unknown" | "partial" | "complete";
            gap: string;
            lines: number;
            projected: number;
            duplicates: number;
            unknown: number;
            errors: number;
            unknown_tokens: number;
            remaining_bytes: number;
            tail_bytes: number;
            snapshot_complete: boolean;
            session_complete: boolean;
        };
        /**
         * @example {
         *       "events": [
         *         {
         *           "event_id": "ae6c15f2-394b-402c-9f53-b75fc2cd0783",
         *           "kind": "edit_file",
         *           "topic": "relay:cf1497b0-e092-43c0-80a9-33449bb57a40",
         *           "tokens": null,
         *           "scope": "public-project",
         *           "ts": "2026-10-14T01:00:01Z"
         *         }
         *       ],
         *       "coverage": [
         *         {
         *           "task_id": "cf1497b0-e092-43c0-80a9-33449bb57a40",
         *           "terminal_id": "c48d6c05-3b58-4bdc-8a7b-46a471612a0b",
         *           "worktree_id": "0623c675-ddb7-4d62-bd02-831f6cb6d51d",
         *           "project_id": "public-project",
         *           "status": "partial",
         *           "gap": "prefix_unverified",
         *           "lines": 2,
         *           "projected": 2,
         *           "duplicates": 0,
         *           "unknown": 0,
         *           "errors": 0,
         *           "unknown_tokens": 2,
         *           "remaining_bytes": 0,
         *           "tail_bytes": 0,
         *           "snapshot_complete": true,
         *           "session_complete": false
         *         }
         *       ],
         *       "total": 1,
         *       "page": 1,
         *       "page_size": 50
         *     }
         */
        RelaySessionEventsV1: {
            events: components["schemas"]["WorkbenchEventV1"][];
            coverage: components["schemas"]["RelaySessionCoverageV1"][];
            total: number;
            page: number;
            page_size: number;
        };
        RelayProjectV1: {
            project_id: string;
            name: string;
            root: string;
            /** @enum {string} */
            permission_level: "A" | "B" | "C";
            project_settings_revision: number;
            allowed_subdirs: string[];
            allowed_actions: string[];
            allow_agent_control: boolean;
            allow_directory: boolean;
            expand_references: boolean;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "projects": []
         *     }
         */
        RelayProjectsV1: {
            /** @constant */
            schema_version: 1;
            projects: components["schemas"]["RelayProjectV1"][];
        };
        /**
         * @example {
         *       "name": "fixture-cli",
         *       "launch_cmd": [
         *         "fixture-cli"
         *       ],
         *       "capabilities": {},
         *       "drive_mode": "terminal"
         *     }
         * @example {
         *       "name": "fixture-cli",
         *       "launch_cmd": [
         *         "fixture-cli"
         *       ],
         *       "capabilities": {},
         *       "drive_mode": "terminal",
         *       "input_mode": "stdin_eof"
         *     }
         */
        RelayAgentV1: {
            name: string;
            launch_cmd: string[];
            capabilities: {
                [key: string]: components["schemas"]["NativeCapabilityObservationV1"];
            };
            /** @enum {string} */
            drive_mode: "structured" | "terminal" | "both";
            /**
             * @description Optional trusted registration input framing. Omitted means existing line mode. stdin_eof closes stdin after the full first input and does not support later Send. This field does not authorize launch or prove native CLI compatibility.
             * @enum {string}
             */
            input_mode?: "line" | "stdin_eof";
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "agents": [],
         *       "inventory": []
         *     }
         */
        RelayAgentsV1: {
            /** @constant */
            schema_version: 1;
            agents: components["schemas"]["RelayAgentV1"][];
            inventory: components["schemas"]["LocalAgentV1"][];
        };
        RelayTaskV1: {
            task_id: string;
            work_id: string;
            project_id: string;
            worktree_id: string;
            terminal_id: string;
            agent: string;
            description: string;
            /** @enum {string} */
            state: "ready" | "accepted" | "working" | "done" | "released";
            condition: string;
            /** @enum {string} */
            permission_level: "A" | "B" | "C";
            project_settings_revision: number;
            degraded_launch: boolean;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
        };
        RelayTerminalV1: {
            terminal_id: string;
            worktree_id: string;
            agent: string;
            /** @enum {string} */
            drive_mode: "structured" | "terminal" | "both";
            /** @enum {string} */
            liveness: "live" | "unverifiable" | "exited";
            /** Format: date-time */
            last_event_at: string | null;
            /** Format: date-time */
            exited_at: string | null;
            last_sequence: number;
            /** Format: date-time */
            created_at: string;
        };
        RelayWorkspaceV1: {
            worktree_id: string;
            project_id: string;
            root: string;
            branch: string;
            prepared: boolean;
            active_task_id: string;
            /** Format: date-time */
            created_at: string;
        };
        RelayTransitionV1: {
            task_id: string;
            /** @enum {string} */
            from: "" | "ready" | "accepted" | "working" | "done";
            /** @enum {string} */
            to: "ready" | "accepted" | "working" | "done" | "released";
            /** Format: date-time */
            ts: string;
            operator: string;
        };
        RelayTaskViewV1: {
            task: components["schemas"]["RelayTaskV1"];
            terminal: components["schemas"]["RelayTerminalV1"] | null;
            worktree: components["schemas"]["RelayWorkspaceV1"] | null;
            transitions: components["schemas"]["RelayTransitionV1"][];
            completion?: components["schemas"]["RelayCompletionV1"];
            event_publication: {
                /** @enum {string} */
                status: "none" | "pending" | "published" | "error";
                pending_events: number;
                published_events: number;
            };
        };
        /** @description Saved completion channel and original human action. Missing on old records means unrecorded. Completion never supplies started evidence or releases resources; release is audited separately. */
        RelayCompletionV1: {
            /** Format: uuid */
            completion_id: string;
            /** Format: uuid */
            task_id: string;
            /** Format: uuid */
            worktree_id: string;
            /** Format: uuid */
            terminal_id: string;
            /** @enum {string} */
            channel: "verified_complete" | "user_confirmed_complete";
            /** @enum {string} */
            source: "human_confirmation" | "owned_output_and_goal_checks";
            operator: string;
            actor_id: string;
            /** @constant */
            actor_kind: "human";
            receipt_id: string;
            /** Format: uuid */
            operation_id: string;
            /** Format: date-time */
            ts: string;
            evidence_id?: string;
            /** Format: uuid */
            input_operation_id?: string;
            output_event_ids?: string[];
            check_evidence_ids?: string[];
            /** Format: date-time */
            verified_at?: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "tasks": [],
         *       "dispatched_work_ids": []
         *     }
         */
        RelayTasksV1: {
            /** @constant */
            schema_version: 1;
            tasks: components["schemas"]["RelayTaskViewV1"][];
            dispatched_work_ids: string[];
        };
        RelayTaskResultV1: {
            /** @constant */
            schema_version: 1;
            view: components["schemas"]["RelayTaskViewV1"];
        };
        RelayReceiptErrorV1: {
            /** @enum {string} */
            code: "validation_failed" | "unsupported_capability" | "version_conflict" | "context_stale" | "index_stale" | "scope_denied" | "approval_required" | "approval_revoked" | "lease_lost" | "budget_exhausted" | "provider_unavailable" | "evidence_missing" | "delivery_unknown" | "not_found" | "internal_error";
            message: string;
            request_id: string;
            retryable: boolean;
            required_action: string;
        };
        RelayReceiptV1: {
            receipt_id: string;
            task_id: string;
            /** Format: uuid */
            operation_id: string;
            /** @enum {string} */
            action: "intent" | "prepare" | "dispatch" | "send" | "read" | "stop" | "resume" | "transition" | "observe" | "reconcile_events";
            operator: string;
            /** @enum {string} */
            status: "pending" | "accepted" | "rejected" | "delivery_unknown";
            error: components["schemas"]["RelayReceiptErrorV1"] | null;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            finished_at: string | null;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "receipts": []
         *     }
         */
        RelayReceiptsV1: {
            /** @constant */
            schema_version: 1;
            receipts: components["schemas"]["RelayReceiptV1"][];
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "events": [
         *         {
         *           "event_id": "fixture-relay-event",
         *           "kind": "edit_file",
         *           "topic": "fixture-work",
         *           "tokens": null,
         *           "scope": "fixture-project",
         *           "ts": "2026-10-14T00:00:00Z"
         *         }
         *       ]
         *     }
         */
        RelayEventsV1: {
            /** @constant */
            schema_version: 1;
            events: components["schemas"]["WorkbenchEventV1"][];
        };
        RelayIntentRequestV1: {
            work_id: string;
            project_id: string;
            agent: string;
            task: string;
            /**
             * Format: uuid
             * @description Explicit prior released task in the same Work and original workspace. Requires handoff_context_confirmed=true and a different Agent. This declaration does not prove a new native session.
             */
            handoff_from_task_id?: string;
            /** @description Human confirmation of prior task context. Omitted or false retains ordinary intent semantics when no source task is specified. */
            handoff_context_confirmed?: boolean;
        };
        RelayRuntimeFactV1: {
            /** Format: uuid */
            fact_id: string;
            /** Format: uuid */
            task_id: string;
            /** Format: uuid */
            terminal_id?: string;
            /** Format: uuid */
            worktree_id?: string;
            /** @description Original immutable business receipt identity; not a UUID. Matches a readable receipt of this task. */
            receipt_id?: string;
            /** Format: uuid */
            operation_id?: string;
            /** @enum {string} */
            kind: "action_claimed" | "action_result" | "observation_rejected" | "handoff_declared" | "human_target_confirmed" | "resources_released" | "controller_initialized" | "session_confirmed" | "input_channel_open" | "input_written" | "input_closed" | "input_accepted" | "turn_started" | "input_consumption" | "input_result";
            /** @enum {string} */
            status: "confirmed" | "unknown" | "pending" | "accepted" | "rejected" | "delivery_unknown";
            /** @enum {string} */
            source: "relay_store" | "human_intent" | "human_transition" | "codex_initialize" | "codex_thread_identity" | "claude_initialize" | "claude_system_init" | "pi_get_state" | "native_request_pipe" | "codex_turn_acknowledgement" | "pi_prompt_acknowledgement" | "codex_turn_started" | "codex_turn_completed" | "pi_agent_start" | "claude_stream_input" | "native_protocol" | "owned_stdin_pipe" | "stdin_pipe" | "stdin_eof";
            /** @enum {string} */
            reason?: "client_consumption_not_acknowledged" | "operation_not_bound" | "controller_evidence_rejected" | "verified_complete" | "user_confirmed_complete" | "completed" | "failed" | "interrupted" | "not_found" | "validation_failed" | "unsupported_capability" | "version_conflict" | "context_stale" | "index_stale" | "scope_denied" | "approval_required" | "approval_revoked" | "lease_lost" | "budget_exhausted" | "provider_unavailable" | "evidence_missing" | "delivery_unknown" | "internal_error";
            sequence: number;
            /** Format: date-time */
            ts: string;
        };
        RelaySessionRelationV1: {
            /** Format: uuid */
            task_id: string;
            /** Format: uuid */
            previous_task_id?: string;
            /** Format: uuid */
            worktree_id?: string;
            /** Format: uuid */
            terminal_id?: string;
            /** Format: uuid */
            operation_id: string;
            /** @enum {string} */
            kind: "new" | "resume" | "handoff" | "unknown";
            /** @enum {string} */
            status: "confirmed" | "unknown";
            /** @enum {string} */
            source: "human_intent" | "controller_session";
            /** Format: date-time */
            ts: string;
        };
        RelayFactsV1: {
            /** @constant */
            schema_version: 1;
            /** Format: uuid */
            task_id: string;
            facts: components["schemas"]["RelayRuntimeFactV1"][];
            session_relations: components["schemas"]["RelaySessionRelationV1"][];
            /** @description Ownership comes only from the original controller object retained by this service, independently of historical facts and liveness. GET performs no RPC or activity refresh. A cold registry returns unknown. */
            current_ownership: {
                /** @enum {string} */
                status: "confirmed" | "unknown";
                /**
                 * @description controller_exited with confirmed only means the original exited controller object remains held; it does not authorize RPC Read or Send.
                 * @enum {string}
                 */
                reason?: "controller_binding_unrecorded" | "workspace_identity_unverified" | "controller_metadata_unsupported" | "controller_not_held" | "controller_exited";
            };
        };
        /**
         * @example {
         *       "permission_confirmed": true,
         *       "permission_level": "A",
         *       "project_settings_revision": 0
         *     }
         */
        RelayConfirmRequestV1: {
            /** @constant */
            permission_confirmed: true;
            /** @enum {string} */
            permission_level: "A" | "B" | "C";
            project_settings_revision: number;
        };
        /**
         * @example {
         *       "input": "Fixture human input"
         *     }
         */
        RelaySendRequestV1: {
            input: string;
        };
        /** @example {} */
        RelayEmptyRequestV1: Record<string, never>;
        /**
         * @description Current permission and explicit human confirmation allow accepted or working to enter done. Omitted channel selects user_confirmed_complete. verified_complete additionally requires a trusted reference to this task's owned output and actual fixed-goal checks; it never creates started evidence. Resource release remains a separate done-to-released action.
         * @example {
         *       "from": "accepted",
         *       "to": "done",
         *       "completion_confirmed": true,
         *       "completion_channel": "user_confirmed_complete"
         *     }
         */
        RelayTransitionRequestV1: {
            /** @enum {string} */
            from: "ready" | "accepted" | "working" | "done";
            /** @enum {string} */
            to: "accepted" | "working" | "done" | "released";
            completion_confirmed: boolean;
            /** @enum {string} */
            completion_channel?: "verified_complete" | "user_confirmed_complete";
            /** @description Required only for verified_complete; a safe reference, never raw checks, paths or native identities. */
            completion_evidence_id?: string;
        };
        RelayActionResultV1: {
            /** @constant */
            schema_version: 1;
            view: components["schemas"]["RelayTaskViewV1"];
            receipt: components["schemas"]["RelayReceiptV1"];
        };
        /**
         * @example {
         *       "event_id": "fixture-event",
         *       "kind": "agent_task",
         *       "topic": "fixture-topic",
         *       "tokens": null,
         *       "scope": "fixture-scope",
         *       "ts": "2026-10-12T16:00:00Z"
         *     }
         */
        WorkbenchEventV1: {
            event_id: string;
            kind: string;
            topic: string;
            tokens: number | null;
            scope: string;
            /** Format: date-time */
            ts: string;
        };
        WorkbenchTopicV1: {
            topic: string;
            attention: number;
            momentum: number;
            confidence: number;
        };
        WorkbenchCardV1: {
            topic: string;
            attention: number;
            momentum: number;
            confidence: number;
            attention_delta: number | null;
        };
        /**
         * @example {
         *       "status": "ok",
         *       "snapshot_at": "2026-10-13T08:00:00Z",
         *       "timezone": "Asia/Shanghai"
         *     }
         */
        WorkbenchHealthV1: {
            /** @constant */
            status: "ok";
            /** Format: date-time */
            snapshot_at: string;
            /** @constant */
            timezone: "Asia/Shanghai";
        };
        WorkbenchTodayV1: {
            /** Format: date */
            day: string;
            focus: components["schemas"]["WorkbenchCardV1"][];
            activity: components["schemas"]["WorkbenchEventV1"][];
            sleep: {
                /** Format: date */
                day: string;
                /** @enum {string} */
                status: "not_produced" | "running" | "completed";
                /** Format: date-time */
                completed_at: string | null;
            };
            daily_counts: {
                /** Format: date */
                day: string;
                count: number;
            }[];
            sources: {
                source: string;
                count: number;
            }[];
        };
        WorkbenchFocusV1: {
            topics: components["schemas"]["WorkbenchTopicV1"][];
            series: {
                topic: string;
                points: {
                    /** Format: date-time */
                    ts: string;
                    attention: number;
                }[];
            }[];
        };
        WorkbenchAgentsV1: {
            groups: {
                source: string;
                today: number;
                days7: number;
                days30: number;
                recent: components["schemas"]["WorkbenchEventV1"][];
            }[];
        };
        WorkbenchEventsV1: {
            events: components["schemas"]["WorkbenchEventV1"][];
            total: number;
            page: number;
            page_size: number;
        };
        WorkbenchEvidenceV1: {
            topic: string;
            aggregates: {
                /** Format: date */
                day: string;
                kind: string;
                count: number;
            }[];
            events: components["schemas"]["WorkbenchEventV1"][];
            total: number;
            page: number;
            page_size: number;
        };
        WorkbenchFiltersV1: {
            topics: string[];
            kinds: string[];
            sources: string[];
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "error": {
         *         "code": "unsupported_capability",
         *         "message": "Not implemented in S0",
         *         "request_id": "example-request",
         *         "retryable": false,
         *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
         *       }
         *     }
         */
        ErrorV1: {
            /** @constant */
            schema_version: 1;
            error: {
                /** @enum {string} */
                code: "validation_failed" | "unsupported_capability" | "version_conflict" | "context_stale" | "index_stale" | "scope_denied" | "approval_required" | "approval_revoked" | "lease_lost" | "budget_exhausted" | "provider_unavailable" | "evidence_missing" | "delivery_unknown" | "not_found" | "internal_error";
                message: string;
                request_id: string;
                retryable: boolean;
                required_action: string;
            };
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "status": "ok",
         *       "service": "astrocyte"
         *     }
         */
        HealthV1: {
            /** @constant */
            schema_version: 1;
            /** @enum {string} */
            status: "ok";
            /** @enum {string} */
            service: "astrocyte";
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "stage": "S0",
         *       "capabilities": {
         *         "imports": false,
         *         "approvals": false,
         *         "execution": false,
         *         "native_resume": false,
         *         "handoff": false
         *       },
         *       "storage": {
         *         "engine": "sqlite",
         *         "schema_version": 1
         *       },
         *       "fixture": false
         *     }
         * @example {
         *       "schema_version": 1,
         *       "stage": "S1",
         *       "capabilities": {
         *         "imports": true,
         *         "approvals": false,
         *         "execution": false,
         *         "native_resume": false,
         *         "handoff": false
         *       },
         *       "storage": {
         *         "engine": "sqlite",
         *         "schema_version": 5
         *       },
         *       "fixture": false
         *     }
         */
        FoundationV1: {
            /** @constant */
            schema_version: 1;
            /** @enum {string} */
            stage: "S0" | "S1";
            /** @description Availability of assembled HTTP operations, not evidence about installed local agent native abilities or completion of S1 acceptance. */
            capabilities: {
                /** @description True when the S1 material import service is assembled. */
                imports: boolean;
                /** @constant */
                approvals: false;
                /** @constant */
                execution: false;
                /** @constant */
                native_resume: false;
                /** @constant */
                handoff: false;
            };
            storage: {
                /** @enum {string} */
                engine: "sqlite";
                schema_version: number;
            };
            /** @constant */
            fixture: false;
        };
        /**
         * @description Independent readiness observation; no credential inspection is implied.
         * @example {
         *       "status": "unknown",
         *       "reason": "configuration_not_inspected",
         *       "checked_at": null
         *     }
         */
        AgentObservationV1: {
            /** @enum {string} */
            status: "available" | "unavailable" | "unknown" | "unsupported";
            reason: string;
            /** Format: date-time */
            checked_at: string | null;
        };
        /**
         * @description SPEC 8.1 native capability; CLI help or installation is insufficient evidence of support.
         * @example {
         *       "status": "unknown",
         *       "reason": "native_runtime_not_tested",
         *       "checked_at": null
         *     }
         */
        NativeCapabilityObservationV1: {
            /** @enum {string} */
            status: "supported" | "unsupported" | "unknown";
            reason: string;
            /** Format: date-time */
            checked_at: string | null;
        };
        /**
         * @description CLI installation identity, independent of any private native session, project or Mission.
         * @example {
         *       "id": "example-cli",
         *       "display_name": "Example CLI (schema example only)",
         *       "version": null,
         *       "installed": {
         *         "status": "unknown",
         *         "reason": "cli_not_probed",
         *         "checked_at": null
         *       },
         *       "configured": {
         *         "status": "unknown",
         *         "reason": "configuration_not_inspected",
         *         "checked_at": null
         *       },
         *       "startable": {
         *         "status": "unknown",
         *         "reason": "native_runtime_not_tested",
         *         "checked_at": null
         *       },
         *       "capabilities": {
         *         "discover": {
         *           "status": "unknown",
         *           "reason": "native_runtime_not_tested",
         *           "checked_at": null
         *         },
         *         "read_context": {
         *           "status": "unknown",
         *           "reason": "native_runtime_not_tested",
         *           "checked_at": null
         *         },
         *         "start": {
         *           "status": "unknown",
         *           "reason": "native_runtime_not_tested",
         *           "checked_at": null
         *         },
         *         "resume": {
         *           "status": "unknown",
         *           "reason": "native_runtime_not_tested",
         *           "checked_at": null
         *         },
         *         "send": {
         *           "status": "unknown",
         *           "reason": "native_runtime_not_tested",
         *           "checked_at": null
         *         },
         *         "stop": {
         *           "status": "unknown",
         *           "reason": "native_runtime_not_tested",
         *           "checked_at": null
         *         },
         *         "observe": {
         *           "status": "unknown",
         *           "reason": "native_runtime_not_tested",
         *           "checked_at": null
         *         },
         *         "reconcile": {
         *           "status": "unknown",
         *           "reason": "native_runtime_not_tested",
         *           "checked_at": null
         *         }
         *       }
         *     }
         */
        LocalAgentV1: {
            /** @description Stable CLI adapter identity, not executable path or session ID. */
            id: string;
            display_name: string;
            /** @description Observed version only; null if not observed. */
            version: string | null;
            installed: components["schemas"]["AgentObservationV1"];
            configured: components["schemas"]["AgentObservationV1"];
            startable: components["schemas"]["AgentObservationV1"];
            capabilities: {
                discover: components["schemas"]["NativeCapabilityObservationV1"];
                read_context: components["schemas"]["NativeCapabilityObservationV1"];
                start: components["schemas"]["NativeCapabilityObservationV1"];
                resume: components["schemas"]["NativeCapabilityObservationV1"];
                send: components["schemas"]["NativeCapabilityObservationV1"];
                stop: components["schemas"]["NativeCapabilityObservationV1"];
                observe: components["schemas"]["NativeCapabilityObservationV1"];
                reconcile: components["schemas"]["NativeCapabilityObservationV1"];
            };
            /** @description Backend registry implements this CLI protocol. This is independent of installed/configured/startable and every observed native capability; a human may request explicit verification. */
            native_adapter_registered?: boolean;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "items": [],
         *       "next_cursor": null
         *     }
         */
        LocalAgentListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["LocalAgentV1"][];
            next_cursor: string | null;
        };
        /**
         * @example {
         *       "material_id": "fixture-material",
         *       "revision": 1,
         *       "locator": "arxiv:fixture",
         *       "span": null
         *     }
         */
        SourceRefV1: {
            material_id: string;
            revision: number;
            locator: string;
            span?: string | null;
        };
        /**
         * @example {
         *       "value": null,
         *       "reason": "unknown"
         *     }
         */
        DimensionScoreV1: {
            value: number | null;
            reason: string;
        };
        /**
         * @example {
         *       "goal_progress": {
         *         "value": null,
         *         "reason": "unknown"
         *       },
         *       "current_interest": {
         *         "value": null,
         *         "reason": "unknown"
         *       },
         *       "project_improvement": {
         *         "value": null,
         *         "reason": "unknown"
         *       },
         *       "originality": {
         *         "value": null,
         *         "reason": "unknown"
         *       }
         *     }
         */
        DimensionsV1: {
            goal_progress: components["schemas"]["DimensionScoreV1"];
            current_interest: components["schemas"]["DimensionScoreV1"];
            project_improvement: components["schemas"]["DimensionScoreV1"];
            originality: components["schemas"]["DimensionScoreV1"];
        };
        /**
         * @example {
         *       "id": "fixture-material",
         *       "source_locator": "arxiv:fixture",
         *       "kind": "paper",
         *       "current_revision": 1,
         *       "lifecycle": "active",
         *       "title": "Fixture only",
         *       "collection_reason": null
         *     }
         */
        MaterialV1: {
            id: string;
            source_locator: string;
            /** @enum {string} */
            kind: "paper" | "video" | "text" | "file";
            current_revision: number;
            /** @enum {string} */
            lifecycle: "active" | "archived" | "withdrawn";
            title?: string;
            collection_reason?: string | null;
            source_spans?: string[];
            /** @enum {string} */
            import_status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
            human_usage_count?: number;
            agent_usage_count?: number;
            attention_score?: number;
            long_term_value?: number;
            /** Format: date-time */
            created_at?: string;
            version?: number;
            pinned?: boolean;
            domain_ids?: string[];
            ranking_strategy?: string;
            ranking_reason?: string;
            attention_half_life_seconds?: number;
            attention_weights?: {
                [key: string]: number;
            };
        };
        /**
         * @example {
         *       "id": "fixture-opportunity",
         *       "revision": 1,
         *       "state": "incubating",
         *       "evidence_refs": [],
         *       "dimensions": {
         *         "goal_progress": {
         *           "value": null,
         *           "reason": "unknown"
         *         },
         *         "current_interest": {
         *           "value": null,
         *           "reason": "unknown"
         *         },
         *         "project_improvement": {
         *           "value": null,
         *           "reason": "unknown"
         *         },
         *         "originality": {
         *           "value": null,
         *           "reason": "unknown"
         *         }
         *       },
         *       "next_step": "Select a real case"
         *     }
         */
        OpportunityV1: {
            id: string;
            revision: number;
            /** @enum {string} */
            state: "incubating" | "ready_for_review" | "admitted" | "deferred" | "rejected" | "withdrawn";
            title?: string;
            evidence_refs: components["schemas"]["SourceRefV1"][];
            goal_refs?: string[];
            dimensions: components["schemas"]["DimensionsV1"];
            next_step: string;
            missing_evidence?: string[];
            purpose?: string;
            distillation_ids?: string[];
            /** Format: date-time */
            created_at?: string;
            version?: number;
            composite_score?: number | null;
            ranking_strategy?: string;
            ranking_reason?: string;
            ranking_profile_version?: number | null;
        };
        /**
         * @example {
         *       "id": "fixture-project",
         *       "name": "Fixture only",
         *       "environment_id": "fixture",
         *       "root_path": "/fixture"
         *     }
         */
        ProjectV1: {
            id: string;
            name: string;
            environment_id: string;
            root_path: string;
            repo_id?: string | null;
            worktree_id?: string | null;
        };
        /**
         * @example {
         *       "calls": null,
         *       "tokens": null,
         *       "money": null,
         *       "currency": null
         *     }
         */
        BudgetV1: {
            calls: number | null;
            tokens: number | null;
            money: number | null;
            currency: string | null;
        };
        /**
         * @example {
         *       "project_ids": [],
         *       "allowed_roots": [],
         *       "allowed_actions": [],
         *       "data_egress_rules": []
         *     }
         */
        ScopeV1: {
            project_ids: string[];
            allowed_roots: string[];
            allowed_actions: string[];
            data_egress_rules: string[];
        };
        ProposalV1: {
            id: string;
            revision: number;
            version: number;
            content: components["schemas"]["S2ProposalContentV1"];
            grant_id?: string;
            admission_id?: string;
            opportunity_id?: string;
            opportunity_revision?: number;
            /** @description Trusted admission owner namespace; optional for existing ordinary drafts. */
            owner_namespace?: string;
            /**
             * @description Empty is an unrecorded legacy assignment. Unassigned admission drafts need a human revision selecting a real project and Goal before approval.
             * @enum {string}
             */
            assignment_status?: "" | "assigned" | "unassigned";
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
            /** @enum {string} */
            status: "draft" | "in_review" | "approved" | "declined" | "superseded";
        };
        S2ContextNotesV1: {
            decisions?: string[] | null;
            results?: string[] | null;
            checks?: string[] | null;
            failures?: string[] | null;
            open_questions?: string[] | null;
            next_steps?: string[] | null;
        };
        S2ContextPacketRequestV1: components["schemas"]["SwarmMetaV1"] & components["schemas"]["S2ContextNotesV1"] & {
            /** @constant */
            expected_version?: 0;
            grant_id: string;
            grant_epoch: number;
            predecessor_id?: string;
            max_bytes: number;
        };
        S2ProjectContextSnapshotV1: {
            environment_id: string;
            repo_id: string;
            worktree_id: string;
            project_id: string;
            head: string;
            index_digest: string;
            worktree_digest: string;
            generation: string;
            /** Format: date-time */
            observed_at: string;
        };
        S2PacketSourceV1: {
            reference: components["schemas"]["FixedReferenceV1"];
            object_ref: string;
            title: string;
            locations: string[] | null;
        };
        S2ContextPacketScopeV1: components["schemas"]["S2ExecutionScopeV1"] & {
            /** @description Project relative roots derived from the fixed private snapshot; absolute source paths remain local. */
            roots?: string[];
        };
        S2ContextPacketV1: components["schemas"]["S2ContextNotesV1"] & {
            id: string;
            /** @constant */
            schema_version: 1;
            project_id: string;
            project_settings_revision: number;
            predecessor_id?: string;
            grant_id: string;
            grant_epoch: number;
            proposal_id: string;
            proposal_revision: number;
            goal: components["schemas"]["S2GoalV1"];
            snapshot: components["schemas"]["S2ProjectContextSnapshotV1"];
            sources: components["schemas"]["S2PacketSourceV1"][];
            scope: components["schemas"]["S2ContextPacketScopeV1"];
            stops: components["schemas"]["S2StopConditionsV1"];
            object_ref: string;
            /** Format: date-time */
            created_at: string;
        };
        S2SessionBindingRequestV1: components["schemas"]["SwarmMetaV1"] & {
            /** @constant */
            expected_version?: 0;
            session_id: string;
            packet_id: string;
            member_id: string;
        };
        S2SessionBindingV1: {
            id: string;
            version: number;
            project_id: string;
            session_id: string;
            adapter_id: string;
            worktree_id: string;
            grant_id: string;
            grant_epoch: number;
            packet_id: string;
            member_id: string;
            status: string;
            capabilities: {
                [key: string]: {
                    status: string;
                    /** Format: date-time */
                    checked_at: string | null;
                };
            };
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
        };
        S2ContextPacketResultV1: {
            /** @constant */
            schema_version: 1;
            context_packet: components["schemas"]["S2ContextPacketV1"];
        };
        S2SessionBindingResultV1: {
            /** @constant */
            schema_version: 1;
            session_binding: components["schemas"]["S2SessionBindingV1"];
        };
        S2GoalReferenceV1: {
            id: string;
            /** @description Zero is preserved only for an unassigned admission draft; ordinary proposal commands and approval require a fixed positive revision. */
            revision: number;
        };
        S2ResourceBudgetV1: {
            calls: number | null;
            tokens: number | null;
            money_minor: number | null;
            /** @description Empty when money_minor is null; otherwise an uppercase three-letter currency. */
            currency: string;
        };
        S2ExecutionScopeV1: {
            project_id: string;
            roots: string[] | null;
            actions: string[] | null;
            tools: string[] | null;
            external_targets: string[] | null;
            max_concurrency: number;
            settings_revision: number;
            write_paths: string[] | null;
        };
        S2StopConditionsV1: {
            /** Format: date-time */
            deadline: string;
            conditions: string[] | null;
            max_work_items: number;
            max_attempts: number;
            no_progress_seconds: number;
            max_no_progress_rounds: number;
        };
        S2ProposalContentV1: {
            title: string;
            goal: components["schemas"]["S2GoalReferenceV1"];
            inputs: components["schemas"]["FixedReferenceV1"][] | null;
            scope: components["schemas"]["S2ExecutionScopeV1"];
            budget: components["schemas"]["S2ResourceBudgetV1"];
            stops: components["schemas"]["S2StopConditionsV1"];
            deliverables: string[] | null;
            success_criteria: string[] | null;
        };
        S2GoalV1: {
            id: string;
            revision: number;
            project_id: string;
            title: string;
            success_criteria: string[];
            priority: number;
            /** @enum {string} */
            status: "active" | "paused" | "completed" | "archived";
            /** Format: date-time */
            created_at: string;
        };
        S2ApprovalGrantV1: {
            id: string;
            proposal_id: string;
            proposal_revision: number;
            goal: components["schemas"]["S2GoalReferenceV1"];
            epoch: number;
            /** @enum {string} */
            status: "active" | "revoked" | "expired" | "completed";
            scope: components["schemas"]["S2ExecutionScopeV1"];
            budget: components["schemas"]["S2ResourceBudgetV1"];
            stops: components["schemas"]["S2StopConditionsV1"];
            approver_id: string;
            /** Format: date-time */
            approved_at: string;
            /** Format: date-time */
            expires_at: string;
            /** Format: date-time */
            changed_at: string;
            reason?: string;
        };
        S2ProposalResultV1: {
            /** @constant */
            schema_version: 1;
            proposal: components["schemas"]["ProposalV1"];
        };
        S2GoalResultV1: {
            /** @constant */
            schema_version: 1;
            goal: components["schemas"]["S2GoalV1"];
        };
        S2ApprovalResultV1: {
            /** @constant */
            schema_version: 1;
            approval: components["schemas"]["S2ApprovalGrantV1"];
        };
        S2ProposalContentInputV1: components["schemas"]["S2ProposalContentV1"] & {
            goal?: components["schemas"]["S2GoalReferenceV1"] & {
                id?: string;
                revision?: number;
            };
            scope?: components["schemas"]["S2ExecutionScopeV1"] & {
                project_id?: string;
            };
        };
        S2ProposalRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            content: components["schemas"]["S2ProposalContentInputV1"];
        };
        S2GoalInputV1: {
            /** @description Assigned by the service; request value does not select an existing goal. */
            id?: string;
            revision?: number;
            project_id: string;
            title: string;
            success_criteria: string[];
            priority?: number;
            /** @enum {string} */
            status: "active" | "paused" | "completed" | "archived";
            /** Format: date-time */
            created_at?: string;
        };
        S2GoalRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            goal: components["schemas"]["S2GoalInputV1"];
        };
        /**
         * @example {
         *       "id": "fixture-session",
         *       "adapter": "fixture",
         *       "native_session_id": null,
         *       "project_id": "fixture-project",
         *       "binding_status": "unavailable",
         *       "capabilities": {
         *         "native_resume": false,
         *         "handoff": false
         *       },
         *       "context_state": "unknown"
         *     }
         */
        SessionV1: {
            id: string;
            adapter: string;
            native_session_id: string | null;
            project_id: string;
            worktree_id?: string | null;
            /** @enum {string} */
            binding_status: "observed" | "bound" | "unavailable";
            capabilities: {
                /** @description Null means unprobed or unknown; false means verified unsupported. */
                native_resume: boolean | null;
                /** @description Null means unprobed or unknown; false means verified unsupported. */
                handoff: boolean | null;
            };
            context_packet_id?: string | null;
            /** @enum {string} */
            context_state: "unknown" | "current" | "stale";
        };
        /**
         * @example {
         *       "id": "fixture-mission",
         *       "version": 1,
         *       "grant_id": "fixture-grant",
         *       "goal": "Fixture only",
         *       "status": "pending"
         *     }
         */
        MissionV1: {
            id: string;
            version: number;
            grant_id: string;
            goal: string;
            /** @enum {string} */
            status: "pending" | "running" | "paused" | "blocked" | "completed" | "cancelled" | "failed";
            work_items?: components["schemas"]["WorkItemV1"][];
            artifact_ids?: string[];
            blockers?: string[];
        };
        /**
         * @example {
         *       "id": "fixture-work",
         *       "version": 1,
         *       "status": "open",
         *       "holder_id": null,
         *       "context_packet_id": null,
         *       "artifact_ids": []
         *     }
         */
        WorkItemV1: {
            id: string;
            version: number;
            /** @enum {string} */
            status: "open" | "claimed" | "in_progress" | "submitted" | "revision_needed" | "blocked" | "accepted" | "cancelled";
            holder_id: string | null;
            context_packet_id: string | null;
            artifact_ids: string[];
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "items": [],
         *       "next_cursor": null
         *     }
         */
        MaterialListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["MaterialV1"][];
            next_cursor: string | null;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "items": [],
         *       "next_cursor": null
         *     }
         */
        OpportunityListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["OpportunityV1"][];
            next_cursor: string | null;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "items": [],
         *       "next_cursor": null
         *     }
         */
        ProjectListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["ProjectV1"][];
            next_cursor: string | null;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "items": [],
         *       "next_cursor": null
         *     }
         */
        ProposalListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["ProposalV1"][];
            next_cursor: string | null;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "items": [],
         *       "next_cursor": null
         *     }
         */
        SessionListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["SessionV1"][];
            next_cursor: string | null;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "items": [],
         *       "next_cursor": null
         *     }
         */
        MissionListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["MissionV1"][];
            next_cursor: string | null;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "mission": {
         *         "id": "fixture-mission",
         *         "version": 1,
         *         "grant_id": "fixture-grant",
         *         "goal": "Fixture only",
         *         "status": "pending"
         *       }
         *     }
         */
        MissionResponseV1: {
            /** @constant */
            schema_version: 1;
            mission: components["schemas"]["MissionV1"];
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "operation_id": "fixture-operation",
         *       "status": "queued"
         *     }
         */
        OperationV1: {
            /** @constant */
            schema_version: 1;
            operation_id: string;
            /** @enum {string} */
            status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "delivery_unknown";
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "job_id": "fixture-job",
         *       "status": "queued"
         *     }
         */
        ImportJobV1: {
            /** @constant */
            schema_version: 1;
            job_id: string;
            /** @enum {string} */
            status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "id": "fixture-resource",
         *       "version": 1
         *     }
         */
        VersionResultV1: {
            /** @constant */
            schema_version: 1;
            id: string;
            version: number;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "grant_id": "fixture-grant",
         *       "proposal_id": "fixture-proposal",
         *       "proposal_revision": 1,
         *       "epoch": 1,
         *       "status": "active"
         *     }
         */
        ApprovalV1: {
            /** @constant */
            schema_version: 1;
            grant_id: string;
            proposal_id: string;
            proposal_revision: number;
            epoch: number;
            /** @enum {string} */
            status: "active" | "revoked" | "expired" | "completed";
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "work_item_id": "fixture-work",
         *       "attempt_id": "fixture-attempt",
         *       "holder_id": "fixture-holder",
         *       "fence": 1,
         *       "lease_token": "fixture-not-valid",
         *       "expires_at": "2026-10-09T00:00:00Z"
         *     }
         */
        LeaseV1: {
            /** @constant */
            schema_version: 1;
            work_item_id: string;
            attempt_id: string;
            holder_id: string;
            fence: number;
            lease_token: string;
            /** Format: date-time */
            expires_at: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "artifact_id": "fixture-artifact",
         *       "status": "submitted"
         *     }
         */
        ArtifactResultV1: {
            /** @constant */
            schema_version: 1;
            artifact_id: string;
            /** @enum {string} */
            status: "submitted" | "revision_needed" | "blocked";
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "acceptance_id": "fixture-acceptance",
         *       "artifact_id": "fixture-artifact",
         *       "experience_id": "fixture-experience"
         *     }
         */
        AcceptanceV1: {
            /** @constant */
            schema_version: 1;
            acceptance_id: string;
            artifact_id: string;
            experience_id: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "source_locator": "arxiv:fixture",
         *       "source_key": "fixture-source",
         *       "kind": "paper",
         *       "content_digest": "fixture-digest",
         *       "export_text": "Fixture only"
         *     }
         */
        ImportMaterialRequestV1: {
            /** @description Ordinary import reuses the existing extraction; only explicit human refresh obtains new content. */
            refresh?: boolean;
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            source_locator: string;
            /** @description Empty string requests adapter canonical source key; nonempty keys are verified by the adapter. */
            source_key: string;
            /** @enum {string} */
            kind: "paper" | "video" | "text" | "file";
            /** @description Empty string requests server digest computation; a nonempty digest is verified against actual imported bytes. */
            content_digest: string;
            export_text?: string;
            local_file_ref?: string;
            collection_reason?: string | null;
            source_spans?: string[];
            title?: string;
            /**
             * @description summarize_url extracts a selected public video URL without export_text or local_file_ref. summarize, summarize_json and summarize_markdown import existing exports. paper_url extracts a selected public paper HTML body; paper_pdf extracts a selected public paper PDF; paper_snapshot ingests a human-reviewed browser-plugin snapshot JSON supplied as export_text (no network or model call). Extraction does not imply model distillation or Agent authorization.
             * @enum {string}
             */
            adapter?: "arxiv" | "paper_url" | "paper_pdf" | "paper_snapshot" | "summarize_url" | "summarize" | "summarize_json" | "summarize_markdown" | "manual";
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "feedback": "later",
         *       "reason": "Fixture only"
         *     }
         */
        ReviewOpportunityRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            /** @enum {string} */
            feedback: "adopt" | "later" | "reject" | "revise" | "already_solved";
            reason: string;
            dimensions?: components["schemas"]["DimensionsV1"];
        };
        AdmitOpportunityRequestV1: components["schemas"]["AdmissionRequestV1"];
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "name": "Fixture only",
         *       "environment_id": "fixture",
         *       "root_path": "/fixture"
         *     }
         */
        RegisterProjectRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            name: string;
            environment_id: string;
            root_path: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "context_packet_id": null
         *     }
         */
        ResumeSessionRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            context_packet_id: string | null;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "context_packet_id": "fixture-packet",
         *       "target_adapter": "fixture",
         *       "target_project_id": "fixture-project"
         *     }
         */
        HandoffSessionRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            context_packet_id: string;
            target_adapter: string;
            target_project_id: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1
         *     }
         */
        SubmitProposalRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
        };
        ApproveProposalRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            expected_revision: number;
            /** Format: date-time */
            expires_at: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "reason": "Fixture only"
         *     }
         */
        RevokeApprovalRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            reason: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "reason": "Fixture only"
         *     }
         */
        MissionControlRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            reason: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "context_packet_id": "fixture-packet"
         *     }
         */
        ClaimWorkItemRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            context_packet_id: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "attempt_id": "fixture-attempt",
         *       "lease_token": "fixture-not-valid",
         *       "fence": 1,
         *       "object_ref": "fixture-object",
         *       "content_digest": "fixture-digest",
         *       "snapshot_ref": "fixture-snapshot",
         *       "checks_ref": "fixture-checks"
         *     }
         */
        SubmitArtifactRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            attempt_id: string;
            lease_token: string;
            fence: number;
            object_ref: string;
            content_digest: string;
            snapshot_ref: string;
            checks_ref: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "reason": "Fixture only"
         *     }
         */
        AcceptArtifactRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            reason: string;
        };
        /**
         * @description Versioned SSE data envelope. Known SPEC12 payloads are discriminated by context-prefixed type; actor is injected by trusted publisher. S0 does not stream events.
         * @example {
         *       "event_id": "fixture-event",
         *       "type": "attention.opportunity_admitted",
         *       "schema_version": 1,
         *       "aggregate_id": "fixture-opportunity",
         *       "aggregate_version": 1,
         *       "occurred_at": "2026-10-09T00:00:00Z",
         *       "correlation_id": "fixture-request",
         *       "causation_id": null,
         *       "payload": {
         *         "opportunity_id": "fixture-opportunity",
         *         "revision": 1,
         *         "admission_id": "fixture-admission",
         *         "actor": "fixture-user",
         *         "policy_version": "fixture-policy"
         *       }
         *     }
         * @example {
         *       "event_id": "fixture-event",
         *       "type": "workspace.proposal_approved",
         *       "schema_version": 1,
         *       "aggregate_id": "fixture-opportunity",
         *       "aggregate_version": 1,
         *       "occurred_at": "2026-10-09T00:00:00Z",
         *       "correlation_id": "fixture-request",
         *       "causation_id": null,
         *       "payload": {
         *         "proposal_id": "fixture-proposal",
         *         "revision": 1,
         *         "grant_id": "fixture-grant",
         *         "epoch": 1
         *       }
         *     }
         * @example {
         *       "event_id": "fixture-event",
         *       "type": "workspace.approval_revoked",
         *       "schema_version": 1,
         *       "aggregate_id": "fixture-opportunity",
         *       "aggregate_version": 1,
         *       "occurred_at": "2026-10-09T00:00:00Z",
         *       "correlation_id": "fixture-request",
         *       "causation_id": null,
         *       "payload": {
         *         "grant_id": "fixture-grant",
         *         "new_epoch": 2,
         *         "reason": "Fixture only"
         *       }
         *     }
         * @example {
         *       "event_id": "fixture-event",
         *       "type": "workspace.context_packet_built",
         *       "schema_version": 1,
         *       "aggregate_id": "fixture-opportunity",
         *       "aggregate_version": 1,
         *       "occurred_at": "2026-10-09T00:00:00Z",
         *       "correlation_id": "fixture-request",
         *       "causation_id": null,
         *       "payload": {
         *         "packet_id": "fixture-packet",
         *         "snapshot_digest": "fixture-snapshot",
         *         "predecessor_id": null
         *       }
         *     }
         * @example {
         *       "event_id": "fixture-event",
         *       "type": "swarm.work_item_claimed",
         *       "schema_version": 1,
         *       "aggregate_id": "fixture-opportunity",
         *       "aggregate_version": 1,
         *       "occurred_at": "2026-10-09T00:00:00Z",
         *       "correlation_id": "fixture-request",
         *       "causation_id": null,
         *       "payload": {
         *         "work_item_id": "fixture-work",
         *         "attempt_id": "fixture-attempt",
         *         "holder_id": "fixture-holder",
         *         "fence": 1
         *       }
         *     }
         * @example {
         *       "event_id": "fixture-event",
         *       "type": "swarm.artifact_submitted",
         *       "schema_version": 1,
         *       "aggregate_id": "fixture-opportunity",
         *       "aggregate_version": 1,
         *       "occurred_at": "2026-10-09T00:00:00Z",
         *       "correlation_id": "fixture-request",
         *       "causation_id": null,
         *       "payload": {
         *         "artifact_id": "fixture-artifact",
         *         "attempt_id": "fixture-attempt",
         *         "snapshot": {
         *           "environment_id": "fixture",
         *           "repo_id": "fixture-repo",
         *           "worktree_id": "fixture-worktree",
         *           "head": "fixture-head",
         *           "index_digest": "fixture-index",
         *           "working_tree_digest": "fixture-content"
         *         },
         *         "checks_ref": "fixture-checks"
         *       }
         *     }
         * @example {
         *       "event_id": "fixture-event",
         *       "type": "swarm.artifact_accepted",
         *       "schema_version": 1,
         *       "aggregate_id": "fixture-opportunity",
         *       "aggregate_version": 1,
         *       "occurred_at": "2026-10-09T00:00:00Z",
         *       "correlation_id": "fixture-request",
         *       "causation_id": null,
         *       "payload": {
         *         "artifact_id": "fixture-artifact",
         *         "acceptance_id": "fixture-acceptance",
         *         "actor": "fixture-user",
         *         "experience_id": "fixture-experience"
         *       }
         *     }
         */
        EventV1: {
            event_id: string;
            type: string;
            /** @constant */
            schema_version: 1;
            aggregate_id: string;
            aggregate_version: number;
            /** Format: date-time */
            occurred_at: string;
            correlation_id: string;
            causation_id: string | null;
            payload: {
                [key: string]: unknown;
            };
        } & ({
            /** @constant */
            type: "attention.opportunity_admitted";
            payload: components["schemas"]["OpportunityAdmittedPayloadV1"];
        } | {
            /** @constant */
            type: "workspace.proposal_approved";
            payload: components["schemas"]["ProposalApprovedPayloadV1"];
        } | {
            /** @constant */
            type: "workspace.approval_revoked";
            payload: components["schemas"]["ApprovalRevokedPayloadV1"];
        } | {
            /** @constant */
            type: "workspace.context_packet_built";
            payload: components["schemas"]["ContextPacketBuiltPayloadV1"];
        } | {
            /** @constant */
            type: "swarm.work_item_claimed";
            payload: components["schemas"]["WorkItemClaimedPayloadV1"];
        } | {
            /** @constant */
            type: "swarm.artifact_submitted";
            payload: components["schemas"]["ArtifactSubmittedPayloadV1"];
        } | {
            /** @constant */
            type: "swarm.artifact_accepted";
            payload: components["schemas"]["ArtifactAcceptedPayloadV1"];
        });
        /**
         * @example {
         *       "environment_id": "fixture",
         *       "repo_id": "fixture-repo",
         *       "worktree_id": "fixture-worktree",
         *       "head": "fixture-head",
         *       "index_digest": "fixture-index",
         *       "working_tree_digest": "fixture-content"
         *     }
         */
        ProjectSnapshotV1: {
            environment_id: string;
            repo_id: string;
            worktree_id: string;
            head: string;
            index_digest: string;
            working_tree_digest: string;
        };
        /**
         * @example {
         *       "opportunity_id": "fixture-opportunity",
         *       "revision": 1,
         *       "admission_id": "fixture-admission",
         *       "actor": "fixture-user",
         *       "policy_version": "fixture-policy"
         *     }
         */
        OpportunityAdmittedPayloadV1: {
            opportunity_id: string;
            revision: number;
            admission_id: string;
            actor: string;
            policy_version: string;
        };
        /**
         * @example {
         *       "proposal_id": "fixture-proposal",
         *       "revision": 1,
         *       "grant_id": "fixture-grant",
         *       "epoch": 1
         *     }
         */
        ProposalApprovedPayloadV1: {
            proposal_id: string;
            revision: number;
            grant_id: string;
            epoch: number;
        };
        /**
         * @example {
         *       "grant_id": "fixture-grant",
         *       "new_epoch": 2,
         *       "reason": "Fixture only"
         *     }
         */
        ApprovalRevokedPayloadV1: {
            grant_id: string;
            new_epoch: number;
            reason: string;
        };
        /**
         * @example {
         *       "packet_id": "fixture-packet",
         *       "snapshot_digest": "fixture-snapshot",
         *       "predecessor_id": null
         *     }
         */
        ContextPacketBuiltPayloadV1: {
            packet_id: string;
            snapshot_digest: string;
            predecessor_id: string | null;
        };
        /**
         * @example {
         *       "work_item_id": "fixture-work",
         *       "attempt_id": "fixture-attempt",
         *       "holder_id": "fixture-holder",
         *       "fence": 1
         *     }
         */
        WorkItemClaimedPayloadV1: {
            work_item_id: string;
            attempt_id: string;
            holder_id: string;
            fence: number;
        };
        /**
         * @example {
         *       "artifact_id": "fixture-artifact",
         *       "attempt_id": "fixture-attempt",
         *       "snapshot": {
         *         "environment_id": "fixture",
         *         "repo_id": "fixture-repo",
         *         "worktree_id": "fixture-worktree",
         *         "head": "fixture-head",
         *         "index_digest": "fixture-index",
         *         "working_tree_digest": "fixture-content"
         *       },
         *       "checks_ref": "fixture-checks"
         *     }
         */
        ArtifactSubmittedPayloadV1: {
            artifact_id: string;
            attempt_id: string;
            snapshot: components["schemas"]["ProjectSnapshotV1"];
            checks_ref: string;
        };
        /**
         * @example {
         *       "artifact_id": "fixture-artifact",
         *       "acceptance_id": "fixture-acceptance",
         *       "actor": "fixture-user",
         *       "experience_id": "fixture-experience"
         *     }
         */
        ArtifactAcceptedPayloadV1: {
            artifact_id: string;
            acceptance_id: string;
            actor: string;
            experience_id: string;
        };
        ProvenanceV1: {
            processor: string;
            version: string;
            /** @description Actual processing mode reported by the adapter; manual, official_atom_and_pdf, original_export or summary_only. Never infer automatic processing from a record. */
            mode: string;
            source: string;
            /** @description Actual model reported by the processor, or explicit unknown; never inferred from client name. */
            model?: string;
        };
        MaterialRevisionV1: {
            material_id: string;
            revision: number;
            source_key: string;
            source_locator: string;
            content_digest: string;
            object_ref: string;
            source_spans: string[];
            provenance: components["schemas"]["ProvenanceV1"];
            /** Format: date-time */
            created_at: string;
            summary?: string;
            attachments?: components["schemas"]["AttachmentRefV1"][];
        };
        UsageV1: {
            id: string;
            material_id: string;
            actor_id: string;
            /** @enum {string} */
            actor_kind: "human" | "agent";
            action: string;
            /** Format: date-time */
            occurred_at: string;
        };
        DistillationV1: {
            /** @description Explicitly selected immutable prior records used by this processing operation. */
            prior_distillation_ids?: string[];
            id: string;
            input_refs: components["schemas"]["SourceRefV1"][];
            /** @enum {string} */
            stage: "content" | "topic" | "project";
            output_ref: string;
            output_text: string;
            /** @enum {string} */
            status: "succeeded";
            next_question: string | null;
            question: string;
            processing_config: string;
            related_refs: components["schemas"]["SourceRefV1"][];
            related_ideas: string[];
            conflicts: string[];
            pending_questions: string[];
            goal_refs: string[];
            existing_assets: string[];
            expected_improvement: string;
            minimum_artifact: string;
            missing_evidence: string[];
            provenance: components["schemas"]["ProvenanceV1"];
            reuse_key: string;
            /** Format: date-time */
            created_at: string;
            candidate_suggestion?: components["schemas"]["CandidateSuggestionV1"] | null;
        };
        RecordDistillationRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            input_refs: components["schemas"]["SourceRefV1"][];
            /** @enum {string} */
            stage: "content" | "topic" | "project";
            output_text: string;
            next_question?: string | null;
            question: string;
            processing_config: string;
            related_refs?: components["schemas"]["SourceRefV1"][];
            related_ideas?: string[];
            conflicts?: string[];
            pending_questions?: string[];
            goal_refs?: string[];
            existing_assets?: string[];
            expected_improvement?: string;
            minimum_artifact?: string;
            missing_evidence?: string[];
        };
        DistillationResultV1: {
            /** @constant */
            schema_version: 1;
            distillation: components["schemas"]["DistillationV1"];
            reused: boolean;
        };
        MaterialDetailV1: {
            /** @constant */
            schema_version: 1;
            material: components["schemas"]["MaterialV1"];
            revisions: components["schemas"]["MaterialRevisionV1"][];
            distillations: components["schemas"]["DistillationV1"][];
            uses: components["schemas"]["UsageV1"][];
        };
        ContentV1: {
            /** @constant */
            schema_version: 1;
            material_id: string;
            revision: number;
            content_digest: string;
            text: string;
            provenance: components["schemas"]["ProvenanceV1"];
        };
        ReviewV1: {
            id: string;
            opportunity_id: string;
            revision: number;
            /** @enum {string} */
            feedback: "adopt" | "later" | "reject" | "revise" | "already_solved";
            reason: string;
            dimensions?: components["schemas"]["DimensionsV1"];
            actor_id: string;
            /** Format: date-time */
            created_at: string;
        };
        OpportunityDetailV1: {
            /** @constant */
            schema_version: 1;
            opportunity: components["schemas"]["OpportunityV1"];
            revisions: components["schemas"]["OpportunityV1"][];
            reviews: components["schemas"]["ReviewV1"][];
        };
        OpportunityRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            title: string;
            evidence_refs: components["schemas"]["SourceRefV1"][];
            goal_refs?: string[];
            dimensions: components["schemas"]["DimensionsV1"];
            next_step: string;
            missing_evidence?: string[];
            purpose: string;
            distillation_ids: string[];
        };
        RecordUseRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            /** @enum {string} */
            action: "reread" | "annotate" | "pin" | "adopt" | "mention" | "project_reuse";
        };
        JobV1: {
            /** @constant */
            schema_version: 1;
            job_id: string;
            /** @enum {string} */
            status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
            kind: string;
            version: number;
            dedupe_key: string;
            operation_id: string;
            material_id: string | null;
            material_revision: number | null;
            error: components["schemas"]["ServiceErrorV1"] | null;
            attempts: number;
            max_attempts: number;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
            /** Format: date-time */
            deadline_at: string;
            cancel_requested: boolean;
            external_started: boolean;
            delivery_unknown: boolean;
            distillation_id?: string | null;
        };
        ServiceErrorV1: {
            /** @enum {string} */
            code: "validation_failed" | "unsupported_capability" | "version_conflict" | "context_stale" | "index_stale" | "scope_denied" | "approval_required" | "approval_revoked" | "lease_lost" | "budget_exhausted" | "provider_unavailable" | "evidence_missing" | "delivery_unknown" | "not_found" | "internal_error";
            message: string;
            request_id: string;
            retryable: boolean;
            required_action: string;
        };
        JobCommandV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
        };
        LocalSessionV1: {
            /** @constant */
            schema_version: 1;
            actor_id: string;
            /** @enum {string} */
            actor_kind: "human";
            csrf_token: string;
        };
        JobListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["JobV1"][];
            next_cursor: string | null;
        };
        DistillationListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["DistillationV1"][];
            next_cursor: string | null;
        };
        AttachmentRefV1: {
            name: string;
            media_type: string;
            object_ref: string;
            source_locator: string;
        };
        UpdateMaterialRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            /** @enum {string} */
            lifecycle: "active" | "archived" | "withdrawn";
            collection_reason: string | null;
            pinned: boolean;
        };
        MaterialDomainV1: {
            id: string;
            version: number;
            title: string;
            description: string;
            /** Format: date-time */
            created_at: string;
        };
        MaterialDomainRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            title: string;
            description: string;
        };
        MaterialDomainResultV1: {
            /** @constant */
            schema_version: 1;
            domain: components["schemas"]["MaterialDomainV1"];
        };
        SetMaterialDomainsRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            domain_ids: string[];
        };
        ProjectSpaceV1: {
            id: string;
            version: number;
            title: string;
            material_refs: components["schemas"]["SourceRefV1"][];
            /** Format: date-time */
            created_at: string;
        };
        ProjectSpaceRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            title: string;
        };
        ProjectSpaceResultV1: {
            /** @constant */
            schema_version: 1;
            space: components["schemas"]["ProjectSpaceV1"];
        };
        ReferenceMaterialRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            material_id: string;
            revision: number;
        };
        RemoveMaterialReferenceRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            material_id: string;
        };
        MaterialDomainListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["MaterialDomainV1"][];
            next_cursor: string | null;
        };
        ProjectSpaceListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["ProjectSpaceV1"][];
            next_cursor: string | null;
        };
        RequestDistillationRequestV1: {
            /** @description Human selected project whose current fixed references and model consent are rechecked before processing. */
            project_id?: string;
            /** @description Exact CLI permitted by that project; selected project processing never silently falls back to a global provider. */
            cli?: string;
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            input_refs: components["schemas"]["SourceRefV1"][];
            /** @enum {string} */
            stage: "content" | "topic" | "project";
            question: string;
            processing_config: string;
            prior_distillation_ids?: string[];
        };
        RankingProfileV1: {
            id: string;
            version: number;
            enabled: boolean;
            weights: {
                goal_progress: number;
                current_interest: number;
                project_improvement: number;
                originality: number;
            };
            /** Format: date-time */
            created_at: string;
        };
        RankingProfileDetailV1: {
            /** @constant */
            schema_version: 1;
            configured: boolean;
            profile: components["schemas"]["RankingProfileV1"] | null;
            versions: components["schemas"]["RankingProfileV1"][];
        };
        UpdateRankingProfileRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            enabled: boolean;
            weights: {
                goal_progress: number;
                current_interest: number;
                project_improvement: number;
                originality: number;
            };
        };
        CandidateSuggestionV1: {
            title: string;
            evidence_refs: components["schemas"]["SourceRefV1"][];
            goal_refs: string[];
            dimensions: components["schemas"]["DimensionsV1"];
            next_step: string;
            missing_evidence: string[];
            purpose: string;
        };
        DistillerStatusV1: {
            /** @constant */
            schema_version: 1;
            available: boolean;
            processor: string;
            configuration_id: string | null;
            model: string | null;
            reason: string;
            required_action: string;
            allowed_source_keys: string[];
        };
        ListingMetadataV1: {
            external_id: string;
            locator: string;
            title: string;
            description: string;
            author: string;
            cover: string;
            published_at: number;
            provider_status: number | null;
            unavailable_reason: string;
        };
        SourceRecommendationV1: {
            /** @enum {string} */
            status: "pending" | "running" | "succeeded" | "failed" | "unknown" | "unavailable";
            text: string;
            reason: string;
            metadata_revision: number;
            provenance: components["schemas"]["ProvenanceV1"];
            configuration_id: string;
            error: components["schemas"]["ServiceErrorV1"] | null;
        };
        TrackingSourceV1: {
            /**
             * @description Omitted legacy input means public; browser_selected requires explicit human selected owner and folder identity and configured browser bridge.
             * @enum {string}
             */
            access_mode?: "public" | "browser_selected";
            id: string;
            version: number;
            /** @enum {string} */
            platform: "bilibili" | "douyin";
            /** @enum {string} */
            source_kind: "uploads" | "favorites";
            external_id: string;
            owner_id: string;
            locator: string;
            title: string;
            status: string;
            last_success_at: string | null;
            last_error: components["schemas"]["ServiceErrorV1"] | null;
            next_cursor: string | null;
            has_more: boolean;
            warnings: string[];
        };
        SourceItemV1: {
            source_id: string;
            external_id: string;
            revision: number;
            metadata: components["schemas"]["ListingMetadataV1"];
            stale: boolean;
            selected: boolean;
            import_job_id: string | null;
            material_id: string | null;
            recommendation: components["schemas"]["SourceRecommendationV1"] | null;
        };
        TrackingSourceResultV1: {
            /** @constant */
            schema_version: 1;
            source: components["schemas"]["TrackingSourceV1"];
            items: components["schemas"]["SourceItemV1"][];
            next_cursor: string | null;
            has_more: boolean;
            warnings: string[];
            jobs: components["schemas"]["ImportJobV1"][];
        };
        TrackingSourceListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["TrackingSourceV1"][];
            next_cursor: string | null;
        };
        BindTrackingSourceRequestV1: {
            /**
             * @description Omitted legacy input means public; browser_selected requires explicit human selected owner and folder identity and configured browser bridge.
             * @enum {string}
             */
            access_mode?: "public" | "browser_selected";
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            /** @enum {string} */
            platform: "bilibili" | "douyin";
            /** @enum {string} */
            source_kind: "uploads" | "favorites";
            external_id: string;
            owner_id?: string;
            locator: string;
            title?: string;
        };
        SyncTrackingSourceRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            /** @default 100 */
            limit: number;
            cursor?: string;
        };
        SourceItemSelectionV1: {
            external_id: string;
            revision: number;
        };
        RecommendSourceItemsRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            project_id: string;
            cli: string;
            items: components["schemas"]["SourceItemSelectionV1"][];
        };
        SelectSourceItemsRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            items: components["schemas"]["SourceItemSelectionV1"][];
            collection_reason?: string | null;
        };
        LocalProjectSettingsV1: {
            revision: number;
            allow_directory: boolean;
            allowed_subdirs: string[];
            expand_references: boolean;
            allowed_actions: string[];
            allowed_tools: string[];
            /** @description Default model CLI; an empty value revokes project model processing permission. */
            external_model_cli: string;
            /** @description Explicit permitted model CLIs, including the default. Omitted or empty keeps the legacy single-default permission. */
            external_model_clis?: string[];
            allow_agent_control: boolean;
            history_roots: {
                [key: string]: string;
            };
        };
        LocalProjectV1: {
            id: string;
            name: string;
            root: string;
            space_id: string;
            settings: components["schemas"]["LocalProjectSettingsV1"];
            /** Format: date-time */
            created_at: string;
        };
        LocalProjectResultV1: {
            /** @constant */
            schema_version: 1;
            project: components["schemas"]["LocalProjectV1"];
        };
        LocalProjectListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["LocalProjectV1"][];
            next_cursor: string | null;
        };
        LocalProjectCandidateV1: {
            root: string;
            name: string;
        };
        LocalProjectCandidateListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["LocalProjectCandidateV1"][];
            next_cursor: string | null;
        };
        RegisterLocalProjectRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            name: string;
            root: string;
            space_id: string;
        };
        DiscoverLocalProjectsRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            root: string;
        };
        LocalProjectSettingsRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            expected_revision: number;
            settings: components["schemas"]["LocalProjectSettingsV1"];
        };
        LocalProjectGrantV1: {
            project_id: string;
            agent_id: string;
            actions: string[];
            revoked_at: string | null;
            expires_at: string | null;
        };
        LocalProjectGrantResultV1: {
            /** @constant */
            schema_version: 1;
            grant: components["schemas"]["LocalProjectGrantV1"];
        };
        GrantLocalProjectAgentRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            agent_id: string;
            actions: string[];
        };
        RevokeLocalProjectAgentRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            agent_id: string;
        };
        FixedReferenceV1: {
            material_id: string;
            revision: number;
        };
        LocalContextMaterialV1: {
            reference: components["schemas"]["FixedReferenceV1"];
            title: string;
            text: string;
            expanded?: boolean;
        };
        LocalContextFileV1: {
            /** @description Actual fixed file snapshot version returned by the project reader. */
            version?: string;
            path: string;
            text: string;
        };
        LocalContextRequestV1: {
            references: components["schemas"]["FixedReferenceV1"][];
            files: string[];
        };
        ReadLocalProjectContextRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            references?: components["schemas"]["FixedReferenceV1"][];
            files?: string[];
        };
        LocalContextPacketV1: {
            id: string;
            /** @constant */
            schema_version: 1;
            project_id: string;
            settings_revision: number;
            mode: string;
            materials: components["schemas"]["LocalContextMaterialV1"][];
            files: components["schemas"]["LocalContextFileV1"][];
            /**
             * Format: date-time
             * @description Time the controller captured this permission scope packet. In observed_history mode this is not a native historical message or session timestamp.
             */
            created_at: string;
        };
        NativeSessionV1: {
            operations?: {
                [key: string]: components["schemas"]["NativeOperationV1"];
            } | null;
            id: string;
            project_id: string;
            cli: string;
            native_id: string;
            version: string;
            mode: string;
            status: string;
            stop_confirmed: boolean;
            context_packet: components["schemas"]["LocalContextPacketV1"];
            source_session_id: string;
            /**
             * Format: date-time
             * @description Native session observation time; null when historical time is unknown. Context packet creation time is not native history evidence.
             */
            updated_at: string | null;
            limitations: string[];
            last_operation_id: string;
            pending_operation: string;
            /**
             * @description Unstarted only when launch was confirmed not to have created a process; never a substitute for unknown ownership.
             * @enum {string}
             */
            ownership: "owned" | "external_observed" | "unstarted";
        };
        NativeSessionResultV1: {
            /** @constant */
            schema_version: 1;
            session: components["schemas"]["NativeSessionV1"];
        };
        NativeSessionListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["NativeSessionV1"][];
            next_cursor: string | null;
        };
        NativeEventV1: {
            sequence: number;
            kind: string;
            text: string;
        };
        NativeObservationV1: {
            status: string;
            events: components["schemas"]["NativeEventV1"][];
            stop_confirmed: boolean;
            output_truncated: boolean;
        };
        NativeObservationResultV1: {
            /** @constant */
            schema_version: 1;
            observation: components["schemas"]["NativeObservationV1"];
        };
        NativeSessionRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            cli: string;
            message: string;
            context: components["schemas"]["LocalContextRequestV1"];
            deadline_seconds?: number;
            /** @enum {string} */
            mode?: "native" | "context_handoff";
            source_session_id?: string;
        };
        NativeMessageRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            message: string;
        };
        SourceCollectionV1: {
            /** @enum {string} */
            access_mode?: "public" | "browser_selected";
            external_id: string;
            owner_id: string;
            title: string;
            locator: string;
            item_count: number | null;
        };
        SourceCollectionListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["SourceCollectionV1"][];
            next_cursor: string | null;
        };
        ProjectAgentTokenV1: {
            token: string;
            project_id: string;
            agent_id: string;
            /** Format: date-time */
            expires_at: string;
        };
        ProjectAgentTokenResultV1: {
            /** @constant */
            schema_version: 1;
            credential: components["schemas"]["ProjectAgentTokenV1"];
        };
        IssueProjectAgentTokenRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            agent_id: string;
        };
        DiscoverNativeSessionsRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            cli: string;
        };
        NativeContextListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["NativeEventV1"][];
            next_cursor: string | null;
        };
        NativeOperationV1: {
            action: string;
            /** @enum {string} */
            status: "pending" | "accepted" | "failed" | "unknown";
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            finished_at: string | null;
        };
        RegisteredProjectGitV1: {
            /** @enum {string} */
            status: "known" | "unknown" | "unavailable";
            reason: string;
            branch: string | null;
            head: string | null;
            /** Format: date-time */
            last_commit_at: string | null;
            dirty: boolean | null;
        };
        RegisteredProjectActivityV1: {
            /** @enum {string} */
            status: "known" | "unknown" | "unavailable";
            source: string;
            created_with_cli: string | null;
            /** Format: date-time */
            last_activity_at: string | null;
        };
        RegisteredProjectV1: {
            /** @description Stable aggregate project identity; grants no authority. */
            project_key?: string;
            contributors?: components["schemas"]["ProjectContributorV1"][];
            root: string;
            name: string;
            repo_id: string;
            /** @enum {string} */
            source: "orca_registered" | "subproject" | "git_worktree" | "native_project_metadata" | "explicit_directory";
            parent_root: string;
            git: components["schemas"]["RegisteredProjectGitV1"];
            activity: components["schemas"]["RegisteredProjectActivityV1"];
            limitations: string[];
        };
        RegisteredProjectDiscoveryFailureV1: {
            root: string;
            reason: string;
        };
        /**
         * @description Cached observations grant no permissions. Stale results retain the previous observation time and identify the current discovery failures.
         * @example {
         *       "status": "unknown",
         *       "observed_at": null,
         *       "projects": [],
         *       "failures": []
         *     }
         */
        RegisteredProjectSnapshotV1: {
            board?: components["schemas"]["ProjectSummaryV1"][];
            sources?: components["schemas"]["ProjectSourceObservationV1"][];
            /** @enum {string} */
            status: "unknown" | "complete" | "partial" | "stale";
            /** Format: date-time */
            observed_at: string | null;
            projects: components["schemas"]["RegisteredProjectV1"][];
            failures: components["schemas"]["RegisteredProjectDiscoveryFailureV1"][];
        };
        RegisteredProjectDiscoveryResultV1: {
            /** @constant */
            schema_version: 1;
            snapshot: components["schemas"]["RegisteredProjectSnapshotV1"];
        };
        RefreshRegisteredProjectsRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
        };
        ProjectContributorV1: {
            cli: string;
            source: string;
            root: string;
            /** @description Observed native identity only, never a control permission. */
            session_id: string;
            /** Format: date-time */
            observed_at: string | null;
            /**
             * Format: date-time
             * @description Native header creation time; never current activity or progress.
             */
            created_at: string | null;
            /**
             * Format: date-time
             * @description An actual latest activity observation, otherwise null. Native creation headers do not establish activity.
             */
            activity_at: string | null;
        };
        ProjectSourceObservationV1: {
            cli: string;
            source: string;
            status: string;
            reason: string;
            /** @description Filesystem entries examined within the bounded known source. */
            entries_examined: number;
            /** @description Native metadata headers examined; not a session or project total. */
            headers_examined?: number;
            /** @description Distinct validated project roots identified in this source. */
            matched_roots?: number;
            /** @description Retained samples after per-root/client bounds; not total sessions. */
            retained_associations?: number;
            /** @description Unique valid metadata matches; distinct from retained samples. */
            matched_headers: number;
        };
        ProjectHumanMetadataV1: {
            notes: string;
            review: string;
            group: string;
            intent: string;
            archived: boolean;
            revision: number;
            /** Format: date-time */
            updated_at: string | null;
        };
        ProjectSummaryV1: {
            id: string;
            name: string;
            roots: string[];
            observations: components["schemas"]["RegisteredProjectV1"][];
            contributors: components["schemas"]["ProjectContributorV1"][];
            /** Format: date-time */
            last_activity_at: string | null;
            limitations: string[];
            human: components["schemas"]["ProjectHumanMetadataV1"];
        };
        ProjectSummaryResultV1: {
            /** @constant */
            schema_version: 1;
            project: components["schemas"]["ProjectSummaryV1"];
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "manual-note",
         *       "expected_version": 1,
         *       "notes": "Human-owned notes",
         *       "review": "",
         *       "group": "",
         *       "intent": "",
         *       "archived": false,
         *       "revision": 0
         *     }
         */
        SetRegisteredProjectMetadataRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            /** @description Human text, at most 65536 UTF-8 bytes. */
            notes: string;
            /** @description Human text, at most 65536 UTF-8 bytes. */
            review: string;
            /** @description Human group label, at most 200 UTF-8 bytes. */
            group: string;
            /** @description Human intent text, at most 4096 UTF-8 bytes. */
            intent: string;
            archived: boolean;
            /** @description Expected human metadata revision; zero means no prior annotation. */
            revision: number;
        };
        GitHubMetadataV1: {
            /** @enum {string} */
            metadata_source?: "github_rest" | "github_public_html" | "unknown";
            /** @description These metadata fields are unobserved; consumers must not display their scalar defaults as known facts. */
            unknown_fields?: string[];
            github_id: number;
            full_name: string;
            html_url: string;
            clone_url: string;
            description: string;
            default_branch: string;
            language: string;
            stars: number;
            archived: boolean;
            fork: boolean;
            /** Format: date-time */
            updated_at: string;
            /** Format: date-time */
            pushed_at: string;
        };
        /**
         * @description Anonymous public metadata and durable managed-clone observations. Empty root/head/project_id before explicit human placement; unknown or failed clone effects are never inferred successful. No grants, sessions or model permissions are created.
         * @example {
         *       "id": "github-1",
         *       "revision": 1,
         *       "metadata_revision": 1,
         *       "metadata": {
         *         "github_id": 1,
         *         "full_name": "example/repository",
         *         "html_url": "https://github.com/example/repository",
         *         "clone_url": "https://github.com/example/repository.git",
         *         "description": "Contract fixture only",
         *         "default_branch": "main",
         *         "language": "Go",
         *         "stars": 0,
         *         "archived": false,
         *         "fork": false,
         *         "updated_at": "2026-10-10T00:00:00Z",
         *         "pushed_at": "2026-10-10T00:00:00Z"
         *       },
         *       "sync_status": "synced",
         *       "synced_at": "2026-10-10T00:00:00Z",
         *       "space_id": "",
         *       "project_id": "",
         *       "clone_status": "not_placed",
         *       "root": "",
         *       "head": "",
         *       "clone_attempts": 0,
         *       "last_error": ""
         *     }
         */
        GitHubRepositoryV1: {
            id: string;
            revision: number;
            metadata_revision: number;
            metadata: components["schemas"]["GitHubMetadataV1"];
            /** @enum {string} */
            sync_status: "synced" | "stale" | "unknown";
            /** Format: date-time */
            synced_at: string;
            space_id: string;
            project_id: string;
            /** @enum {string} */
            clone_status: "not_placed" | "cloning" | "ready" | "failed" | "interrupted" | "unknown";
            root: string;
            head: string;
            clone_attempts: number;
            last_error: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "items": [
         *         {
         *           "id": "github-1",
         *           "revision": 1,
         *           "metadata_revision": 1,
         *           "metadata": {
         *             "github_id": 1,
         *             "full_name": "example/repository",
         *             "html_url": "https://github.com/example/repository",
         *             "clone_url": "https://github.com/example/repository.git",
         *             "description": "Contract fixture only",
         *             "default_branch": "main",
         *             "language": "Go",
         *             "stars": 0,
         *             "archived": false,
         *             "fork": false,
         *             "updated_at": "2026-10-10T00:00:00Z",
         *             "pushed_at": "2026-10-10T00:00:00Z"
         *           },
         *           "sync_status": "synced",
         *           "synced_at": "2026-10-10T00:00:00Z",
         *           "space_id": "",
         *           "project_id": "",
         *           "clone_status": "not_placed",
         *           "root": "",
         *           "head": "",
         *           "clone_attempts": 0,
         *           "last_error": ""
         *         }
         *       ],
         *       "next_cursor": null
         *     }
         */
        GitHubRepositoryListV1: {
            /** @constant */
            schema_version: 1;
            items: components["schemas"]["GitHubRepositoryV1"][];
            next_cursor: string | null;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "repository": {
         *         "id": "github-1",
         *         "revision": 1,
         *         "metadata_revision": 1,
         *         "metadata": {
         *           "github_id": 1,
         *           "full_name": "example/repository",
         *           "html_url": "https://github.com/example/repository",
         *           "clone_url": "https://github.com/example/repository.git",
         *           "description": "Contract fixture only",
         *           "default_branch": "main",
         *           "language": "Go",
         *           "stars": 0,
         *           "archived": false,
         *           "fork": false,
         *           "updated_at": "2026-10-10T00:00:00Z",
         *           "pushed_at": "2026-10-10T00:00:00Z"
         *         },
         *         "sync_status": "synced",
         *         "synced_at": "2026-10-10T00:00:00Z",
         *         "space_id": "",
         *         "project_id": "",
         *         "clone_status": "not_placed",
         *         "root": "",
         *         "head": "",
         *         "clone_attempts": 0,
         *         "last_error": ""
         *       }
         *     }
         */
        GitHubRepositoryResultV1: {
            /** @constant */
            schema_version: 1;
            repository: components["schemas"]["GitHubRepositoryV1"];
        };
        SyncGitHubRepositoriesRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            /** @description Explicit public GitHub account, owner/repository or https://github.com URL. No credential or private scope. */
            input: string;
        };
        PlaceGitHubRepositoryRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            /** @description Existing top-level development ProjectSpace selected by the human; expected_version is the cached repository revision. */
            space_id: string;
        };
        DiscoverSourceCollectionsRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            /** @enum {string} */
            platform: "bilibili" | "douyin";
            owner_id: string;
            /**
             * @description Omitted legacy input means public; browser_selected requires explicit human selected owner and folder identity and configured browser bridge.
             * @enum {string}
             */
            access_mode?: "public" | "browser_selected";
        };
        PaperSearchHitV1: {
            /** @description Canonical import identity (doi:.../arxiv:... or canonical URL). The human selects a hit and imports it through ImportMaterial with this key for dedup. */
            source_key: string;
            /**
             * @description Official metadata index the hit came from.
             * @enum {string}
             */
            provider: "crossref" | "europepmc" | "arxiv";
            title: string;
            authors: string[];
            year: number;
            venue?: string;
            arxiv_id?: string;
            doi?: string;
            locator: string;
            abstract?: string;
            /**
             * @description Raw availability vocabulary. Metadata indexes always report abstract_only; full-text availability is resolved on import, never at search time.
             * @enum {string}
             */
            content_state: "readable_fulltext" | "abstract_only" | "paywall" | "restricted" | "unknown";
            /** @description Candidate public PDF links surfaced for human selection; a PDF is never presented as metadata full text. */
            pdf_urls: string[];
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "query": "attention is all you need",
         *       "items": [],
         *       "next_cursor": null,
         *       "has_more": false,
         *       "warnings": []
         *     }
         */
        PaperSearchResultV1: {
            /** @constant */
            schema_version: 1;
            query: string;
            items: components["schemas"]["PaperSearchHitV1"][];
            next_cursor: string | null;
            has_more: boolean;
            warnings: string[];
        };
        ProgressEvidenceV1: {
            source_path: string;
            kind: string;
            version: string;
            excerpt?: string;
        };
        ProjectProgressV1: {
            project_id: string;
            /** @description Advisory stage label. The wire reports "unknown" for an unobserved project instead of inventing a stage. */
            status: string;
            summary?: string;
            percent?: number | null;
            /** @description Null until a human writes or an Agent inference concludes. */
            source: ("human" | "agent_inferred") | null;
            evidence: components["schemas"]["ProgressEvidenceV1"][];
            native_id?: string;
            model?: string | null;
            /** @description Null when no observation has been recorded; never a fabricated zero timestamp. */
            observed_at: string | null;
            warning?: string;
            revision: number;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "progress": {
         *         "project_id": "project-example",
         *         "status": "unknown",
         *         "source": null,
         *         "evidence": [],
         *         "observed_at": null,
         *         "revision": 0
         *       }
         *     }
         */
        ProjectProgressResultV1: {
            /** @constant */
            schema_version: 1;
            progress: components["schemas"]["ProjectProgressV1"];
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "example-request",
         *       "expected_version": 1,
         *       "status": "in progress"
         *     }
         */
        SetProgressRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            status: string;
            summary?: string;
            percent?: number | null;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "example-request",
         *       "expected_version": 1,
         *       "files": [
         *         "TASK.md",
         *         "STATUS.md"
         *       ]
         *     }
         */
        InferProgressRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            files: string[];
        };
        /**
         * @example {
         *       "event_id": "e-1",
         *       "ts": 1700000000000
         *     }
         */
        EventRefV1: {
            event_id: string;
            ts: number;
        };
        KnowledgeEntryV1: {
            id: string;
            topic: string;
            fluid: string;
            crystallized: Record<string, never>;
            sources: components["schemas"]["EventRefV1"][];
            /** @enum {string} */
            status: "inbox" | "confirmed";
        };
        ExperienceV1: {
            id: string;
            pattern: string;
            /** @enum {string} */
            verdict: "avoid" | "prefer" | "condition";
            condition: string;
            evidence: components["schemas"]["EventRefV1"][];
            /** @enum {string} */
            status: "quarantine" | "approved";
        };
        ConflictV1: {
            id: string;
            topic: string;
            /** @enum {string} */
            kind: "attention_node" | "knowledge_entry";
            left_ref: string;
            right_ref: string;
            detail: string;
            /** @enum {string} */
            status: "pending" | "resolved_keep_left" | "resolved_keep_right" | "resolved_merge" | "dismissed";
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "example-request",
         *       "expected_version": 1,
         *       "owner_project": "fixture-project"
         *     }
         */
        ConfirmKnowledgeRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            owner_project: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "example-request",
         *       "expected_version": 1,
         *       "owner_project": "fixture-project"
         *     }
         */
        ApproveExperienceRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            owner_project: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "example-request",
         *       "expected_version": 1,
         *       "decision": "merge"
         *     }
         */
        AdjudicateConflictRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            /** @enum {string} */
            decision: "keep_left" | "keep_right" | "merge" | "dismiss";
        };
        ConfirmKnowledgeResultV1: {
            /** @constant */
            schema_version: 1;
            entry: components["schemas"]["KnowledgeEntryV1"];
            version: number;
            owner_project: string;
        };
        ApproveExperienceResultV1: {
            /** @constant */
            schema_version: 1;
            experience: components["schemas"]["ExperienceV1"];
            version: number;
            owner_project: string;
        };
        AdjudicateConflictResultV1: {
            /** @constant */
            schema_version: 1;
            conflict: components["schemas"]["ConflictV1"];
            version: number;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "owner_project": "fixture-project",
         *       "target_project": "fixture-other"
         *     }
         */
        ShareMemoryRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            owner_project: string;
            target_project: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "owner_project": "fixture-project"
         *     }
         */
        DemoteMemoryRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            owner_project: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "project_id": "fixture-project"
         *     }
         */
        ReferenceKnowledgeRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            expected_version: number;
            project_id: string;
        };
        MemoryShareAuditV1: {
            owner_project: string;
            target_project: string;
            actor_id: string;
            /** @constant */
            actor_kind: "human";
            ts: number;
            request_id: string;
        };
        MemoryActionAuditV1: {
            action: string;
            actor_id: string;
            /** @constant */
            actor_kind: "human";
            ts: number;
            request_id: string;
            version: number;
        };
        KnowledgeVersionV1: {
            version: number;
            content: unknown;
            recorded_at: number;
        };
        StoredKnowledgeV1: {
            entry: components["schemas"]["KnowledgeEntryV1"];
            owner_project: string;
            version: number;
            created_at: number;
            updated_at: number;
            consolidated_at: number | null;
            crystallized_versions: components["schemas"]["KnowledgeVersionV1"][];
            shares: components["schemas"]["MemoryShareAuditV1"][];
            actions: components["schemas"]["MemoryActionAuditV1"][];
        };
        StoredExperienceV1: {
            /** @enum {string} */
            source_kind?: "swarm_artifact_accepted" | "relay_task_completed";
            experience: components["schemas"]["ExperienceV1"];
            owner_project: string;
            origin_event_id: string;
            version: number;
            created_at: number;
            updated_at: number;
            shares: components["schemas"]["MemoryShareAuditV1"][];
            actions: components["schemas"]["MemoryActionAuditV1"][];
        };
        KnowledgeReadResultV1: {
            /** @constant */
            schema_version: 1;
            knowledge: components["schemas"]["StoredKnowledgeV1"];
        };
        ExperienceReadResultV1: {
            /** @constant */
            schema_version: 1;
            experience: components["schemas"]["StoredExperienceV1"];
        };
        WorkFileFactV1: {
            source_path: string;
            /** Format: date-time */
            mtime: string | null;
            file_count: number;
            verified: boolean;
            reason?: string;
        };
        WorkHandoffV1: {
            content: string;
            /** Format: date-time */
            updated_at: string | null;
            /** @enum {string} */
            source: "" | "human" | "generated";
        };
        WorkV1: {
            id: string;
            platform: string;
            name: string;
            root: string;
            /** @enum {string} */
            kind: "folder" | "file";
            /** @enum {string} */
            source: "scan" | "json" | "registered";
            /** @enum {string} */
            attitude: "" | "continue" | "park" | "done";
            group: string;
            hidden: boolean;
            handoff: components["schemas"]["WorkHandoffV1"];
            files: components["schemas"]["WorkFileFactV1"];
            /** Format: date-time */
            updated_at: string | null;
            revision: number;
        };
        WorkDiscoveryFailureV1: {
            root: string;
            reason: string;
        };
        WorkPlatformStatV1: {
            platform: string;
            works: number;
            folders: number;
            handed_over: number;
            recent: number;
        };
        WorksSnapshotV1: {
            works: components["schemas"]["WorkV1"][];
            platforms: components["schemas"]["WorkPlatformStatV1"][];
            /** @enum {string} */
            status: "unknown" | "complete" | "partial" | "stale";
            /** Format: date-time */
            observed_at: string | null;
            failures: components["schemas"]["WorkDiscoveryFailureV1"][];
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "snapshot": {
         *         "works": [],
         *         "platforms": [],
         *         "status": "unknown",
         *         "observed_at": null,
         *         "failures": []
         *       }
         *     }
         */
        WorksSnapshotResultV1: {
            /** @constant */
            schema_version: 1;
            snapshot: components["schemas"]["WorksSnapshotV1"];
        };
        WorkResultV1: {
            /** @constant */
            schema_version: 1;
            work: components["schemas"]["WorkV1"];
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "roots": []
         *     }
         */
        WorksRefreshRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            /** @constant */
            expected_version: 1;
            roots?: string[];
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "content": "{\"works\":[]}"
         *     }
         */
        WorksDeliveryRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            /** @constant */
            expected_version: 1;
            content: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "expected_revision": 0,
         *       "attitude": "continue"
         *     }
         */
        WorkAttitudeRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            /** @constant */
            expected_version: 1;
            expected_revision: number;
            /** @enum {string} */
            attitude: "continue" | "park" | "done";
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "expected_revision": 0,
         *       "group": "research"
         *     }
         */
        WorkGroupRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            /** @constant */
            expected_version: 1;
            expected_revision: number;
            group: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "expected_revision": 0,
         *       "content": "fixture handoff"
         *     }
         */
        WorkHandoffRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            /** @constant */
            expected_version: 1;
            expected_revision: number;
            content: string;
        };
        /**
         * @example {
         *       "schema_version": 1,
         *       "request_id": "fixture-request",
         *       "expected_version": 1,
         *       "expected_revision": 0,
         *       "hidden": true
         *     }
         */
        WorkHiddenRequestV1: {
            /** @constant */
            schema_version: 1;
            request_id: string;
            /** @constant */
            expected_version: 1;
            expected_revision: number;
            hidden: boolean;
        };
        roleDefinition: {
            name: string;
            responsibilities: string;
            default_agent: string;
            default_model: string;
            /** @enum {unknown} */
            question_mode?: "disabled" | "native";
            /** @enum {unknown} */
            delegation_mode?: "disabled" | "native";
            /** @enum {unknown} */
            development_mode?: "disabled" | "project";
            skills: string[] | null;
            knowledge: string[] | null;
        };
        conversationDefinition: {
            title: string;
            role_id?: string;
        };
        /** @description Each action accepts only its documented fields. Mutations require the original canonical UUID; task/result paths are checked against current project directory permission. Trusted caller, native identities and context cannot be supplied here. */
        command: {
            /** @enum {unknown} */
            action: "status" | "capabilities" | "run.submit" | "run.show" | "run.export" | "role.list" | "role.show" | "role.create" | "role.update" | "role.archive" | "conversation.list" | "conversation.show" | "conversation.create" | "conversation.append" | "handoff.notify" | "controller.open" | "controller.show" | "controller.close" | "controller.recover" | "task.create" | "task.show" | "task.list" | "task.complete" | "task.result" | "worker.start" | "worker.show" | "worker.list" | "worker.read" | "worker.send" | "worker.stop" | "worker.release" | "question.answer" | "question.resume" | "request.show";
            project_id?: string;
            controller?: string;
            run_id?: string;
            task_id?: string;
            dispatch_id?: string;
            question_id?: string;
            /** Format: uuid */
            request_id?: string;
            workdir?: string;
            spec_file?: string;
            input_file?: string;
            result_file?: string;
            output_dir?: string;
            /**
             * @description run.export only. results (default) exports recorded task results; audit collects complete native sources.
             * @enum {unknown}
             */
            export_mode?: "results" | "audit";
            name?: string;
            agent?: string;
            model?: string;
            /**
             * @description Explicit new Run/Worker question mode. Native requires the fixed Pi questions-only contract; omitted retains the selected role default or disabled.
             * @enum {unknown}
             */
            question_mode?: "disabled" | "native";
            /**
             * @description Explicit new Run/Worker delegation mode. Native requires Pi and current project permission for swa_delegate; omitted retains the selected role default or disabled.
             * @enum {unknown}
             */
            delegation_mode?: "disabled" | "native";
            /**
             * @description Explicit new Run/Worker development mode. Project requires Pi or OpenCode, working Linux bubblewrap isolation and current project_shell directory permission; omitted retains the selected role default or disabled.
             * @enum {unknown}
             */
            development_mode?: "disabled" | "project";
            /** @description Absolute host-owned Morph descriptor path for an explicit Pi Run/Worker. Requires current project permission for morph_list_tools and morph_call_tool and the entire matching workspace; incompatible with roles, handoffs and other enabled tool modes. Descriptor and HostConfig remain outside the writable workspace. */
            morph_config?: string;
            /** @constant */
            source?: "transcript";
            cursor?: string;
            limit?: number;
            parent_task_id?: string;
            /** @enum {unknown} */
            handoff_mode?: "work" | "consult";
            /** @enum {unknown} */
            reply_mode?: "resume" | "poll";
            completion_criteria?: string[];
            role_id?: string;
            conversation_id?: string;
            revision?: number;
            role?: components["schemas"]["roleDefinition"];
            conversation?: components["schemas"]["conversationDefinition"];
            /** @description question.answer preserves the exact nonblank text and enforces a 32000 UTF-8 byte limit at execution; existing conversation text retains its normalization. */
            text?: string;
        } & (unknown & unknown & unknown);
        nativeError: {
            code: string;
            message: string;
            /** @constant */
            retryable: false;
            required_action: string;
            data?: unknown;
        };
        /** @description Result preserves actual native records and provenance. HTTP transport success is insufficient for mutation success; unknown outcomes retain the original request and resource ownership. */
        envelope: {
            ok: boolean;
            request_id?: string;
            runtime_id?: string;
            authority_domain?: string;
            controller?: string;
            run_id?: string;
            task_id?: string;
            dispatch_id?: string;
            question_id?: string;
            result?: unknown;
            error?: components["schemas"]["nativeError"];
        };
        /** @description Contents of the approved task specification file selected by command.spec_file, not inline HTTP command fields. max_workers is the authorized task Worker quota; its maximum is the JavaScript safe-integer precision boundary, not a runtime capacity guarantee. Current permissions, reservations, resources and complete-inventory limits are checked separately. */
        taskSpec: {
            goal: string;
            source_repo: string;
            source_revision: string;
            success_criteria: string[];
            max_workers: number;
            /** @description Number of initially requested Workers that must be created before automatic Run completion; defaults to one and cannot exceed max_workers. Actual recursive descendants are always included. */
            initial_workers?: number;
            conversation_id?: string;
            role_id?: string;
            role_revision?: number;
            context?: {
                references?: {
                    material_id?: string;
                    revision?: number;
                }[] | null;
                files?: string[] | null;
            } | null;
        };
        registeredAgent: {
            /** @constant */
            schema: "swa.registered-agent.v1";
            id: string;
            adapter: string;
            /** @enum {unknown} */
            execution_mode: "structured" | "terminal";
            /** @constant */
            registered: true;
            source: {
                /** @enum {unknown} */
                kind: "structured-registry" | "tui-launcher";
            };
            source_revision: string;
            registry: {
                /** @constant */
                orca_version: "1.4.230";
                artifact_sha256: string;
            };
            runtime: {
                runtime_id: string;
                authority_domain: string;
                data_root: string;
                install_root: string;
            };
        } & ({
            /** @constant */
            execution_mode?: "structured";
            source?: {
                /** @constant */
                kind?: "structured-registry";
            };
        } | {
            /** @constant */
            execution_mode?: "terminal";
            source?: {
                /** @constant */
                kind?: "tui-launcher";
            };
        });
        settingsSource: {
            /** @enum {unknown} */
            kind: "native" | "orca-profile";
            path?: string;
            revision?: number;
        };
        observation: {
            /** @enum {unknown} */
            status: "available" | "unavailable" | "unknown";
            reason: string;
            source: string;
            checked_at?: string;
            /** @enum {unknown} */
            basis?: "declaration" | "configuration" | "probe" | "session" | "result";
        };
        installedObservation: {
            /** @enum {unknown} */
            status: "available" | "unavailable" | "unknown";
            reason: string;
            source: string;
            checked_at?: string;
            /** @enum {unknown} */
            basis?: "declaration" | "configuration" | "probe" | "session" | "result";
            executable?: string;
            version?: string;
        };
        configuredObservation: {
            /** @enum {unknown} */
            status: "available" | "unavailable" | "unknown";
            reason: string;
            source: string;
            checked_at?: string;
            /** @enum {unknown} */
            basis?: "declaration" | "configuration" | "probe" | "session" | "result";
            model?: string;
            provider?: string;
            account_source?: string;
        };
        modelCatalogObservation: {
            /** @enum {unknown} */
            origin: "live-session" | "probe" | "configured" | "unknown";
            /** @enum {unknown} */
            availability: "verified" | "unverified";
            models: {
                id: string;
                label: string;
                provider?: string;
            }[];
            /** Format: date-time */
            observed_at?: string;
        };
        requirements: {
            settings_revision: number;
            allow_directory: boolean;
            allowed_subdirs: string[] | null;
            allowed_actions: string[] | null;
            allowed_tools: string[] | null;
            grant_actions: string[] | null;
            external_model_cli: string;
            external_model_clis?: string[];
            allow_agent_control: boolean;
        };
        capabilities: {
            /** @constant */
            schema: "swa.capabilities.v1";
            source_revision: string;
            registry: {
                /** @constant */
                orca_version: "1.4.230";
                artifact_sha256: string;
            };
            discovery: {
                /** @constant */
                host: "local";
                platform: string;
                observed_at: string;
                settings_source: components["schemas"]["settingsSource"];
            };
            agents: {
                id: string;
                adapter: string;
                /** @constant */
                execution_mode: "structured";
                registered: components["schemas"]["observation"];
                enabled: components["schemas"]["observation"];
                installed: components["schemas"]["installedObservation"];
                configured: components["schemas"]["configuredObservation"];
                launchable: components["schemas"]["observation"];
                authenticated?: components["schemas"]["observation"];
                model_catalog?: components["schemas"]["modelCatalogObservation"];
                declared_features?: {
                    images: boolean;
                    model_switch: boolean;
                    /** @enum {unknown} */
                    steering: "inject" | "queue";
                };
                control: {
                    start: components["schemas"]["observation"];
                    send: components["schemas"]["observation"];
                    read: components["schemas"]["observation"];
                    stop: components["schemas"]["observation"];
                    resume: components["schemas"]["observation"];
                    tools: components["schemas"]["observation"];
                    images?: components["schemas"]["observation"];
                    model_switch?: components["schemas"]["observation"];
                    questions?: components["schemas"]["observation"];
                    delegation?: components["schemas"]["observation"];
                    development?: components["schemas"]["observation"];
                };
                requirements: components["schemas"]["requirements"];
            }[];
        };
        nativeConfigurationSource: {
            path: string;
            version: string;
        };
        nativePiLaunchPolicy: {
            /** @constant */
            schema: "swa.native-launch.v1";
            account: {
                /** @constant */
                kind: "pi-native-api-key";
                provider: string;
                source_home: string;
                auth_source: components["schemas"]["nativeConfigurationSource"];
                models_source: components["schemas"]["nativeConfigurationSource"] | null;
                private_home: string;
                model_target: {
                    model_id: string;
                    /** @enum {unknown} */
                    api: "openai-responses" | "openai-completions" | "azure-openai-responses";
                    /** Format: uri */
                    base_url: string;
                };
            };
            tools: {
                /** @constant */
                mode: "disabled";
                /** @constant */
                native_contract: "pi-cli-1.0.1";
            };
        };
        nativeOpenCodeLaunchPolicy: {
            /** @constant */
            schema: "swa.native-launch.v1";
            account: {
                /** @constant */
                kind: "opencode-native-api-key";
                /** @constant */
                provider: "deepseek";
                source_home: string;
                auth_source: components["schemas"]["nativeConfigurationSource"];
                config_source: components["schemas"]["nativeConfigurationSource"];
                database_source: components["schemas"]["nativeConfigurationSource"];
                credential_id: string;
                credential_updated_at: number;
                private_root: string;
                model_target: {
                    /** @constant */
                    model_id: "deepseek-v4-pro";
                    /** @constant */
                    api: "opencode-native-deepseek";
                    /** @constant */
                    base_url: "https://api.deepseek.com";
                };
            } | {
                /** @constant */
                kind: "opencode-native-stepfun-api-key";
                /** @constant */
                provider: "stepfun";
                source_home: string;
                auth_source: components["schemas"]["nativeConfigurationSource"];
                config_source: components["schemas"]["nativeConfigurationSource"];
                database_source: components["schemas"]["nativeConfigurationSource"];
                credential_id: string;
                credential_updated_at: number;
                private_root: string;
                model_target: {
                    /** @constant */
                    model_id: "step-3.5-flash";
                    /** @constant */
                    api: "openai-completions";
                    /** @constant */
                    base_url: "https://api.stepfun.com/v1";
                };
            };
            tools: {
                /** @constant */
                mode: "disabled";
                /** @constant */
                native_contract: "opencode-cli-2.0.31";
            } | {
                /** @constant */
                mode: "project";
                /** @constant */
                native_contract: "opencode-cli-2.0.31";
                /** @constant */
                allowed: [
                    "shell"
                ];
                shell: components["schemas"]["nativeConfigurationSource"];
            };
        };
        nativeCodexLaunchPolicy: {
            /** @constant */
            schema: "swa.native-launch.v1";
            account: {
                /** @constant */
                kind: "codex-native-api-key";
                /** @constant */
                provider: "openai";
                source_home: string;
                auth_source: components["schemas"]["nativeConfigurationSource"];
                catalog_source: components["schemas"]["nativeConfigurationSource"];
                private_root: string;
                model_target: {
                    /** @constant */
                    model_id: "gpt-5.5";
                    /** @constant */
                    api: "openai-responses";
                    /** @constant */
                    base_url: "https://api.openai.com/v1";
                };
            };
            tools: {
                /** @constant */
                mode: "disabled";
                /** @constant */
                native_contract: "codex-cli-0.163.0";
            };
        };
        nativeClaudeLaunchPolicy: {
            /** @constant */
            schema: "swa.native-launch.v1";
            account: {
                /** @constant */
                kind: "claude-native-api-key";
                /** @constant */
                provider: "anthropic";
                source_home: string;
                auth_source: components["schemas"]["nativeConfigurationSource"];
                private_root: string;
                model_target: {
                    /** @constant */
                    model_id: "claude-opus-5";
                    /** @constant */
                    api: "anthropic-messages";
                    /** @constant */
                    base_url: "https://api.anthropic.com";
                };
            };
            tools: {
                /** @constant */
                mode: "disabled";
                /** @constant */
                native_contract: "claude-cli-2.1.284-sdk-0.3.284";
            };
        };
        nativePiPerSessionLaunchPolicy: {
            /** @constant */
            schema: "swa.native-launch.v1";
            account: {
                /** @constant */
                kind: "pi-native-api-key-per-session";
                provider: string;
                source_home: string;
                auth_source: components["schemas"]["nativeConfigurationSource"];
                models_source: components["schemas"]["nativeConfigurationSource"] | null;
                private_root: string;
                model_target: {
                    model_id: string;
                    /** @enum {unknown} */
                    api: "openai-responses" | "openai-completions" | "azure-openai-responses";
                    /** Format: uri */
                    base_url: string;
                };
            };
            tools: {
                /** @constant */
                mode: "disabled";
                /** @constant */
                native_contract: "pi-cli-1.0.1";
            } | {
                /** @constant */
                mode: "morph";
                /** @constant */
                native_contract: "pi-cli-1.0.1";
                extension: components["schemas"]["nativeConfigurationSource"];
                morph_config: components["schemas"]["nativeConfigurationSource"];
                morph_host_config: components["schemas"]["nativeConfigurationSource"];
                /** @constant */
                allowed: [
                    "morph_list_tools",
                    "morph_call_tool"
                ];
            } | {
                /** @constant */
                mode: "questions-only";
                /** @constant */
                native_contract: "pi-cli-1.0.1";
                extension: components["schemas"]["nativeConfigurationSource"];
                allowed: "swa_ask"[];
            } | {
                /** @constant */
                mode: "collaboration";
                /** @constant */
                native_contract: "pi-cli-1.0.1";
                extension: components["schemas"]["nativeConfigurationSource"];
                allowed: [
                    "swa_delegate"
                ] | [
                    "swa_ask",
                    "swa_delegate"
                ];
            } | {
                /** @constant */
                mode: "project";
                /** @constant */
                native_contract: "pi-cli-1.0.1";
                extension: components["schemas"]["nativeConfigurationSource"];
                allowed: [
                    "bash"
                ] | [
                    "bash",
                    "swa_ask"
                ] | [
                    "bash",
                    "swa_delegate"
                ] | [
                    "bash",
                    "swa_ask",
                    "swa_delegate"
                ];
            };
        };
        nativeLaunchPolicy: components["schemas"]["nativePiLaunchPolicy"] | components["schemas"]["nativeOpenCodeLaunchPolicy"] | components["schemas"]["nativeCodexLaunchPolicy"] | components["schemas"]["nativeClaudeLaunchPolicy"] | components["schemas"]["nativePiPerSessionLaunchPolicy"];
        agentSelection: {
            agent_id: string;
            adapter: string;
            /** @constant */
            execution_mode: "structured";
            executable: string;
            version: string;
            model: string;
            provider: string;
            external_target: string;
            settings_source: components["schemas"]["settingsSource"];
            settings_revision: number;
            configuration_version: string;
            native_launch: components["schemas"]["nativeLaunchPolicy"];
        };
    };
    responses: {
        /** @description Invalid command, current permission denial, version conflict or unavailable dependency. No execution retry. */
        S2CommandError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorV1"];
            };
        };
    };
    parameters: {
        /** @description Required for authenticated human writes */
        ProductCSRF: string;
        JudgmentProjectID: string;
        JudgmentDecisionID: string;
        JudgmentRuleID: string;
        JudgmentQuestionType: "choice" | "score" | "truth";
        S2ID: string;
        S2Revision: number;
        /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
        S2Idempotency: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    executeOrcaCommand: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for mutation and original request lookup */
                "Idempotency-Key"?: string;
                /** @description Required for an authenticated human POST; project Agent bearer requests use their current scoped grant */
                "X-CSRF-Token"?: string;
            };
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["command"];
            };
        };
        responses: {
            /** @description Actual native result and identities */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["envelope"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            /** @description Actual native refusal or unknown outcome */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["envelope"] | components["schemas"]["ErrorV1"];
                };
            };
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    getOpenVikingStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Unconfigured or verified connected state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpenVikingStatusV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    listOpenVikingSubmissions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Actual local records including unknown outcomes */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpenVikingSubmissionListV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    submitOpenVikingSource: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OpenVikingSubmitRequestV1"];
            };
        };
        responses: {
            /** @description Submission recorded; completed requires actual task observation */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpenVikingSubmissionResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    refreshOpenVikingSubmission: {
        parameters: {
            query?: never;
            header: {
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Actual task observation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpenVikingSubmissionResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    searchOpenVikingProject: {
        parameters: {
            query?: never;
            header: {
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    query: string;
                };
            };
        };
        responses: {
            /** @description Verified project resources; out-of-scope results fail the whole response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        schema_version: 1;
                        items: components["schemas"]["OpenVikingHitV1"][];
                    };
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    readOpenVikingProjectContent: {
        parameters: {
            query?: never;
            header: {
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    uri: string;
                    /** @enum {integer} */
                    level: 0 | 1 | 2;
                };
            };
        };
        responses: {
            /** @description Actual string content from the selected tier */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        schema_version: 1;
                        content: string;
                    };
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    captureCompletionExperience: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CaptureCompletionExperienceRequestV1"];
            };
        };
        responses: {
            /** @description Original or newly persisted quarantine candidate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExperienceReadResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    readExperienceEvidence: {
        parameters: {
            query: {
                /** @description Actual registered LocalProject.ID */
                project_id: string;
            };
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Safe references without original source payloads */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExperienceEvidenceResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    readOpportunityAdmission: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Persisted admission and any original draft reference */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdmissionResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    revokeOpportunityAdmission: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RevokeAdmissionRequestV1"];
            };
        };
        responses: {
            /** @description Persisted revoked admission */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdmissionResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    readAttentionTasteProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current actual profile or configured false and profile null */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TasteProfileResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    updateAttentionTasteProfile: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateTasteProfileRequestV1"];
            };
        };
        responses: {
            /** @description Persisted current profile */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TasteProfileResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    captureJudgmentSnapshot: {
        parameters: {
            query?: never;
            header: {
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    files: string[];
                };
            };
        };
        responses: {
            /** @description Snapshot with an empty public root */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JudgmentSnapshotResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    readJudgmentPolicy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
                question_type: components["parameters"]["JudgmentQuestionType"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current fixed policy */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JudgmentPolicyResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    updateJudgmentPolicy: {
        parameters: {
            query?: never;
            header: {
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
                question_type: components["parameters"]["JudgmentQuestionType"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: number;
                    policy: components["schemas"]["JudgmentPolicyV1"];
                };
            };
        };
        responses: {
            /** @description Saved policy */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JudgmentPolicyResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    submitProjectJudgment: {
        parameters: {
            query?: never;
            header: {
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JudgmentRequestV1"];
            };
        };
        responses: {
            /** @description Actual result with source and usage status */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JudgmentResultEnvelopeV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    readProjectJudgment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
                decision_id: components["parameters"]["JudgmentDecisionID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Original judgment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JudgmentResultEnvelopeV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    readJudgmentFeedback: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
                decision_id: components["parameters"]["JudgmentDecisionID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Persisted feedback list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JudgmentFeedbackListV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    recordJudgmentFeedback: {
        parameters: {
            query?: never;
            header: {
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
                decision_id: components["parameters"]["JudgmentDecisionID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JudgmentFeedbackRequestV1"];
            };
        };
        responses: {
            /** @description Persisted feedback */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JudgmentFeedbackResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    listJudgmentDelegationRules: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Actual versioned rules */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DelegationRuleListV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    readJudgmentDelegationRule: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
                rule_id: components["parameters"]["JudgmentRuleID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Versioned rule */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DelegationRuleResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    updateJudgmentDelegationRule: {
        parameters: {
            query?: never;
            header: {
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
                rule_id: components["parameters"]["JudgmentRuleID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: number;
                    rule: components["schemas"]["DelegationRuleV1"];
                };
            };
        };
        responses: {
            /** @description Saved rule */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DelegationRuleResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    changeJudgmentDelegationState: {
        parameters: {
            query?: never;
            header: {
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
                rule_id: components["parameters"]["JudgmentRuleID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: number;
                    state: string;
                };
            };
        };
        responses: {
            /** @description Saved rule state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DelegationRuleResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    evaluateJudgmentDelegation: {
        parameters: {
            query?: never;
            header: {
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
                rule_id: components["parameters"]["JudgmentRuleID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    rule_revision: number;
                    opportunity_id: string;
                    opportunity_revision: number;
                };
            };
        };
        responses: {
            /** @description Actual bound judgment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JudgmentResultEnvelopeV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    admitDelegatedJudgment: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
            };
            path: {
                project_id: components["parameters"]["JudgmentProjectID"];
                decision_id: components["parameters"]["JudgmentDecisionID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @constant */
                    schema_version: 1;
                    request_id: string;
                    expected_opportunity_version: number;
                };
            };
        };
        responses: {
            /** @description Original admission and draft proposal references */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DelegatedAdmissionResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            default: components["responses"]["S2CommandError"];
        };
    };
    prepareRelayIntent: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RelayConfirmRequestV1"];
            };
        };
        responses: {
            /** @description Original initialization receipt and current ready task */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayActionResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
        };
    };
    buildWorkspaceContextPacket: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["S2ContextPacketRequestV1"];
            };
        };
        responses: {
            /** @description Persisted immutable context packet */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2ContextPacketResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            422: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
        };
    };
    readWorkspaceContextPacket: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Original immutable packet */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2ContextPacketResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
        };
    };
    bindWorkspaceSession: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["S2SessionBindingRequestV1"];
            };
        };
        responses: {
            /** @description Persisted current owned binding */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2SessionBindingResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
        };
    };
    listSwarmWorkItems: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Actual work items */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmWorkItemListV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
        };
    };
    addSwarmWorkItem: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SwarmWorkItemRequestV1"];
            };
        };
        responses: {
            /** @description Persisted work item */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmWorkItemEnvelopeV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
        };
    };
    readSwarmMissionDAG: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Actual mission task DAG and separate execution facts */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmMissionDAGV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
        };
    };
    readSwarmTimeline: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Safe committed timeline references */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmTimelineListV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
        };
    };
    recoverSwarmMission: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SwarmTransitionRequestV1"];
            };
        };
        responses: {
            /** @description Current reconciled mission */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmMissionEnvelopeV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
        };
    };
    readSwarmArtifact: {
        parameters: {
            query: {
                mission_id: string;
                version?: number;
            };
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Actual artifact version */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmArtifactEnvelopeV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
        };
    };
    readSwarmArtifactDiff: {
        parameters: {
            query: {
                mission_id: string;
                version?: number;
            };
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Verified artifact diff */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmArtifactDiffV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
        };
    };
    rejectSwarmArtifact: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SwarmRejectRequestV1"];
            };
        };
        responses: {
            /** @description Current artifact with human review */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmArtifactEnvelopeV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
        };
    };
    readRepositoryContextMap: {
        parameters: {
            query: {
                purpose: string;
                root: components["schemas"]["RepositoryRelativeRootV1"][];
                max_files: number;
                max_bytes: number;
                max_results: number;
                max_depth: number;
            };
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current map and explicit coverage gaps */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RepositoryResultEnvelopeV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
        };
    };
    searchRepositoryContextCode: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RepositorySearchRequestV1"];
            };
        };
        responses: {
            /** @description Bounded symbols and evidence */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RepositoryResultEnvelopeV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
        };
    };
    queryRepositoryContextImpact: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RepositoryImpactRequestV1"];
            };
        };
        responses: {
            /** @description Bounded relationships with source evidence and gaps */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RepositoryResultEnvelopeV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
        };
    };
    updateRepositoryContextIndex: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RepositoryIndexRequestV1"];
            };
        };
        responses: {
            /** @description Verified index generation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RepositoryIndexEnvelopeV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
        };
    };
    refreshRepositoryContextMap: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RepositoryQueryRequestV1"];
            };
        };
        responses: {
            /** @description Verified map generation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RepositoryIndexEnvelopeV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
            503: components["responses"]["S2CommandError"];
        };
    };
    listWorkspaceGoals: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Goals */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2GoalListV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
        };
    };
    createWorkspaceGoal: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["S2GoalRequestV1"];
            };
        };
        responses: {
            /** @description Persisted goal */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2GoalResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
        };
    };
    readWorkspaceGoal: {
        parameters: {
            query?: {
                revision?: components["parameters"]["S2Revision"];
            };
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Goal */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2GoalResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
        };
    };
    reviseWorkspaceGoal: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["S2GoalRequestV1"];
            };
        };
        responses: {
            /** @description Persisted goal */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2GoalResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
        };
    };
    readWorkspaceProposal: {
        parameters: {
            query?: {
                revision?: components["parameters"]["S2Revision"];
            };
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Proposal */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2ProposalResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
        };
    };
    reviseWorkspaceProposal: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["S2ProposalRequestV1"];
            };
        };
        responses: {
            /** @description Persisted proposal */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2ProposalResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
        };
    };
    declineWorkspaceProposal: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubmitProposalRequestV1"];
            };
        };
        responses: {
            /** @description Persisted proposal */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2ProposalResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
        };
    };
    readWorkspaceApproval: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Approval */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2ApprovalResultV1"];
                };
            };
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
        };
    };
    completeWorkspaceApproval: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RevokeApprovalRequestV1"];
            };
        };
        responses: {
            /** @description Persisted approval */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2ApprovalResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
        };
    };
    expireWorkspaceApproval: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path: {
                id: components["parameters"]["S2ID"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RevokeApprovalRequestV1"];
            };
        };
        responses: {
            /** @description Persisted approval */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2ApprovalResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
        };
    };
    listRelayTaskFacts: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Safe facts */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayFactsV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Permission denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Task unavailable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Runtime facts capability unavailable */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Evidence or provider unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listRelaySessionEvents: {
        parameters: {
            query?: {
                task_id?: string;
                start?: string;
                end?: string;
                page?: number;
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Local pending admissions and explicit coverage, independent of cognitive snapshot values */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "events": [
                     *         {
                     *           "event_id": "ae6c15f2-394b-402c-9f53-b75fc2cd0783",
                     *           "kind": "edit_file",
                     *           "topic": "relay:cf1497b0-e092-43c0-80a9-33449bb57a40",
                     *           "tokens": null,
                     *           "scope": "public-project",
                     *           "ts": "2026-10-14T01:00:01Z"
                     *         }
                     *       ],
                     *       "coverage": [
                     *         {
                     *           "task_id": "cf1497b0-e092-43c0-80a9-33449bb57a40",
                     *           "terminal_id": "c48d6c05-3b58-4bdc-8a7b-46a471612a0b",
                     *           "worktree_id": "0623c675-ddb7-4d62-bd02-831f6cb6d51d",
                     *           "project_id": "public-project",
                     *           "status": "partial",
                     *           "gap": "prefix_unverified",
                     *           "lines": 2,
                     *           "projected": 2,
                     *           "duplicates": 0,
                     *           "unknown": 0,
                     *           "errors": 0,
                     *           "unknown_tokens": 2,
                     *           "remaining_bytes": 0,
                     *           "tail_bytes": 0,
                     *           "snapshot_complete": true,
                     *           "session_complete": false
                     *         }
                     *       ],
                     *       "total": 1,
                     *       "page": 1,
                     *       "page_size": 50
                     *     }
                     */
                    "application/json": components["schemas"]["RelaySessionEventsV1"];
                };
            };
            /** @description Guard, invalid query or unavailable read; no Agent action or automatic retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, invalid query or unavailable read; no Agent action or automatic retry */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, invalid query or unavailable read; no Agent action or automatic retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, invalid query or unavailable read; no Agent action or automatic retry */
            405: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, invalid query or unavailable read; no Agent action or automatic retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    reconcileRelayTaskEvents: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RelayEmptyRequestV1"];
            };
        };
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayTaskResultV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listRelayProjects: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayProjectsV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listRelayAgents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayAgentsV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listRelayTasks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayTasksV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getRelayTask: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayTaskResultV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listRelayTaskEvents: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayEventsV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listRelayTaskReceipts: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayReceiptsV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    createRelayIntent: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RelayIntentRequestV1"];
            };
        };
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayTaskResultV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    confirmRelayIntent: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RelayConfirmRequestV1"];
            };
        };
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayActionResultV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    sendRelayTask: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RelaySendRequestV1"];
            };
        };
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayActionResultV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    readRelayTask: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RelayEmptyRequestV1"];
            };
        };
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayActionResultV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    stopRelayTask: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RelayEmptyRequestV1"];
            };
        };
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayActionResultV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    resumeRelayTask: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RelayEmptyRequestV1"];
            };
        };
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayActionResultV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    transitionRelayTask: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RelayTransitionRequestV1"];
            };
        };
        responses: {
            /** @description Derived relay state */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RelayTaskResultV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Guard, permission, conflict or unavailable result; no launch retry */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getWorkbenchHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Confirmed snapshot view */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkbenchHealthV1"];
                };
            };
            /** @description Invalid filter or pagination */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Local human session required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Published snapshot unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getWorkbenchToday: {
        parameters: {
            query?: {
                source?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Confirmed snapshot view */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkbenchTodayV1"];
                };
            };
            /** @description Invalid filter or pagination */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Local human session required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Published snapshot unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getWorkbenchFocus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Confirmed snapshot view */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkbenchFocusV1"];
                };
            };
            /** @description Invalid filter or pagination */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Local human session required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Published snapshot unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getWorkbenchEvidence: {
        parameters: {
            query?: {
                topic?: string;
                page?: number;
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Confirmed snapshot view */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkbenchEvidenceV1"];
                };
            };
            /** @description Invalid filter or pagination */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Local human session required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Published snapshot unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getWorkbenchAgents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Confirmed snapshot view */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkbenchAgentsV1"];
                };
            };
            /** @description Invalid filter or pagination */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Local human session required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Published snapshot unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getWorkbenchEvents: {
        parameters: {
            query?: {
                topic?: string;
                kind?: string;
                source?: string;
                start?: string;
                end?: string;
                page?: number;
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Confirmed snapshot view */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkbenchEventsV1"];
                };
            };
            /** @description Invalid filter or pagination */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Local human session required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Published snapshot unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getWorkbenchFilters: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Confirmed snapshot view */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkbenchFiltersV1"];
                };
            };
            /** @description Invalid filter or pagination */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Local human session required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Published snapshot unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    discoverSourceCollections: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DiscoverSourceCollectionsRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SourceCollectionListV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listGitHubRepositories: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Durable cached observations; no automatic permission expansion */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GitHubRepositoryListV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    syncGitHubRepositories: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SyncGitHubRepositoriesRequestV1"];
            };
        };
        responses: {
            /** @description Durable cached observations; no automatic permission expansion */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GitHubRepositoryListV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    placeGitHubRepository: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PlaceGitHubRepositoryRequestV1"];
            };
        };
        responses: {
            /** @description Durable cached observations; no automatic permission expansion */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GitHubRepositoryResultV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error; never replay unknown effects automatically */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    probeNativeCLI: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DiscoverNativeSessionsRequestV1"];
            };
        };
        responses: {
            /** @description Current scoped service result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NativeSessionResultV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listSourceCollections: {
        parameters: {
            query: {
                platform: string;
                owner_id: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current scoped service result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SourceCollectionListV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    issueProjectAgentToken: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["IssueProjectAgentTokenRequestV1"];
            };
        };
        responses: {
            /** @description Current scoped service result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectAgentTokenResultV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    discoverNativeSessions: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DiscoverNativeSessionsRequestV1"];
            };
        };
        responses: {
            /** @description Current scoped service result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NativeSessionListV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    readNativeContext: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                session_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current scoped service result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NativeContextListV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable error; unknown effects are not replayed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listTrackingSources: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingSourceListV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    bindTrackingSource: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BindTrackingSourceRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingSourceResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getTrackingSource: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingSourceResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    syncTrackingSource: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SyncTrackingSourceRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingSourceResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    recommendSourceItems: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RecommendSourceItemsRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingSourceResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    selectSourceItems: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SelectSourceItemsRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingSourceResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listRegisteredProjects: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Persisted observations with explicit unknown, partial or stale status */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegisteredProjectDiscoveryResultV1"];
                };
            };
            /** @description Invalid command */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human session or CSRF required; Agent credentials rejected */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Cache persistence failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Discovery service is not assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Discovery source unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    refreshRegisteredProjects: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshRegisteredProjectsRequestV1"];
            };
        };
        responses: {
            /** @description Persisted observations with explicit unknown, partial or stale status */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegisteredProjectDiscoveryResultV1"];
                };
            };
            /** @description Invalid command */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human session or CSRF required; Agent credentials rejected */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Cache persistence failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Discovery service is not assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Discovery source unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    setRegisteredProjectMetadata: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetRegisteredProjectMetadataRequestV1"];
            };
        };
        responses: {
            /** @description Updated project summary with durable human metadata */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectSummaryResultV1"];
                };
            };
            /** @description Invalid command or unsupported fields */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human session and CSRF required; Agent credentials rejected */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Project is absent from the cached registered observations */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Manual metadata revision changed; reload before saving */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Persistence failed */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Metadata service is not assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listLocalProjects: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocalProjectListV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    registerLocalProject: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterLocalProjectRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocalProjectResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    discoverLocalProjects: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DiscoverLocalProjectsRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocalProjectCandidateListV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    setLocalProjectSettings: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LocalProjectSettingsRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocalProjectResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    grantLocalProjectAgent: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GrantLocalProjectAgentRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocalProjectGrantResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    revokeLocalProjectAgent: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RevokeLocalProjectAgentRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocalProjectGrantResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    readLocalProjectContext: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReadLocalProjectContextRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocalContextPacketV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listNativeSessions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NativeSessionListV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    startNativeSession: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NativeSessionRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NativeSessionResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    resumeNativeSession: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token"?: string;
            };
            path: {
                id: string;
                session_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NativeSessionRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NativeSessionResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    sendNativeMessage: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token"?: string;
            };
            path: {
                id: string;
                session_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NativeMessageRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NativeObservationResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    stopNativeSession: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token"?: string;
            };
            path: {
                id: string;
                session_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JobCommandV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NativeObservationResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    observeNativeSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                session_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NativeObservationResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    searchPapers: {
        parameters: {
            query: {
                q: string;
                /** @description Provider defaults to crossref when omitted. */
                provider?: "crossref" | "europepmc" | "arxiv";
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ephemeral metadata results; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaperSearchResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getProjectProgress: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectProgressResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    setProjectProgress: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetProgressRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectProgressResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    inferProjectProgress: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InferProgressRequestV1"];
            };
        };
        responses: {
            /** @description Current service result; unknown and failure states remain explicit */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectProgressResultV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Actionable structured error; no automatic replay of unknown effects */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listLocalAgents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Cached inventory; an empty array means no observed entries */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocalAgentListV1"];
                };
            };
            /** @description Human session required; Agent bearer grants no access */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Inventory query failed; do not substitute an empty array */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Local Agent inventory is not assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "local Agent inventory is not assembled",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "start_a_server_with_local_agent_inventory"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description S0 real read view; never populated from fixtures */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "status": "ok",
                     *       "service": "astrocyte"
                     *     }
                     */
                    "application/json": components["schemas"]["HealthV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getFoundation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description S0 real read view; never populated from fixtures */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "stage": "S0",
                     *       "capabilities": {
                     *         "imports": false,
                     *         "approvals": false,
                     *         "execution": false,
                     *         "native_resume": false,
                     *         "handoff": false
                     *       },
                     *       "storage": {
                     *         "engine": "sqlite",
                     *         "schema_version": 1
                     *       },
                     *       "fixture": false
                     *     }
                     */
                    "application/json": components["schemas"]["FoundationV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listMaterials: {
        parameters: {
            query?: {
                /** @description Opaque continuation cursor */
                cursor?: string;
                /** @description Maximum returned items */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description S0 real read view; never populated from fixtures */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "items": [],
                     *       "next_cursor": null
                     *     }
                     */
                    "application/json": components["schemas"]["MaterialListV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listOpportunitys: {
        parameters: {
            query?: {
                /** @description Opaque continuation cursor */
                cursor?: string;
                /** @description Maximum returned items */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description S0 real read view; never populated from fixtures */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "items": [],
                     *       "next_cursor": null
                     *     }
                     */
                    "application/json": components["schemas"]["OpportunityListV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    createOpportunity: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OpportunityRequestV1"];
            };
        };
        responses: {
            /** @description Attention result */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpportunityDetailV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listProjects: {
        parameters: {
            query?: {
                /** @description Opaque continuation cursor */
                cursor?: string;
                /** @description Maximum returned items */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description S0 real read view; never populated from fixtures */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "items": [],
                     *       "next_cursor": null
                     *     }
                     */
                    "application/json": components["schemas"]["ProjectListV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    registerProject: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "schema_version": 1,
                 *       "request_id": "fixture-request",
                 *       "expected_version": 1,
                 *       "name": "Fixture only",
                 *       "environment_id": "fixture",
                 *       "root_path": "/fixture"
                 *     }
                 */
                "application/json": components["schemas"]["RegisterProjectRequestV1"];
            };
        };
        responses: {
            /** @description Future capability contract; NOT implemented in S0 */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "id": "fixture-resource",
                     *       "version": 1
                     *     }
                     */
                    "application/json": components["schemas"]["VersionResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listProposals: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description S0 real read view; never populated from fixtures */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "items": [],
                     *       "next_cursor": null
                     *     }
                     */
                    "application/json": components["schemas"]["ProposalListV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    createWorkspaceProposal: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["S2ProposalRequestV1"];
            };
        };
        responses: {
            /** @description Persisted proposal */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2ProposalResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
        };
    };
    listSessions: {
        parameters: {
            query?: {
                /** @description Opaque continuation cursor */
                cursor?: string;
                /** @description Maximum returned items */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description S0 real read view; never populated from fixtures */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "items": [],
                     *       "next_cursor": null
                     *     }
                     */
                    "application/json": components["schemas"]["SessionListV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listMissions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Actual missions readable under current project permissions */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "items": [],
                     *       "next_cursor": null
                     *     }
                     */
                    "application/json": components["schemas"]["SwarmMissionListV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    createSwarmMission: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped immutable operation. Human writes also require existing session CSRF. Request ID is transport trace and may differ on replay. */
                "Idempotency-Key": components["parameters"]["S2Idempotency"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SwarmCreateRequestV1"];
            };
        };
        responses: {
            /** @description Actual approved mission */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmMissionEnvelopeV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
        };
    };
    getMission: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current authorized mission and safe execution references */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmMissionDetailV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "not_found",
                     *         "message": "Resource not found",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    importMaterial: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "schema_version": 1,
                 *       "request_id": "fixture-request",
                 *       "expected_version": 1,
                 *       "source_locator": "arxiv:fixture",
                 *       "source_key": "fixture-source",
                 *       "kind": "paper",
                 *       "content_digest": "fixture-digest",
                 *       "export_text": "Fixture only"
                 *     }
                 */
                "application/json": components["schemas"]["ImportMaterialRequestV1"];
            };
        };
        responses: {
            /** @description Future capability contract; NOT implemented in S0 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "job_id": "fixture-job",
                     *       "status": "queued"
                     *     }
                     */
                    "application/json": components["schemas"]["ImportJobV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    reviewOpportunity: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "schema_version": 1,
                 *       "request_id": "fixture-request",
                 *       "expected_version": 1,
                 *       "feedback": "later",
                 *       "reason": "Fixture only"
                 *     }
                 */
                "application/json": components["schemas"]["ReviewOpportunityRequestV1"];
            };
        };
        responses: {
            /** @description Future capability contract; NOT implemented in S0 */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "id": "fixture-resource",
                     *       "version": 1
                     *     }
                     */
                    "application/json": components["schemas"]["VersionResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "not_found",
                     *         "message": "Resource not found",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    admitOpportunity: {
        parameters: {
            query?: never;
            header: {
                /** @description Required for authenticated human writes */
                "X-CSRF-Token": components["parameters"]["ProductCSRF"];
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdmitOpportunityRequestV1"];
            };
        };
        responses: {
            /** @description Original persisted admission and any draft reference */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdmissionResultV1"];
                };
            };
            400: components["responses"]["S2CommandError"];
            403: components["responses"]["S2CommandError"];
            404: components["responses"]["S2CommandError"];
            409: components["responses"]["S2CommandError"];
            500: components["responses"]["S2CommandError"];
            501: components["responses"]["S2CommandError"];
        };
    };
    resumeSession: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "schema_version": 1,
                 *       "request_id": "fixture-request",
                 *       "expected_version": 1,
                 *       "context_packet_id": null
                 *     }
                 */
                "application/json": components["schemas"]["ResumeSessionRequestV1"];
            };
        };
        responses: {
            /** @description Future capability contract; NOT implemented in S0 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "operation_id": "fixture-operation",
                     *       "status": "queued"
                     *     }
                     */
                    "application/json": components["schemas"]["OperationV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "not_found",
                     *         "message": "Resource not found",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    handoffSession: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "schema_version": 1,
                 *       "request_id": "fixture-request",
                 *       "expected_version": 1,
                 *       "context_packet_id": "fixture-packet",
                 *       "target_adapter": "fixture",
                 *       "target_project_id": "fixture-project"
                 *     }
                 */
                "application/json": components["schemas"]["HandoffSessionRequestV1"];
            };
        };
        responses: {
            /** @description Future capability contract; NOT implemented in S0 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "operation_id": "fixture-operation",
                     *       "status": "queued"
                     *     }
                     */
                    "application/json": components["schemas"]["OperationV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "not_found",
                     *         "message": "Resource not found",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    submitProposal: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "schema_version": 1,
                 *       "request_id": "fixture-request",
                 *       "expected_version": 1
                 *     }
                 */
                "application/json": components["schemas"]["SubmitProposalRequestV1"];
            };
        };
        responses: {
            /** @description Persisted proposal */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2ProposalResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "not_found",
                     *         "message": "Resource not found",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    approveProposal: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ApproveProposalRequestV1"];
            };
        };
        responses: {
            /** @description Persisted approval */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2ApprovalResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "not_found",
                     *         "message": "Resource not found",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    revokeApproval: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "schema_version": 1,
                 *       "request_id": "fixture-request",
                 *       "expected_version": 1,
                 *       "reason": "Fixture only"
                 *     }
                 */
                "application/json": components["schemas"]["RevokeApprovalRequestV1"];
            };
        };
        responses: {
            /** @description Persisted approval */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["S2ApprovalResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "not_found",
                     *         "message": "Resource not found",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    pauseMission: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SwarmStopRequestV1"];
            };
        };
        responses: {
            /** @description Current mission after the human pause command */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmMissionEnvelopeV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "not_found",
                     *         "message": "Resource not found",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    cancelMission: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SwarmStopRequestV1"];
            };
        };
        responses: {
            /** @description Current mission after the human cancellation command */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmMissionEnvelopeV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "not_found",
                     *         "message": "Resource not found",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    claimWorkItem: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SwarmClaimRequestV1"];
            };
        };
        responses: {
            /** @description Lease bound to the original authorized input operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmLeaseEnvelopeV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "not_found",
                     *         "message": "Resource not found",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    submitArtifact: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SwarmSubmitRequestV1"];
            };
        };
        responses: {
            /** @description Actual verified artifact submission */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmArtifactEnvelopeV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "not_found",
                     *         "message": "Resource not found",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    acceptArtifact: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Registered resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SwarmAcceptRequestV1"];
            };
        };
        responses: {
            /** @description Current artifact with the actual human adoption record */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwarmArtifactEnvelopeV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "validation_failed",
                     *         "message": "Invalid request",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope or user-control access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "not_found",
                     *         "message": "Resource not found",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "version_conflict",
                     *         "message": "Resource version changed",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    streamEvents: {
        parameters: {
            query?: never;
            header?: {
                /** @description Opaque resumption cursor */
                "Last-Event-ID"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Future SSE, each data frame contains EventV1 JSON */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example id: fixture-event
                     *     data: {"event_id":"fixture-event","type":"attention.opportunity_admitted","schema_version":1,"aggregate_id":"fixture-opportunity","aggregate_version":1,"occurred_at":"2026-10-09T00:00:00Z","correlation_id":"fixture-request","causation_id":null,"payload":{"opportunity_id":"fixture-opportunity","revision":1,"admission_id":"fixture-admission","actor":"fixture-user","policy_version":"fixture-policy"}}
                     */
                    "text/event-stream": string;
                };
            };
            /** @description Scope access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "scope_denied",
                     *         "message": "Scope access denied",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "internal_error",
                     *         "message": "Unexpected service failure",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in S0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in S0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current S0 capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getLocalSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocalSessionV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getMaterial: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MaterialDetailV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    updateMaterial: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateMaterialRequestV1"];
            };
        };
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MaterialDetailV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getMaterialContent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                revision: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContentV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    recordMaterialUse: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RecordUseRequestV1"];
            };
        };
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VersionResultV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listDistillations: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DistillationListV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    recordDistillation: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RecordDistillationRequestV1"];
            };
        };
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DistillationResultV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getOpportunity: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpportunityDetailV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    reviseOpportunity: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OpportunityRequestV1"];
            };
        };
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpportunityDetailV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listJobs: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobListV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getJob: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    retryJob: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JobCommandV1"];
            };
        };
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    cancelJob: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JobCommandV1"];
            };
        };
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getMaterialAttachment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                revision: number;
                name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Original source bytes; no filesystem paths accepted */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listMaterialDomains: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Human classification result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MaterialDomainListV1"];
                };
            };
            /** @description Structured error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    createMaterialDomain: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialDomainRequestV1"];
            };
        };
        responses: {
            /** @description Human classification result */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MaterialDomainResultV1"];
                };
            };
            /** @description Structured error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    reviseMaterialDomain: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialDomainRequestV1"];
            };
        };
        responses: {
            /** @description Human classification result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MaterialDomainResultV1"];
                };
            };
            /** @description Structured error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    setMaterialDomains: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetMaterialDomainsRequestV1"];
            };
        };
        responses: {
            /** @description Human classification result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MaterialDetailV1"];
                };
            };
            /** @description Structured error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listProjectSpaces: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Human classification result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectSpaceListV1"];
                };
            };
            /** @description Structured error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    createProjectSpace: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProjectSpaceRequestV1"];
            };
        };
        responses: {
            /** @description Human classification result */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectSpaceResultV1"];
                };
            };
            /** @description Structured error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getProjectSpace: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Human classification result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectSpaceResultV1"];
                };
            };
            /** @description Structured error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    referenceMaterial: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReferenceMaterialRequestV1"];
            };
        };
        responses: {
            /** @description Human classification result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectSpaceResultV1"];
                };
            };
            /** @description Structured error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    removeMaterialReference: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RemoveMaterialReferenceRequestV1"];
            };
        };
        responses: {
            /** @description Human classification result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectSpaceResultV1"];
                };
            };
            /** @description Structured error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    requestDistillation: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RequestDistillationRequestV1"];
            };
        };
        responses: {
            /** @description Attention result */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportJobV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Native processor or read isolation unsupported */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getRankingProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RankingProfileDetailV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Profile adapter not connected */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    updateRankingProfile: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateRankingProfileRequestV1"];
            };
        };
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RankingProfileDetailV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Profile adapter not connected */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    getDistillerStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Attention result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DistillerStatusV1"];
                };
            };
            /** @description Structured service error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Structured service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    confirmKnowledge: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path: {
                /** @description KnowledgeEntry identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfirmKnowledgeRequestV1"];
            };
        };
        responses: {
            /** @description Confirmed entry (future DTO only in M0) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "entry": {
                     *         "id": "k-1",
                     *         "topic": "attention-engine",
                     *         "fluid": "evolving summary",
                     *         "crystallized": {
                     *           "fact": "true"
                     *         },
                     *         "sources": [
                     *           {
                     *             "event_id": "e-1",
                     *             "ts": 1700000000000
                     *           }
                     *         ],
                     *         "status": "confirmed"
                     *       },
                     *       "version": 2,
                     *       "owner_project": "fixture-project"
                     *     }
                     */
                    "application/json": components["schemas"]["ConfirmKnowledgeResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version or status changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in M0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in M0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    approveExperience: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path: {
                /** @description Experience identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ApproveExperienceRequestV1"];
            };
        };
        responses: {
            /** @description Approved experience (future DTO only in M0) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "experience": {
                     *         "id": "x-1",
                     *         "pattern": "centralized scheduler",
                     *         "verdict": "avoid",
                     *         "condition": ">100 agents",
                     *         "evidence": [
                     *           {
                     *             "event_id": "e-9",
                     *             "ts": 1700000000000
                     *           }
                     *         ],
                     *         "status": "approved"
                     *       },
                     *       "version": 2,
                     *       "owner_project": "fixture-project"
                     *     }
                     */
                    "application/json": components["schemas"]["ApproveExperienceResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version or status changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in M0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in M0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    adjudicateConflict: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key; never automatic retry */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path: {
                /** @description Conflict identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdjudicateConflictRequestV1"];
            };
        };
        responses: {
            /** @description Adjudicated conflict (future DTO only in M0) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "conflict": {
                     *         "id": "c-1",
                     *         "topic": "scheduler",
                     *         "kind": "knowledge_entry",
                     *         "left_ref": "k-1",
                     *         "right_ref": "k-2",
                     *         "detail": "contradictory capacity facts",
                     *         "status": "resolved_merge"
                     *       },
                     *       "version": 2
                     *     }
                     */
                    "application/json": components["schemas"]["AdjudicateConflictResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Scope or user-control access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource version or status changed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Unexpected service failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Capability is not implemented in M0 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Capability is not implemented in M0",
                     *         "request_id": "example-request",
                     *         "retryable": false,
                     *         "required_action": "Read the current capabilities; choose an implemented operation"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    readEngineknowledge: {
        parameters: {
            query: {
                /** @description Project scope for persisted visibility filtering */
                project_id: string;
            };
            header?: never;
            path: {
                /** @description Stored resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KnowledgeReadResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    sharesEngineknowledge: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path: {
                /** @description Stored resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShareMemoryRequestV1"];
            };
        };
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfirmKnowledgeResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    demoteEngineknowledge: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path: {
                /** @description Stored resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DemoteMemoryRequestV1"];
            };
        };
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfirmKnowledgeResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    readEngineexperiences: {
        parameters: {
            query: {
                /** @description Project scope for persisted visibility filtering */
                project_id: string;
            };
            header?: never;
            path: {
                /** @description Stored resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExperienceReadResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    sharesEngineexperiences: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path: {
                /** @description Stored resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShareMemoryRequestV1"];
            };
        };
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApproveExperienceResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    demoteEngineexperiences: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path: {
                /** @description Stored resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DemoteMemoryRequestV1"];
            };
        };
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApproveExperienceResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    referenceEngineKnowledge: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path: {
                /** @description Stored resource identifier */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReferenceKnowledgeRequestV1"];
            };
        };
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfirmKnowledgeResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    listWorks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorksSnapshotResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    refreshWorks: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorksRefreshRequestV1"];
            };
        };
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorksSnapshotResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    importWorksDelivery: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorksDeliveryRequestV1"];
            };
        };
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorksSnapshotResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    setWorkAttitude: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path: {
                /** @description Stored resource identifier */
                work_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkAttitudeRequestV1"];
            };
        };
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    setWorkGroup: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path: {
                /** @description Stored resource identifier */
                work_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkGroupRequestV1"];
            };
        };
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    setWorkHandoff: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path: {
                /** @description Stored resource identifier */
                work_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkHandoffRequestV1"];
            };
        };
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
    setWorkHidden: {
        parameters: {
            query?: never;
            header: {
                /** @description Caller-scoped command deduplication key */
                "Idempotency-Key": string;
                /** @description Session-bound CSRF token */
                "X-CSRF-Token": string;
            };
            path: {
                /** @description Stored resource identifier */
                work_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkHiddenRequestV1"];
            };
        };
        responses: {
            /** @description Persisted result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkResultV1"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Human authority or scope required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Resource not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Version conflict or uncertain delivery */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
            /** @description Service has not been assembled */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "schema_version": 1,
                     *       "error": {
                     *         "code": "unsupported_capability",
                     *         "message": "Service has not been assembled",
                     *         "request_id": "fixture-request",
                     *         "retryable": false,
                     *         "required_action": "configure_supported_service"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorV1"];
                };
            };
        };
    };
}
