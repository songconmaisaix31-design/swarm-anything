//go:build !windows

package relayworktree

func gitDirectory(root string) (string, error) { return root, nil }
