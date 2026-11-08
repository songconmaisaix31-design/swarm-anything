package app

import (
	"encoding/json"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func TestOrcaTaskSpecWorkerLimit(t *testing.T) {
	for _, limit := range []int64{1, 2, 3, 5, 9007199254740991} {
		spec := OrcaTaskSpec{Goal: "审阅公开接口", SourceRepo: "https://github.com/songconmaisaix31-design/swarm-anything", SourceRevision: "6195f4cfb6b32aedd43845443c029ecc11d5578d", SuccessCriteria: []string{"按真实来源报告"}, MaxWorkers: limit}
		if err := validateOrcaTaskSpec(spec); err != nil {
			t.Fatalf("max_workers=%d: %v", limit, err)
		}
		for _, invalid := range []int64{0, -1, 9007199254740992} {
			spec.MaxWorkers = invalid
			if err := validateOrcaTaskSpec(spec); err == nil {
				t.Fatalf("accepted max_workers=%d", invalid)
			}
		}
	}
	var spec OrcaTaskSpec
	if err := json.Unmarshal([]byte(`{"max_workers":3.5}`), &spec); err == nil {
		t.Fatal("fractional worker count must not decode as an integer")
	}
}

func TestOrcaTaskSpecInitialWorkerLimit(t *testing.T) {
	spec := OrcaTaskSpec{Goal: "审阅公开接口", SourceRepo: "https://github.com/songconmaisaix31-design/swarm-anything", SourceRevision: "6195f4cfb6b32aedd43845443c029ecc11d5578d", SuccessCriteria: []string{"按真实来源报告"}, MaxWorkers: 6}
	if err := validateOrcaTaskSpec(spec); err != nil {
		t.Fatal(err)
	}
	for _, count := range []int64{-1, 0, 1, 4, 6, 7} {
		spec.InitialWorkers = &count
		err := validateOrcaTaskSpec(spec)
		if (err == nil) != (count >= 1 && count <= spec.MaxWorkers) {
			t.Fatalf("initial_workers=%d, validation=%v", count, err)
		}
	}
}

func TestOrcaTaskSpecInitialWorkerWire(t *testing.T) {
	for _, count := range []string{"", `,"initial_workers":1`, `,"initial_workers":4`, `,"initial_workers":0`, `,"initial_workers":null`, `,"initial_workers":7`, `,"initial_workers":1.5`} {
		file := domain.ContextFile{Text: `{"goal":"公开任务","source_repo":"https://github.com/songconmaisaix31-design/swarm-anything","source_revision":"6195f4cfb6b32aedd43845443c029ecc11d5578d","success_criteria":["真实来源"],"max_workers":6` + count + `}`}
		_, err := decodeOrcaTaskSpec(file)
		allowed := count == "" || count == `,"initial_workers":1` || count == `,"initial_workers":4`
		if (err == nil) != allowed {
			t.Fatalf("initial Worker wire %q: %v", count, err)
		}
	}
}
