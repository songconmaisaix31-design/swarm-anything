package orca

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func sameInstalledPath(left, right string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(left, right)
	}
	return left == right
}

func plainInstalledPath(path string) error {
	for current := filepath.Clean(path); ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 || (!info.IsDir() && !info.Mode().IsRegular()) {
			return errors.New("installed Web paths must contain only ordinary files and directories")
		}
		if err := rejectInstalledReparsePoint(current); err != nil {
			return err
		}
		if filepath.Dir(current) == current {
			break
		}
	}
	actual, err := filepath.EvalSymlinks(path)
	if err != nil || !sameInstalledPath(actual, filepath.Clean(path)) {
		return errors.New("installed Web path changed its canonical location")
	}
	return nil
}

// InstalledWebDirectory 只接受同一组合安装内的 Web，不改变 CLI 缺省行为。
func InstalledWebDirectory(install, input string) (string, error) {
	if input == "" {
		return "", nil
	}
	if !filepath.IsAbs(install) || !filepath.IsAbs(input) || !sameInstalledPath(filepath.Clean(input), filepath.Join(filepath.Clean(install), "web")) {
		return "", errors.New("Web assets must use the explicit web directory of this installation")
	}
	root := filepath.Clean(input)
	if err := plainInstalledPath(root); err != nil {
		return "", err
	}
	edition := filepath.Join(install, "EDITION")
	if err := plainInstalledPath(edition); err != nil {
		return "", err
	}
	value, err := os.ReadFile(edition)
	if err != nil || string(value) != "combined\n" && string(value) != "combined" && string(value) != "combined\r\n" {
		return "", errors.New("Web assets require the combined installation edition")
	}
	if err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := plainInstalledPath(path); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return "", err
	}
	regular := func(reference string) error {
		if !filepath.IsLocal(reference) || strings.ContainsAny(reference, "\\:") {
			return errors.New("Web manifest asset path must remain inside the installed Web directory")
		}
		file := filepath.Join(root, filepath.FromSlash(reference))
		if err := plainInstalledPath(file); err != nil {
			return err
		}
		info, err := os.Stat(file)
		if err != nil || !info.Mode().IsRegular() {
			return fmt.Errorf("Web manifest asset is not an installed regular file: %s", reference)
		}
		return nil
	}
	if err := regular("index.html"); err != nil {
		return "", err
	}
	if err := regular(".vite/manifest.json"); err != nil {
		return "", err
	}
	body, err := os.ReadFile(filepath.Join(root, ".vite", "manifest.json"))
	if err != nil {
		return "", err
	}
	var manifest map[string]struct {
		File           string   `json:"file"`
		CSS            []string `json:"css"`
		Assets         []string `json:"assets"`
		Imports        []string `json:"imports"`
		DynamicImports []string `json:"dynamicImports"`
		IsEntry        bool     `json:"isEntry"`
	}
	if err := json.Unmarshal(body, &manifest); err != nil {
		return "", err
	}
	if !manifest["index.html"].IsEntry {
		return "", errors.New("Web manifest requires the actual index.html entry")
	}
	for _, entry := range manifest {
		for _, reference := range append(append([]string{entry.File}, entry.CSS...), entry.Assets...) {
			if err := regular(reference); err != nil {
				return "", err
			}
		}
		for _, key := range append(entry.Imports, entry.DynamicImports...) {
			if _, exists := manifest[key]; !exists {
				return "", errors.New("Web manifest references an unobserved imported chunk")
			}
		}
	}
	return root, nil
}
