//go:build windows && swa_ci_path_evidence

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/projectfiles"
	"golang.org/x/sys/windows"
)

type pathEvidenceError struct {
	Present bool    `json:"present"`
	Type    string  `json:"type,omitempty"`
	Win32   *uint32 `json:"win32,omitempty"`
}

func pathEvidenceErrorValue(err error) pathEvidenceError {
	if err == nil {
		return pathEvidenceError{}
	}
	kind := fmt.Sprintf("%T", err)
	if len(kind) > 64 || !regexp.MustCompile(`^\*?[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$`).MatchString(kind) {
		kind = "unavailable"
	}
	result := pathEvidenceError{Present: true, Type: kind}
	var code syscall.Errno
	if errors.As(err, &code) {
		value := uint32(code)
		result.Win32 = &value
	}
	return result
}

type pathEvidenceAttribute struct {
	Index     int               `json:"index"`
	Exists    bool              `json:"exists"`
	Directory bool              `json:"directory"`
	Reparse   bool              `json:"reparse"`
	Error     pathEvidenceError `json:"error"`
}

func pathEvidenceAncestors(t *testing.T, path string) []pathEvidenceAttribute {
	t.Helper()
	var result []pathEvidenceAttribute
	for current := filepath.Clean(path); ; current = filepath.Dir(current) {
		if len(result) == 32 {
			t.Fatal("path observation exceeded the bounded ancestor count")
		}
		name, err := windows.UTF16PtrFromString(current)
		var flags uint32
		if err == nil {
			flags, err = windows.GetFileAttributes(name)
		}
		result = append(result, pathEvidenceAttribute{Index: len(result), Exists: err == nil,
			Directory: err == nil && flags&windows.FILE_ATTRIBUTE_DIRECTORY != 0,
			Reparse:   err == nil && flags&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0,
			Error:     pathEvidenceErrorValue(err)})
		if filepath.Dir(current) == current {
			return result
		}
	}
}

func pathEvidenceSameFile(left, right string) map[string]any {
	first, firstErr := os.Stat(left)
	second, secondErr := os.Stat(right)
	return map[string]any{"left_error": pathEvidenceErrorValue(firstErr), "right_error": pathEvidenceErrorValue(secondErr),
		"equal": firstErr == nil && secondErr == nil && os.SameFile(first, second)}
}

func pathEvidenceRelations(t *testing.T, path string) map[string]any {
	t.Helper()
	evaluated, evalErr := filepath.EvalSymlinks(path)
	canonical, canonicalErr := projectfiles.CanonicalRoot(path)
	name, longErr := windows.UTF16PtrFromString(path)
	var longPath string
	if longErr == nil {
		buffer := make([]uint16, 32768)
		length, err := windows.GetLongPathName(name, &buffer[0], uint32(len(buffer)))
		longErr = err
		if err == nil && length < uint32(len(buffer)) {
			longPath = windows.UTF16ToString(buffer[:length])
		} else if err == nil {
			longErr = windows.ERROR_INSUFFICIENT_BUFFER
		}
	}
	result := map[string]any{
		"eval_error": pathEvidenceErrorValue(evalErr), "canonical_error": pathEvidenceErrorValue(canonicalErr),
		"long_path_error":            pathEvidenceErrorValue(longErr),
		"input_equals_eval":          evalErr == nil && path == evaluated,
		"input_equal_fold_eval":      evalErr == nil && strings.EqualFold(path, evaluated),
		"input_equals_canonical":     canonicalErr == nil && path == canonical,
		"input_equal_fold_canonical": canonicalErr == nil && strings.EqualFold(path, canonical),
		"eval_equals_canonical":      evalErr == nil && canonicalErr == nil && evaluated == canonical,
		"input_equals_long_path":     longErr == nil && path == longPath,
		"eval_equals_long_path":      evalErr == nil && longErr == nil && evaluated == longPath,
	}
	if evalErr == nil {
		result["input_eval_same_file"] = pathEvidenceSameFile(path, evaluated)
		result["eval_ancestors"] = pathEvidenceAncestors(t, evaluated)
	}
	if canonicalErr == nil {
		result["input_canonical_same_file"] = pathEvidenceSameFile(path, canonical)
		if evalErr != nil || canonical != evaluated {
			result["canonical_ancestors"] = pathEvidenceAncestors(t, canonical)
		}
	}
	return result
}

func TestWindowsCIPathBoundaryEvidence(t *testing.T) {
	source := os.Getenv("GITHUB_SHA")
	if !regexp.MustCompile(`^[0-9a-f]{40}$`).MatchString(source) {
		t.Fatal("the diagnostic requires an exact source revision")
	}
	var records []map[string]any
	emit := func(stage string, observation map[string]any) {
		t.Helper()
		record := map[string]any{"source_revision": source, "original_failure_source": "6f40a399af301c05ecb79a5316a812641e05e3f9",
			"stage": stage, "diagnostic_only": true, "original_conclusion": "failure", "observation": observation}
		body, err := json.Marshal(record)
		if err != nil || len(body) > 3500 || len(records) == 6 {
			t.Fatal("the safe path observation exceeded its annotation bound")
		}
		records = append(records, record)
		const directory = ".verification/swa-ci/windows-path-boundary"
		if err := os.MkdirAll(directory, 0o700); err != nil {
			t.Fatal("the safe diagnostic directory could not be created")
		}
		all, err := json.Marshal(records)
		if err != nil {
			t.Fatal("the safe diagnostic projection could not be encoded")
		}
		if err := os.WriteFile(filepath.Join(directory, "result.json"), all, 0o600); err != nil {
			t.Fatal("the safe diagnostic projection could not be saved")
		}
		// 只输出受限类型、布尔和错误码，不包含路径或自由错误文本。
		escaped := strings.NewReplacer("%", "%25", "\r", "%0D", "\n", "%0A").Replace(string(body))
		fmt.Printf("::warning title=SWA main CI path evidence::%s\n", escaped)
	}
	base := t.TempDir()
	install, protected := filepath.Join(base, "install"), filepath.Join(base, "protected")
	for _, path := range []string{install, protected} {
		if err := os.Mkdir(path, 0o700); err != nil {
			emit("private-setup", map[string]any{"error": pathEvidenceErrorValue(err)})
			t.Fatal("the actual private directory setup failed")
		}
	}
	emit("private-parent", map[string]any{"relations": pathEvidenceRelations(t, base), "ancestors": pathEvidenceAncestors(t, base)})
	target := filepath.Join(base, "fresh", "data")
	actual, privateErr := privateDataDirectory(target, install, []string{protected})
	privateResult := map[string]any{"error": pathEvidenceErrorValue(privateErr),
		"actual_equals_target": actual == target, "actual_equal_fold_target": strings.EqualFold(actual, target),
		"target_ancestors": pathEvidenceAncestors(t, target)}
	if privateErr == nil {
		canonical, err := projectfiles.CanonicalRoot(target)
		privateResult["target_canonical_error"] = pathEvidenceErrorValue(err)
		privateResult["actual_equals_canonical_target"] = err == nil && actual == canonical
		privateResult["actual_target_same_file"] = pathEvidenceSameFile(actual, target)
		privateResult["actual_ancestors"] = pathEvidenceAncestors(t, actual)
		user, err := windows.GetCurrentProcessToken().GetTokenUser()
		if err == nil && user != nil && user.User.Sid != nil {
			err = requirePrivateDataRootSecurity(actual, user.User.Sid)
		} else if err == nil {
			err = errors.New("current user identity unavailable")
		}
		privateResult["private_security_error"] = pathEvidenceErrorValue(err)
	}
	emit("private-result", privateResult)
	parent := t.TempDir()
	emit("export-parent", map[string]any{"relations": pathEvidenceRelations(t, parent), "ancestors": pathEvidenceAncestors(t, parent)})
	output := filepath.Join(parent, "new-export")
	exported, exportErr := prepareRunExport(output)
	_, targetErr := os.Lstat(output)
	emit("export-result", map[string]any{"error": pathEvidenceErrorValue(exportErr), "actual_equals_target": exported == output,
		"target_absent": errors.Is(targetErr, os.ErrNotExist), "target_error": pathEvidenceErrorValue(targetErr)})
	reader, writer, err := os.Pipe()
	if err != nil {
		emit("pipe-create", map[string]any{"error": pathEvidenceErrorValue(err)})
		t.Fatal("the actual diagnostic pipe could not be created")
	}
	deadlineErr := reader.SetReadDeadline(time.Now().Add(time.Second))
	readerErr, writerErr := reader.Close(), writer.Close()
	emit("pipe-deadline", map[string]any{"error": pathEvidenceErrorValue(deadlineErr),
		"reader_close_error": pathEvidenceErrorValue(readerErr), "writer_close_error": pathEvidenceErrorValue(writerErr)})
	if readerErr != nil || writerErr != nil {
		t.Fatal("the actual diagnostic pipe did not close")
	}
}
