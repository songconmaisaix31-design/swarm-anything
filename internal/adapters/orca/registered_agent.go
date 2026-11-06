package orca

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

var _ app.ExternalCLIRegistry = (*Runtime)(nil)

type registeredAgent struct {
	Schema        string `json:"schema"`
	ID            string `json:"id"`
	Adapter       string `json:"adapter"`
	ExecutionMode string `json:"execution_mode"`
	Registered    bool   `json:"registered"`
	Source        struct {
		Kind string `json:"kind"`
	} `json:"source"`
	SourceRevision string `json:"source_revision"`
	Registry       struct {
		OrcaVersion    string `json:"orca_version"`
		ArtifactSHA256 string `json:"artifact_sha256"`
	} `json:"registry"`
	Runtime struct {
		RuntimeID       string `json:"runtime_id"`
		AuthorityDomain string `json:"authority_domain"`
		DataRoot        string `json:"data_root"`
		InstallRoot     string `json:"install_root"`
	} `json:"runtime"`
}

func sameCanonicalPath(path, expected string) bool {
	if !filepath.IsAbs(path) {
		return false
	}
	actual, err := filepath.EvalSymlinks(path)
	if err != nil {
		return false
	}
	if runtime.GOOS == "windows" {
		return strings.EqualFold(actual, expected)
	}
	return actual == expected
}

// 只读注册校验不消费 Grant，不据此判断账号、工具或实际可启动。
func (r *Runtime) ValidateExternalCLI(ctx context.Context, cliID string) error {
	invalid := func() error {
		return &apierrors.ServiceError{Code: apierrors.EvidenceMissing, Message: "native Agent registration does not match the installed private runtime", RequiredAction: "inspect_product_registration_and_installation"}
	}
	if strings.TrimSpace(cliID) == "" {
		return invalid()
	}
	response, err := r.call(ctx, bridgeRequest{Operation: "registered_agent", AgentID: cliID}, false)
	if err != nil {
		return err
	}
	envelope := response.Envelope
	if envelope == nil || !envelope.OK || envelope.Error != nil || envelope.RuntimeID == "" || envelope.AuthorityDomain == "" {
		return invalid()
	}
	encoded, err := json.Marshal(envelope.Result)
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.DisallowUnknownFields()
	var value registeredAgent
	if err := decoder.Decode(&value); err != nil {
		return invalid()
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return invalid()
	}
	if value.Schema != "swa.registered-agent.v1" || !value.Registered || value.ID != cliID || strings.TrimSpace(value.Adapter) == "" {
		return invalid()
	}
	if !((value.ExecutionMode == "structured" && value.Source.Kind == "structured-registry") || (value.ExecutionMode == "terminal" && value.Source.Kind == "tui-launcher")) {
		return invalid()
	}
	version, err := os.ReadFile(filepath.Join(r.config.InstallRoot, "VERSION"))
	if err != nil {
		return err
	}
	revision := strings.TrimSpace(string(version))
	decoded, err := hex.DecodeString(revision)
	if err != nil || len(decoded) != 20 || revision != strings.ToLower(revision) || value.SourceRevision != revision || value.Registry.OrcaVersion != "1.4.230" {
		return invalid()
	}
	host, err := os.ReadFile(filepath.Join(r.config.InstallRoot, "runtime", "host.cjs"))
	if err != nil {
		return err
	}
	digest := sha256.Sum256(host)
	if value.Registry.ArtifactSHA256 != hex.EncodeToString(digest[:]) || value.Runtime.RuntimeID != envelope.RuntimeID || value.Runtime.AuthorityDomain != envelope.AuthorityDomain || !sameCanonicalPath(value.Runtime.DataRoot, r.config.DataRoot) || !sameCanonicalPath(value.Runtime.InstallRoot, r.config.InstallRoot) {
		return invalid()
	}
	if response.Scope != nil || response.Selection != nil {
		return errors.New("registration response contains unrelated native results")
	}
	return nil
}
