#pragma once
#include <Windows.h>
#include <TlHelp32.h>
#include <napi.h>
#include <mutex>
#include <unordered_set>
#include <vector>

// 父 runtime 持有不可继承的独立 Job，SDK 只获得成员资格。
struct SwaProviderJob {
  HANDLE job = nullptr;
  HANDLE root = nullptr;
  DWORD ownerPid = 0;
  DWORD rootPid = 0;
  ULONGLONG rootCreationMs = 0;
  napi_env environment = nullptr;
  bool assigned = false;
};

static std::mutex swaProviderJobMutex;
static std::unordered_set<SwaProviderJob*> swaProviderJobs;

static ULONGLONG SwaProcessCreation(HANDLE process, Napi::Env env) {
  FILETIME creation{}, exit{}, kernel{}, user{};
  if (!GetProcessTimes(process, &creation, &exit, &kernel, &user)) throw Napi::Error::New(env, "SWA process creation time unavailable");
  ULARGE_INTEGER value{};
  value.LowPart = creation.dwLowDateTime;
  value.HighPart = creation.dwHighDateTime;
  return value.QuadPart / 10000ULL - 11644473600000ULL;
}

static SwaProviderJob* SwaOwnedJob(const Napi::CallbackInfo& info, size_t count) {
  if (info.Length() != count || !info[0].IsExternal()) throw Napi::TypeError::New(info.Env(), "SWA requires its actual native Job object");
  auto* value = info[0].As<Napi::External<SwaProviderJob>>().Data();
  if (swaProviderJobs.find(value) == swaProviderJobs.end() || value->environment != info.Env() || value->ownerPid != GetCurrentProcessId() || value->job == nullptr) throw Napi::Error::New(info.Env(), "SWA Job ownership unavailable");
  return value;
}

static std::vector<ULONG_PTR> SwaJobMembers(HANDLE job, Napi::Env env) {
  if (!job) throw Napi::Error::New(env, "SWA refuses a null or current Job query");
  DWORD capacity = 64;
  for (int attempt = 0; attempt < 8; attempt++) {
    const size_t bytes = sizeof(JOBOBJECT_BASIC_PROCESS_ID_LIST) + sizeof(ULONG_PTR) * capacity;
    std::vector<char> storage(bytes, 0);
    auto* list = reinterpret_cast<JOBOBJECT_BASIC_PROCESS_ID_LIST*>(storage.data());
    if (QueryInformationJobObject(job, JobObjectBasicProcessIdList, list, static_cast<DWORD>(bytes), nullptr)) {
      if (list->NumberOfAssignedProcesses == list->NumberOfProcessIdsInList) return std::vector<ULONG_PTR>(list->ProcessIdList, list->ProcessIdList + list->NumberOfProcessIdsInList);
    } else if (GetLastError() != ERROR_MORE_DATA) {
      throw Napi::Error::New(env, "SWA complete Job query failed");
    }
    capacity *= 4;
  }
  throw Napi::Error::New(env, "SWA Job member query remained incomplete");
}

static DWORD SwaJobLimits(HANDLE job, Napi::Env env) {
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  if (!job || !QueryInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits), nullptr)) throw Napi::Error::New(env, "SWA Job limit readback failed");
  const DWORD flags = limits.BasicLimitInformation.LimitFlags;
  if (!(flags & JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE) || (flags & (JOB_OBJECT_LIMIT_BREAKAWAY_OK | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK))) throw Napi::Error::New(env, "SWA Job containment limits changed");
  DWORD handleFlags = 0;
  if (!GetHandleInformation(job, &handleFlags) || (handleFlags & HANDLE_FLAG_INHERIT)) throw Napi::Error::New(env, "SWA Job handle inheritance is unsafe");
  return flags;
}

static Napi::Value SwaCreateProviderJob(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() != 0) throw Napi::TypeError::New(env, "SWA Job creation takes no public handle or name");
  std::lock_guard<std::mutex> lock(swaProviderJobMutex);
  auto* value = new SwaProviderJob();
  value->ownerPid = GetCurrentProcessId();
  value->environment = env;
  value->job = CreateJobObjectW(nullptr, nullptr);
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!value->job || !SetHandleInformation(value->job, HANDLE_FLAG_INHERIT, 0) || !SetInformationJobObject(value->job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
    if (value->job) CloseHandle(value->job);
    delete value;
    throw Napi::Error::New(env, "SWA private Job creation failed");
  }
  swaProviderJobs.insert(value);
  return Napi::External<SwaProviderJob>::New(env, value, [](Napi::Env, SwaProviderJob* target) {
    std::lock_guard<std::mutex> guard(swaProviderJobMutex);
    if (target->job) CloseHandle(target->job);
    if (target->root) CloseHandle(target->root);
    swaProviderJobs.erase(target);
    delete target;
  });
}

static Napi::Value SwaAssignProviderJob(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::mutex> lock(swaProviderJobMutex);
  auto* value = SwaOwnedJob(info, 3);
  if (!info[1].IsNumber() || !info[2].IsNumber() || value->assigned || value->root) throw Napi::Error::New(env, "SWA Job cannot be reassigned");
  const DWORD pid = info[1].As<Napi::Number>().Uint32Value();
  const double expected = info[2].As<Napi::Number>().DoubleValue();
  if (!pid || pid == value->ownerPid || expected <= 0 || !SwaJobMembers(value->job, env).empty()) throw Napi::Error::New(env, "SWA Job root must be its new exact child");
  SwaJobLimits(value->job, env);
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_QUOTA | PROCESS_TERMINATE | SYNCHRONIZE, FALSE, pid);
  if (!process) throw Napi::Error::New(env, "SWA exact child handle unavailable");
  ULONGLONG creation;
  try { creation = SwaProcessCreation(process, env); }
  catch (...) { CloseHandle(process); throw; }
  if (static_cast<double>(creation) != expected) { CloseHandle(process); throw Napi::Error::New(env, "SWA child creation identity changed"); }
  for (const auto* other : swaProviderJobs) {
    if (other != value && other->root && other->rootPid == pid && other->rootCreationMs == creation) {
      CloseHandle(process);
      throw Napi::Error::New(env, "SWA root already belongs to another owned Provider Job");
    }
  }
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) { CloseHandle(process); throw Napi::Error::New(env, "SWA child parent observation failed"); }
  PROCESSENTRY32W row{};
  row.dwSize = sizeof(row);
  bool parentMatches = false;
  if (Process32FirstW(snapshot, &row)) do {
    if (row.th32ProcessID == pid) { parentMatches = row.th32ParentProcessID == value->ownerPid; break; }
  } while (Process32NextW(snapshot, &row));
  CloseHandle(snapshot);
  if (!parentMatches) { CloseHandle(process); throw Napi::Error::New(env, "SWA Job root is not this runtime's child"); }
  value->root = process;
  value->rootPid = pid;
  value->rootCreationMs = creation;
  if (!AssignProcessToJobObject(value->job, process)) throw Napi::Error::New(env, "SWA Job assignment or nesting refused");
  value->assigned = true;
  BOOL inside = FALSE;
  if (!IsProcessInJob(process, value->job, &inside) || !inside) throw Napi::Error::New(env, "SWA Job root membership unconfirmed");
  return Napi::Boolean::New(env, true);
}

static Napi::Value SwaQueryProviderJob(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::mutex> lock(swaProviderJobMutex);
  auto* value = SwaOwnedJob(info, 1);
  const DWORD flags = SwaJobLimits(value->job, env);
  const auto pids = SwaJobMembers(value->job, env);
  auto members = Napi::Array::New(env, pids.size());
  for (size_t index = 0; index < pids.size(); index++) {
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE, static_cast<DWORD>(pids[index]));
    if (!process) throw Napi::Error::New(env, "SWA Job member identity unavailable");
    ULONGLONG creation;
    try { creation = SwaProcessCreation(process, env); }
    catch (...) { CloseHandle(process); throw; }
    BOOL inside = FALSE;
    if (!IsProcessInJob(process, value->job, &inside) || !inside) { CloseHandle(process); throw Napi::Error::New(env, "SWA Job member changed during observation"); }
    CloseHandle(process);
    auto member = Napi::Object::New(env);
    member.Set("pid", Napi::Number::New(env, static_cast<double>(pids[index])));
    member.Set("creationTimeMs", Napi::Number::New(env, static_cast<double>(creation)));
    members.Set(index, member);
  }
  DWORD rootState = value->root ? WaitForSingleObject(value->root, 0) : WAIT_TIMEOUT;
  if (rootState == WAIT_FAILED) throw Napi::Error::New(env, "SWA root exit observation failed");
  auto result = Napi::Object::New(env);
  result.Set("ownerPid", Napi::Number::New(env, value->ownerPid));
  result.Set("rootPid", Napi::Number::New(env, value->rootPid));
  result.Set("rootCreationTimeMs", Napi::Number::New(env, static_cast<double>(value->rootCreationMs)));
  result.Set("assigned", Napi::Boolean::New(env, value->assigned));
  result.Set("rootExited", Napi::Boolean::New(env, rootState == WAIT_OBJECT_0));
  result.Set("limitFlags", Napi::Number::New(env, flags));
  result.Set("members", members);
  return result;
}

static Napi::Value SwaTerminateProviderJob(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> lock(swaProviderJobMutex);
  auto* value = SwaOwnedJob(info, 1);
  SwaJobLimits(value->job, info.Env());
  if (!value->assigned || !TerminateJobObject(value->job, 1)) throw Napi::Error::New(info.Env(), "SWA exact Job termination request failed");
  return Napi::Boolean::New(info.Env(), true);
}

static Napi::Value SwaCloseProviderJob(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> lock(swaProviderJobMutex);
  auto* value = SwaOwnedJob(info, 1);
  if (!SwaJobMembers(value->job, info.Env()).empty() || (value->root && WaitForSingleObject(value->root, 0) != WAIT_OBJECT_0)) throw Napi::Error::New(info.Env(), "SWA refuses to close a Job with unconfirmed remaining processes");
  if (!CloseHandle(value->job)) throw Napi::Error::New(info.Env(), "SWA exact Job handle close failed");
  value->job = nullptr;
  if (value->root) { CloseHandle(value->root); value->root = nullptr; }
  return Napi::Boolean::New(info.Env(), true);
}
