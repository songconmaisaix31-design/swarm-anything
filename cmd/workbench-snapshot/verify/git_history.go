package main

import (
	"context"
	"encoding/csv"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"

	gitobject "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/events"
)

func publicGitMetadata(ctx context.Context, repo, ref string) (string, []events.GitLogRecord, error) {
	commit, err := git(ctx, repo, "rev-parse", "--verify", "--end-of-options", ref+"^{commit}")
	if err != nil {
		return "", nil, err
	}
	data, err := git(ctx, repo, "log", "--format=%H,%ct,%e", commit, "--")
	if err != nil {
		return "", nil, err
	}
	rows, err := csv.NewReader(strings.NewReader(data)).ReadAll()
	if err != nil {
		return "", nil, err
	}
	seen := map[string]bool{}
	records := make([]events.GitLogRecord, 0, len(rows))
	for _, row := range rows {
		if len(row) != 3 || len(row[0]) != 40 || seen[row[0]] || (row[2] != "" && !strings.EqualFold(row[2], "UTF-8")) {
			return "", nil, errors.New("public Git metadata must contain unique SHA-1 commits with UTF-8 messages")
		}
		if _, err := hex.DecodeString(row[0]); err != nil {
			return "", nil, err
		}
		seconds, err := strconv.ParseInt(row[1], 10, 64)
		if err != nil || seconds <= 0 {
			return "", nil, errors.New("public Git commit timestamp unavailable")
		}
		seen[row[0]] = true
		records = append(records, events.GitLogRecord{Commit: row[0], TS: seconds * 1000})
	}
	if len(records) == 0 {
		return "", nil, errors.New("public Git history is empty")
	}
	return commit, records, nil
}

func publicGitRecords(ctx context.Context, repo, ref string) ([]events.GitLogRecord, error) {
	for _, check := range []struct{ option, expected string }{
		{"--is-bare-repository", "true"}, {"--show-object-format", "sha1"}, {"--is-shallow-repository", "false"},
	} {
		value, err := git(ctx, repo, "rev-parse", check.option)
		if err != nil || value != check.expected {
			return nil, errors.New("public collection requires a complete bare SHA-1 repository")
		}
	}
	replacements, err := git(ctx, repo, "for-each-ref", "refs/replace")
	if err != nil || replacements != "" {
		return nil, errors.New("public collection does not accept replacement objects")
	}
	for _, name := range []string{"alternates", "http-alternates"} {
		if _, err := os.Stat(filepath.Join(repo, "objects", "info", name)); !os.IsNotExist(err) {
			return nil, errors.New("public collection requires independent object storage")
		}
	}
	commit, records, err := publicGitMetadata(ctx, repo, ref)
	if err != nil {
		return nil, err
	}
	repository, err := gitobject.PlainOpen(repo)
	if err != nil {
		return nil, err
	}
	subjects := make([]string, 0, len(records))
	for index := range records {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		record := &records[index]
		object, err := repository.CommitObject(plumbing.NewHash(record.Commit))
		if err != nil {
			return nil, err
		}
		encoding := string(object.Encoding)
		if object.Hash.String() != record.Commit || object.Committer.When.UnixMilli() != record.TS || !utf8.ValidString(object.Message) || (encoding != "" && !strings.EqualFold(encoding, "UTF-8")) {
			return nil, errors.New("decoded public commit differs from actual Git metadata")
		}
		// Git 对标题首段逐行移除尾部空白，并使用空格连接。
		lines := []string{}
		for _, line := range strings.Split(object.Message, "\n") {
			line = strings.TrimRight(line, " \t\r\v\f")
			if line == "" {
				if len(lines) != 0 {
					break
				}
				continue
			}
			lines = append(lines, line)
		}
		subject := strings.Join(lines, " ")
		subjects = append(subjects, record.Commit+"\t"+subject)
		record.Subject = strings.TrimSpace(subject)
	}
	// 整体比较 Git 的真实输出，避免自行解析任意标题中的分隔符。
	actual, err := git(ctx, repo, "log", "--format=%H%x09%s", commit, "--")
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(strings.Join(subjects, "\n")) != actual {
		return nil, errors.New("decoded public subjects differ from actual Git output")
	}
	return records, nil
}
