package main

import (
	"errors"
	"testing"

	"github.com/google/uuid"
	"golang.org/x/sys/windows"
)

func TestServiceJobNativeAbsence(t *testing.T) {
	name := `Local\SWAService` + uuid.NewString()
	if err := serviceJobAbsentInAllSessions(name); err != nil {
		t.Fatal(err)
	}
	encoded, err := windows.UTF16PtrFromString(name)
	if err != nil {
		t.Fatal(err)
	}
	handle, err := windows.CreateJobObject(nil, encoded)
	if err != nil {
		t.Fatal(err)
	}
	if err := serviceJobAbsentInAllSessions(name); !errors.Is(err, errServiceJobStillPresent) {
		_ = windows.CloseHandle(handle)
		t.Fatalf("真实 Job 未被识别: %v", err)
	}
	if err := windows.CloseHandle(handle); err != nil {
		t.Fatal(err)
	}
	if err := serviceJobAbsentInAllSessions(name); err != nil {
		t.Fatal(err)
	}
}
