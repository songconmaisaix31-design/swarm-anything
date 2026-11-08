#pragma once
#include <napi.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <sys/wait.h>
#include <fcntl.h>
#include <signal.h>
#include <unistd.h>
#include <cerrno>
#include <cmath>
#include <climits>
#include <mutex>
#include <set>

// 句柄只属于创建它的 Node 环境与进程，绝不接受外部裸 FD。
struct SwaLinuxPidfd {
  int fd = -1;
  pid_t pid = 0;
  pid_t owner = 0;
  napi_env environment = nullptr;
};
static std::mutex swaLinuxPidfdMutex;
static std::set<SwaLinuxPidfd*> swaLinuxPidfds;

static void SwaFinalizeLinuxPidfd(napi_env, void* data, void*) {
  auto* target = static_cast<SwaLinuxPidfd*>(data);
  std::lock_guard<std::mutex> lock(swaLinuxPidfdMutex);
  if (target->fd >= 0) close(target->fd);
  swaLinuxPidfds.erase(target);
  delete target;
}

static void SwaRequireLinuxSubreaper(Napi::Env env) {
  int enabled = 0;
  if (prctl(PR_GET_CHILD_SUBREAPER, &enabled) != 0 || enabled != 1)
    throw Napi::Error::New(env, "SWA Linux child subreaper is unavailable");
}

static int SwaLinuxWait(idtype_t type, id_t id, siginfo_t* observed) {
  int result;
  do { result = waitid(type, id, observed, WEXITED | WNOHANG | WNOWAIT); }
  while (result < 0 && errno == EINTR);
  return result;
}

static SwaLinuxPidfd* SwaOwnedLinuxPidfd(const Napi::CallbackInfo& info, size_t count) {
  if (info.Length() != count || !info[0].IsExternal())
    throw Napi::TypeError::New(info.Env(), "SWA requires its actual Linux pidfd object");
  auto* value = info[0].As<Napi::External<SwaLinuxPidfd>>().Data();
  if (swaLinuxPidfds.find(value) == swaLinuxPidfds.end() || value->environment != info.Env() ||
      value->owner != getpid() || value->fd < 0 || value->pid <= 0)
    throw Napi::Error::New(info.Env(), "SWA Linux pidfd ownership is unavailable");
  return value;
}

static siginfo_t SwaRequireLinuxDirectChild(SwaLinuxPidfd* value, Napi::Env env) {
  siginfo_t observed{};
  // P_PIDFD=3 是 Linux 内核 ABI；不依赖较新 glibc 的枚举声明。
  if (SwaLinuxWait(static_cast<idtype_t>(3), static_cast<id_t>(value->fd), &observed) != 0)
    throw Napi::Error::New(env, "SWA pidfd is not a queryable direct child");
  if (observed.si_pid != 0 && observed.si_pid != value->pid)
    throw Napi::Error::New(env, "SWA Linux pidfd child identity changed");
  return observed;
}

static Napi::Value SwaEnableChildSubreaper(const Napi::CallbackInfo& info) {
  if (info.Length() != 0) throw Napi::TypeError::New(info.Env(), "SWA subreaper takes no arguments");
  if (prctl(PR_SET_CHILD_SUBREAPER, 1) != 0)
    throw Napi::Error::New(info.Env(), "SWA Linux child subreaper could not be enabled");
  SwaRequireLinuxSubreaper(info.Env());
  return Napi::Boolean::New(info.Env(), true);
}

static Napi::Value SwaObserveChildExit(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() != 0) throw Napi::TypeError::New(env, "SWA child observation takes no arguments");
  SwaRequireLinuxSubreaper(env);
  siginfo_t observed{};
  const int result = SwaLinuxWait(P_ALL, 0, &observed);
  auto output = Napi::Object::New(env);
  if (result < 0) {
    if (errno != ECHILD) throw Napi::Error::New(env, "SWA Linux child inventory is unavailable");
    output.Set("state", "no-children");
  } else if (observed.si_pid == 0) {
    output.Set("state", "children-remain");
  } else {
    output.Set("state", "exited-child");
    output.Set("pid", Napi::Number::New(env, observed.si_pid));
    output.Set("code", Napi::Number::New(env, observed.si_code));
    output.Set("status", Napi::Number::New(env, observed.si_status));
  }
  return output;
}

static Napi::Value SwaOpenPidfd(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() != 1 || !info[0].IsNumber())
    throw Napi::TypeError::New(env, "SWA Linux pidfd requires an exact child PID");
  SwaRequireLinuxSubreaper(env);
  const double pid = info[0].As<Napi::Number>().DoubleValue();
  if (!std::isfinite(pid) || pid <= 0 || pid > INT_MAX || std::floor(pid) != pid || pid == getpid())
    throw Napi::TypeError::New(env, "SWA Linux child PID is invalid");
  auto* value = new SwaLinuxPidfd();
  value->pid = static_cast<pid_t>(pid);
  value->owner = getpid();
  value->environment = env;
  value->fd = static_cast<int>(syscall(SYS_pidfd_open, value->pid, 0));
  try {
    const int flags = value->fd < 0 ? -1 : fcntl(value->fd, F_GETFD);
    if (value->fd < 0 || flags < 0 || !(flags & FD_CLOEXEC))
      throw Napi::Error::New(env, "SWA noninheritable Linux pidfd is unavailable");
    SwaRequireLinuxDirectChild(value, env);
  } catch (...) {
    if (value->fd >= 0) close(value->fd);
    delete value;
    throw;
  }
  std::lock_guard<std::mutex> guard(swaLinuxPidfdMutex);
  swaLinuxPidfds.insert(value);
  napi_value external;
  if (napi_create_external(env, value, SwaFinalizeLinuxPidfd, nullptr, &external) != napi_ok) {
    swaLinuxPidfds.erase(value);
    close(value->fd);
    delete value;
    throw Napi::Error::New(env, "SWA Linux pidfd External creation failed");
  }
  return Napi::Value(env, external);
}

static Napi::Value SwaSignalPidfd(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> guard(swaLinuxPidfdMutex);
  auto* value = SwaOwnedLinuxPidfd(info, 2);
  SwaRequireLinuxSubreaper(info.Env());
  if (!info[1].IsString()) throw Napi::TypeError::New(info.Env(), "SWA requires a supported child signal");
  const auto name = info[1].As<Napi::String>().Utf8Value();
  const int signal = name == "SIGTERM" ? SIGTERM : name == "SIGKILL" ? SIGKILL : 0;
  if (!signal) throw Napi::TypeError::New(info.Env(), "SWA Linux child signal is unsupported");
  SwaRequireLinuxDirectChild(value, info.Env());
  if (syscall(SYS_pidfd_send_signal, value->fd, signal, nullptr, 0) != 0)
    throw Napi::Error::New(info.Env(), "SWA exact Linux child signal failed");
  return Napi::Boolean::New(info.Env(), true);
}

static Napi::Value SwaReapAdoptedChild(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> guard(swaLinuxPidfdMutex);
  auto* value = SwaOwnedLinuxPidfd(info, 1);
  SwaRequireLinuxSubreaper(info.Env());
  const auto observed = SwaRequireLinuxDirectChild(value, info.Env());
  if (observed.si_pid != value->pid)
    throw Napi::Error::New(info.Env(), "SWA refuses to reap a child without observed exit");
  int status = 0;
  pid_t result;
  do { result = waitpid(value->pid, &status, WNOHANG); } while (result < 0 && errno == EINTR);
  if (result != value->pid)
    throw Napi::Error::New(info.Env(), "SWA exact adopted child reap was not observed");
  return Napi::Boolean::New(info.Env(), true);
}

static Napi::Value SwaClosePidfd(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> guard(swaLinuxPidfdMutex);
  auto* value = SwaOwnedLinuxPidfd(info, 1);
  const int fd = value->fd;
  value->fd = -1;
  if (close(fd) != 0) throw Napi::Error::New(info.Env(), "SWA Linux pidfd close failed");
  return Napi::Boolean::New(info.Env(), true);
}

static void RegisterSwaProviderProcessLinux(Napi::Env env, Napi::Object exports) {
  exports.Set("providerLinuxIsolationVersion", Napi::Number::New(env, 1));
  exports.Set("enableSwaChildSubreaper", Napi::Function::New(env, SwaEnableChildSubreaper));
  exports.Set("observeSwaChildExit", Napi::Function::New(env, SwaObserveChildExit));
  exports.Set("openSwaPidfd", Napi::Function::New(env, SwaOpenPidfd));
  exports.Set("signalSwaPidfd", Napi::Function::New(env, SwaSignalPidfd));
  exports.Set("reapSwaAdoptedChild", Napi::Function::New(env, SwaReapAdoptedChild));
  exports.Set("closeSwaPidfd", Napi::Function::New(env, SwaClosePidfd));
}
