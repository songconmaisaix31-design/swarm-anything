package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"testing"
)

func profileIntent(profile string) executionPackage {
	p := executionPackage{SchemaVersion: 1, Profile: profile, Caller: caller, Agent: "codex", Model: "gpt-5.5", Workers: 3, Project: publicRoot}
	if profile == piProfile || profile == piN4Profile || profile == piN6Profile {
		p.Caller, p.Agent, p.Model = "swa-stepfun-pi-n3-20261023", "pi", "stepfun/step-3.5-flash"
		if profile == piN4Profile {
			p.Workers, p.Project = 4, "/workspace/swa-public-case-20261023-n4/public-project"
		} else if profile == piN6Profile {
			p.Workers, p.Project = 6, "/workspace/swa-public-case-20261023-n6/public-project"
		}
		p.Caller = "swa-stepfun-pi-n" + strconv.Itoa(p.Workers) + "-20261023"
	}
	return p
}

func TestAuthorizationProfileScope(t *testing.T) {
	for _, profile := range []string{"", piProfile, piN4Profile, piN6Profile} {
		p := profileIntent(profile)
		scope, err := fixedProfile(p)
		if err != nil || scope.agent != p.Agent || scope.model != p.Model || scope.caller != p.Caller {
			t.Fatalf("fixed profile rejected: %v", err)
		}
		if scope.workers != p.Workers || scope.projectRoot != p.Project {
			t.Fatal("fixed worker count or public root changed")
		}
		if profile != "" {
			count := strconv.Itoa(p.Workers)
			if scope.project != "SWA StepFun Pi N"+count+" public stats" || scope.space != "SWA StepFun Pi N"+count+" public stats 20261023" || scope.version != "1.0.1" || scope.provider != "stepfun" || scope.accountSource != "pi-api-key-file" || scope.sourceName != "pi_source_home" {
				t.Fatal("Pi authorization scope changed")
			}
		} else if scope.project != projectName || scope.space != spaceTitle || scope.version != "0.163.0" || scope.provider != "openai" || scope.accountSource != "codex-native-api-key" || scope.sourceName != "codex_api_key_home" {
			t.Fatal("default Codex authorization scope changed")
		}
		for name, mutate := range map[string]func(*executionPackage){
			"caller":  func(p *executionPackage) { p.Caller += "-other" },
			"agent":   func(p *executionPackage) { p.Agent = "opencode" },
			"model":   func(p *executionPackage) { p.Model = "other/model" },
			"workers": func(p *executionPackage) { p.Workers++ },
			"project": func(p *executionPackage) { p.Project += "/other" },
			"schema":  func(p *executionPackage) { p.SchemaVersion = 2 },
		} {
			t.Run(profile+"/"+name, func(t *testing.T) {
				changed := p
				mutate(&changed)
				if _, err := fixedProfile(changed); err == nil {
					t.Fatal("changed scope was accepted")
				}
			})
		}
	}
	for _, profile := range []string{"codex", "stepfun", "stepfun-pi-n5", "stepfun-pi-n7", " stepfun-pi-n3"} {
		if _, err := fixedProfile(profileIntent(profile)); err == nil {
			t.Fatalf("unknown profile accepted: %q", profile)
		}
	}
	for _, profile := range []string{"", piProfile, piN4Profile, piN6Profile} {
		p := profileIntent(profile)
		if profile != "" {
			p.CodexSourceHome = "/ordinary-codex-source"
		} else {
			p.PiSourceHome = "/ordinary-pi-source"
		}
		if _, err := fixedProfile(p); err == nil {
			t.Fatal("source from another profile was accepted")
		}
	}
}

func TestAuthorizationProfileDependencySet(t *testing.T) {
	base := []string{"driver-failure.mjs", "codex-event-view.mjs", "prepare-source-observer.mjs", "source-observer-entry.ts", "extract-observer-source.py", "pi-event-view.mjs"}
	for _, profile := range []string{"", piProfile, piN4Profile, piN6Profile} {
		scope, err := fixedProfile(profileIntent(profile))
		if err != nil {
			t.Fatal(err)
		}
		expected := append([]string(nil), base...)
		if profile != "" {
			expected = append(expected, "pi-source-observer-entry.ts")
		}
		if !reflect.DeepEqual(scope.dependencies, expected) {
			t.Fatal("execution dependency set changed")
		}
		seen := map[string]bool{}
		for _, name := range scope.dependencies {
			if seen[name] || filepath.Base(name) != name {
				t.Fatal("duplicate or nonlocal execution dependency")
			}
			seen[name] = true
		}
	}
}

func profileFilesystem(t *testing.T) executionPackage {
	t.Helper()
	base, err := filepath.Abs(filepath.Join("..", "..", "..", ".verification", "cloud-setup"))
	if err != nil {
		t.Fatal(err)
	}
	root, err := os.MkdirTemp(base, "authorize-profile-fs-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.RemoveAll(root); err != nil {
			t.Error(err)
		}
	})
	p := profileIntent(piProfile)
	p.Installation, p.SourceRepository, p.EvidenceRoot = filepath.Join(root, "installation"), filepath.Join(root, "repository"), filepath.Join(root, "evidence")
	p.DataRoot, p.PiSourceHome = filepath.Join(root, "data"), filepath.Join(root, "source")
	for _, path := range []string{p.Installation, p.SourceRepository, p.EvidenceRoot, p.DataRoot, p.PiSourceHome} {
		if err := os.Mkdir(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	return p
}

func TestAuthorizationProfilePrivateRoots(t *testing.T) {
	for _, name := range []string{"missing", "nonprivate", "symlink", "data-same", "data-ancestor", "data-descendant", "protected-same", "protected-ancestor", "protected-descendant", "adjacent-prefix"} {
		t.Run(name, func(t *testing.T) {
			p := profileFilesystem(t)
			switch name {
			case "missing":
				p.PiSourceHome = ""
			case "nonprivate":
				if err := os.Chmod(p.PiSourceHome, 0750); err != nil {
					t.Fatal(err)
				}
			case "symlink":
				link := p.PiSourceHome + "-link"
				if err := os.Symlink(p.PiSourceHome, link); err != nil {
					t.Fatal(err)
				}
				p.PiSourceHome = link
			case "data-same":
				p.PiSourceHome = p.DataRoot
			case "data-ancestor":
				p.DataRoot = filepath.Join(p.PiSourceHome, "data")
				if err := os.Mkdir(p.DataRoot, 0700); err != nil {
					t.Fatal(err)
				}
			case "data-descendant":
				p.PiSourceHome = filepath.Join(p.DataRoot, "source")
				if err := os.Mkdir(p.PiSourceHome, 0700); err != nil {
					t.Fatal(err)
				}
			case "protected-same":
				p.ProtectedRoots = []string{p.PiSourceHome}
			case "protected-ancestor":
				p.ProtectedRoots = []string{filepath.Dir(p.PiSourceHome)}
			case "protected-descendant":
				child := filepath.Join(p.PiSourceHome, "protected")
				if err := os.Mkdir(child, 0700); err != nil {
					t.Fatal(err)
				}
				p.ProtectedRoots = []string{child}
			case "adjacent-prefix":
				neighbor := p.PiSourceHome + "-protected"
				if err := os.Mkdir(neighbor, 0700); err != nil {
					t.Fatal(err)
				}
				p.ProtectedRoots = []string{neighbor}
			}
			scope, err := fixedProfile(p)
			if err != nil {
				t.Fatal(err)
			}
			missing, err := privateRuntimeRoots(p, scope)
			if name == "missing" {
				if err != nil || !reflect.DeepEqual(missing, []string{"pi_source_home"}) {
					t.Fatal("missing source was not retained as incomplete")
				}
			} else if name == "adjacent-prefix" {
				if err != nil || len(missing) != 0 {
					t.Fatalf("adjacent ordinary root rejected: %v", err)
				}
			} else if err == nil {
				t.Fatal("unsafe source root accepted")
			}
		})
	}
}
