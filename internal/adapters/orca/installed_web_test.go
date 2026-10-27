package orca_test

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/orca"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/swahttp"
)

func installedWebInput(t *testing.T) (string, string) {
	t.Helper()
	install := t.TempDir()
	web := filepath.Join(install, "web")
	for _, path := range []string{filepath.Join(web, "assets"), filepath.Join(web, ".vite")} {
		if err := os.MkdirAll(path, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	for path, body := range map[string]string{
		filepath.Join(install, "EDITION"):            "combined\n",
		filepath.Join(web, "index.html"):             "<!doctype html><title>SWA public test</title>",
		filepath.Join(web, "assets", "index.js"):     "export {};\n",
		filepath.Join(web, ".vite", "manifest.json"): `{"index.html":{"file":"assets/index.js","isEntry":true}}`,
	} {
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return install, web
}

func TestInstalledWebDirectoryAndHTTPRoutes(t *testing.T) {
	install, web := installedWebInput(t)
	actual, err := orca.InstalledWebDirectory(install, web)
	if err != nil || actual != web {
		t.Fatalf("trusted installed Web directory: %q %v", actual, err)
	}
	if actual, err := orca.InstalledWebDirectory("", ""); err != nil || actual != "" {
		t.Fatal("CLI without an explicit Web directory must remain available", err)
	}
	server := swahttp.NewServer(swahttp.Config{WebDir: actual})
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	finished := make(chan error, 1)
	go func() { finished <- server.Serve(listener) }()
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			t.Error(err)
		}
		if err := <-finished; !errors.Is(err, http.ErrServerClosed) {
			t.Error("actual SWA asset listener failed", err)
		}
	})
	endpoint := "http://" + listener.Addr().String()
	for _, path := range []string{"/swarm", "/assets/index.js"} {
		response, err := http.Get(endpoint + path)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != http.StatusOK || len(body) == 0 {
			t.Fatalf("installed asset %s: HTTP %d %v", path, response.StatusCode, err)
		}
	}
	response, err := http.Get(endpoint + "/api/v1/does-not-exist")
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != http.StatusForbidden || !strings.Contains(response.Header.Get("Content-Type"), "application/json") || strings.Contains(string(body), "<!doctype") {
		t.Fatal("unauthenticated API did not retain the actual permission gate", response.StatusCode, err)
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Jar: jar, Timeout: 5 * time.Second}
	request, err := http.NewRequest(http.MethodGet, endpoint+"/api/v1/auth/session", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Origin", endpoint)
	response, err = client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	_, err = io.Copy(io.Discard, response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatal("actual local session was not established", response.StatusCode, err)
	}
	for _, path := range []string{"/api", "/api/v1/does-not-exist"} {
		response, err := client.Get(endpoint + path)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != http.StatusNotFound || !strings.Contains(response.Header.Get("Content-Type"), "application/json") || strings.Contains(string(body), "<!doctype") {
			t.Fatalf("API must retain its actual JSON error: %s HTTP %d %s %v", path, response.StatusCode, body, err)
		}
	}
}

func TestInstalledWebDirectoryRejectsUntrustedInputs(t *testing.T) {
	cases := []string{"wrong-root", "missing-edition", "cli-edition", "missing-index", "missing-manifest", "invalid-manifest", "wrong-shape", "missing-asset", "escape-file", "escape-css", "escape-assets", "missing-import", "symlink-file", "symlink-directory", "symlink-install"}
	for _, name := range cases {
		t.Run(name, func(t *testing.T) {
			install, web := installedWebInput(t)
			write := func(path, text string) {
				t.Helper()
				if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			remove := func(path string) {
				t.Helper()
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
			}
			link := func(target, path string) {
				t.Helper()
				if err := os.Symlink(target, path); err != nil {
					t.Skipf("actual platform cannot create this symbolic link: %v", err)
				}
			}
			manifest := filepath.Join(web, ".vite", "manifest.json")
			switch name {
			case "wrong-root":
				web = t.TempDir()
			case "missing-edition":
				remove(filepath.Join(install, "EDITION"))
			case "cli-edition":
				write(filepath.Join(install, "EDITION"), "cli\n")
			case "missing-index":
				remove(filepath.Join(web, "index.html"))
			case "missing-manifest":
				remove(manifest)
			case "invalid-manifest":
				write(manifest, "{")
			case "wrong-shape":
				write(manifest, `{"entry":{"file":"assets/index.js"}}`)
			case "missing-asset":
				remove(filepath.Join(web, "assets", "index.js"))
			case "escape-file":
				write(manifest, `{"index.html":{"file":"../EDITION","isEntry":true}}`)
			case "escape-css":
				write(manifest, `{"index.html":{"file":"assets/index.js","isEntry":true,"css":["../EDITION"]}}`)
			case "escape-assets":
				write(manifest, `{"index.html":{"file":"assets/index.js","isEntry":true,"assets":["C:\\private"]}}`)
			case "missing-import":
				write(manifest, `{"index.html":{"file":"assets/index.js","isEntry":true,"imports":["missing"]}}`)
			case "symlink-file":
				remove(filepath.Join(web, "assets", "index.js"))
				link(filepath.Join(install, "EDITION"), filepath.Join(web, "assets", "index.js"))
			case "symlink-directory":
				link(t.TempDir(), filepath.Join(web, "alias"))
			case "symlink-install":
				alias := filepath.Join(t.TempDir(), "alias")
				link(install, alias)
				install, web = alias, filepath.Join(alias, "web")
			}
			if _, err := orca.InstalledWebDirectory(install, web); err == nil {
				t.Fatal("untrusted installed Web input was accepted")
			}
		})
	}
}
