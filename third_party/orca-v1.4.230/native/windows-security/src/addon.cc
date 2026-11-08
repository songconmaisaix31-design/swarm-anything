// In-process Windows DACL reads and writes for Orca's secure files.
//
// Why native: the alternative is spawning icacls.exe, which blocked the main thread for seconds
// per write on hosts with slow process creation (#26027), and whose `/reset` + `/inheritance:r`
// shape behavioural EDR scores as ransomware (#25583). Policy (which SIDs, which flags) lives in
// JS; this file writes DACLs given as SDDL and reads them back as plain structure.
// 窄例外是新建私有目录：固定 TokenUser owner 与 User/SYSTEM DACL 在创建时设置。

#include <napi.h>
#include <windows.h>
#include <aclapi.h>
#include <sddl.h>

#include <functional>
#include <cmath>
#include <memory>
#include <string>
#include <vector>

namespace {

struct Win32Result {
  DWORD code = ERROR_SUCCESS;
  const char* syscall = "";
  bool ok() const { return code == ERROR_SUCCESS; }
};

Win32Result Fail(const char* syscall, DWORD code) { return Win32Result{code, syscall}; }

struct LocalDeleter {
  void operator()(void* pointer) const { LocalFree(pointer); }
};
using LocalPtr = std::unique_ptr<void, LocalDeleter>;

struct HandleDeleter {
  void operator()(void* pointer) const { CloseHandle(pointer); }
};
using HandlePtr = std::unique_ptr<void, HandleDeleter>;

Napi::Error ToError(Napi::Env env, const Win32Result& result) {
  return Napi::Error::New(
      env, std::string(result.syscall) + " failed with Win32 error " + std::to_string(result.code));
}

Win32Result ParseSddl(const std::u16string& sddl, LocalPtr* descriptor) {
  PSECURITY_DESCRIPTOR raw = nullptr;
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
          reinterpret_cast<LPCWSTR>(sddl.c_str()), SDDL_REVISION_1, &raw, nullptr)) {
    return Fail("ConvertStringSecurityDescriptorToSecurityDescriptorW", GetLastError());
  }
  descriptor->reset(raw);
  return {};
}

// The descriptor's own protection bit decides: a replacement DACL carries the caller's choice, and
// a grant re-reads the object's, so adding one rule never flips inheritance on or off.
Win32Result DaclInformationFor(PSECURITY_DESCRIPTOR descriptor, SECURITY_INFORMATION* information) {
  SECURITY_DESCRIPTOR_CONTROL control = 0;
  DWORD revision = 0;
  if (!GetSecurityDescriptorControl(descriptor, &control, &revision)) {
    return Fail("GetSecurityDescriptorControl", GetLastError());
  }
  *information = DACL_SECURITY_INFORMATION | ((control & SE_DACL_PROTECTED)
                                                  ? PROTECTED_DACL_SECURITY_INFORMATION
                                                  : UNPROTECTED_DACL_SECURITY_INFORMATION);
  return {};
}

Win32Result ApplyDacl(std::u16string path, const std::u16string& sddl) {
  LocalPtr descriptor;
  auto parsed = ParseSddl(sddl, &descriptor);
  if (!parsed.ok()) {
    return parsed;
  }
  BOOL present = FALSE;
  BOOL defaulted = FALSE;
  PACL dacl = nullptr;
  if (!GetSecurityDescriptorDacl(descriptor.get(), &present, &dacl, &defaulted)) {
    return Fail("GetSecurityDescriptorDacl", GetLastError());
  }
  // A missing DACL means "everyone, full control"; never install that by accident.
  if (!present || dacl == nullptr) {
    return Fail("GetSecurityDescriptorDacl", ERROR_INVALID_SECURITY_DESCR);
  }
  SECURITY_INFORMATION information = 0;
  auto control = DaclInformationFor(descriptor.get(), &information);
  if (!control.ok()) {
    return control;
  }
  DWORD status = SetNamedSecurityInfoW(reinterpret_cast<LPWSTR>(path.data()), SE_FILE_OBJECT,
                                       information, nullptr, nullptr, dacl, nullptr);
  return status == ERROR_SUCCESS ? Win32Result{} : Fail("SetNamedSecurityInfoW", status);
}

Win32Result AbsoluteDirectoryPath(const std::u16string& path, bool* absolute) {
  *absolute = false;
  const auto* input = reinterpret_cast<LPCWSTR>(path.c_str());
  DWORD length = GetFullPathNameW(input, 0, nullptr, nullptr);
  if (length == 0) return Fail("GetFullPathNameW", GetLastError());
  std::vector<WCHAR> full(length);
  DWORD written = GetFullPathNameW(input, length, full.data(), nullptr);
  if (written == 0) return Fail("GetFullPathNameW", GetLastError());
  if (written >= length) return Fail("GetFullPathNameW", ERROR_INSUFFICIENT_BUFFER);
  int comparison = CompareStringOrdinal(input, static_cast<int>(path.size()), full.data(),
                                         static_cast<int>(written), TRUE);
  if (comparison == 0) return Fail("CompareStringOrdinal", GetLastError());
  *absolute = comparison == CSTR_EQUAL;
  return {};
}

Win32Result CreatePrivateDirectory(const std::u16string& path, bool* created) {
  *created = false;
  HANDLE rawToken = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &rawToken)) {
    return Fail("OpenProcessToken", GetLastError());
  }
  HandlePtr token(rawToken);
  DWORD size = 0;
  GetTokenInformation(token.get(), TokenUser, nullptr, 0, &size);
  if (size == 0) return Fail("GetTokenInformation", GetLastError());
  std::vector<BYTE> userBuffer(size);
  if (!GetTokenInformation(token.get(), TokenUser, userBuffer.data(), size, &size)) {
    return Fail("GetTokenInformation", GetLastError());
  }
  PSID user = reinterpret_cast<TOKEN_USER*>(userBuffer.data())->User.Sid;
  std::vector<BYTE> systemBuffer(SECURITY_MAX_SID_SIZE);
  DWORD systemSize = static_cast<DWORD>(systemBuffer.size());
  if (!CreateWellKnownSid(WinLocalSystemSid, nullptr, systemBuffer.data(), &systemSize)) {
    return Fail("CreateWellKnownSid", GetLastError());
  }
  PSID system = systemBuffer.data();
  PSID trustees[] = {user, system};
  const ULONG count = EqualSid(user, system) ? 1 : 2;
  EXPLICIT_ACCESSW entries[2]{};
  for (ULONG index = 0; index < count; index++) {
    entries[index].grfAccessPermissions = FILE_ALL_ACCESS;
    entries[index].grfAccessMode = SET_ACCESS;
    entries[index].grfInheritance = SUB_CONTAINERS_AND_OBJECTS_INHERIT;
    entries[index].Trustee.TrusteeForm = TRUSTEE_IS_SID;
    entries[index].Trustee.TrusteeType = TRUSTEE_IS_UNKNOWN;
    entries[index].Trustee.ptstrName = reinterpret_cast<LPWSTR>(trustees[index]);
  }
  PACL rawAcl = nullptr;
  DWORD status = SetEntriesInAclW(count, entries, nullptr, &rawAcl);
  if (status != ERROR_SUCCESS) return Fail("SetEntriesInAclW", status);
  LocalPtr acl(rawAcl);
  SECURITY_DESCRIPTOR descriptor{};
  if (!InitializeSecurityDescriptor(&descriptor, SECURITY_DESCRIPTOR_REVISION)) {
    return Fail("InitializeSecurityDescriptor", GetLastError());
  }
  if (!SetSecurityDescriptorOwner(&descriptor, user, FALSE)) {
    return Fail("SetSecurityDescriptorOwner", GetLastError());
  }
  if (!SetSecurityDescriptorDacl(&descriptor, TRUE, rawAcl, FALSE)) {
    return Fail("SetSecurityDescriptorDacl", GetLastError());
  }
  if (!SetSecurityDescriptorControl(&descriptor, SE_DACL_PROTECTED, SE_DACL_PROTECTED)) {
    return Fail("SetSecurityDescriptorControl", GetLastError());
  }
  // owner 和受保护 DACL 随新目录一起建立；既有对象不接受任何安全信息写入。
  SECURITY_ATTRIBUTES attributes{sizeof(attributes), &descriptor, FALSE};
  if (CreateDirectoryW(reinterpret_cast<LPCWSTR>(path.c_str()), &attributes)) {
    *created = true;
    return {};
  }
  DWORD error = GetLastError();
  return error == ERROR_ALREADY_EXISTS ? Win32Result{} : Fail("CreateDirectoryW", error);
}

Win32Result GrantAccess(std::u16string path, const std::u16string& sid, DWORD mask,
                        bool inheritable, bool replace) {
  PSECURITY_DESCRIPTOR rawDescriptor = nullptr;
  PACL existing = nullptr;
  DWORD status = GetNamedSecurityInfoW(reinterpret_cast<LPCWSTR>(path.c_str()), SE_FILE_OBJECT,
                                       DACL_SECURITY_INFORMATION, nullptr, nullptr, &existing,
                                       nullptr, &rawDescriptor);
  if (status != ERROR_SUCCESS) {
    return Fail("GetNamedSecurityInfoW", status);
  }
  LocalPtr descriptor(rawDescriptor);
  // A NULL DACL already grants everyone everything; merging into it would build a DACL holding
  // only this rule and lock every other principal out.
  if (existing == nullptr) {
    return {};
  }
  PSID rawSid = nullptr;
  if (!ConvertStringSidToSidW(reinterpret_cast<LPCWSTR>(sid.c_str()), &rawSid)) {
    return Fail("ConvertStringSidToSidW", GetLastError());
  }
  LocalPtr trusteeSid(rawSid);

  EXPLICIT_ACCESSW access{};
  access.grfAccessPermissions = mask;
  access.grfAccessMode = replace ? SET_ACCESS : GRANT_ACCESS;
  access.grfInheritance = inheritable ? SUB_CONTAINERS_AND_OBJECTS_INHERIT : NO_INHERITANCE;
  access.Trustee.TrusteeForm = TRUSTEE_IS_SID;
  access.Trustee.TrusteeType = TRUSTEE_IS_UNKNOWN;
  access.Trustee.ptstrName = reinterpret_cast<LPWSTR>(rawSid);

  PACL merged = nullptr;
  status = SetEntriesInAclW(1, &access, existing, &merged);
  if (status != ERROR_SUCCESS) {
    return Fail("SetEntriesInAclW", status);
  }
  LocalPtr mergedAcl(merged);
  SECURITY_INFORMATION information = 0;
  auto control = DaclInformationFor(descriptor.get(), &information);
  if (!control.ok()) {
    return control;
  }
  status = SetNamedSecurityInfoW(reinterpret_cast<LPWSTR>(path.data()), SE_FILE_OBJECT,
                                 information, nullptr, nullptr, merged, nullptr);
  return status == ERROR_SUCCESS ? Win32Result{} : Fail("SetNamedSecurityInfoW", status);
}

Win32Result CreateFileWithDacl(const std::u16string& path, const std::u16string& sddl,
                               const uint8_t* data, size_t length) {
  LocalPtr descriptor;
  auto parsed = ParseSddl(sddl, &descriptor);
  if (!parsed.ok()) {
    return parsed;
  }
  if (length > MAXDWORD) {
    return Fail("WriteFile", ERROR_INVALID_PARAMETER);
  }
  SECURITY_ATTRIBUTES attributes{sizeof(attributes), descriptor.get(), FALSE};
  // Why CREATE_NEW: the descriptor only applies to a file this call creates; opening an
  // existing one would keep that file's (possibly broader) DACL. Share mode 0 keeps every other
  // opener out until the contents are complete.
  HANDLE file = CreateFileW(reinterpret_cast<LPCWSTR>(path.c_str()), GENERIC_WRITE, 0,
                            &attributes, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) {
    return Fail("CreateFileW", GetLastError());
  }
  Win32Result result;
  DWORD written = 0;
  if (!WriteFile(file, data, static_cast<DWORD>(length), &written, nullptr)) {
    result = Fail("WriteFile", GetLastError());
  } else if (written != length) {
    result = Fail("WriteFile", ERROR_WRITE_FAULT);
  }
  // A failed close can mean lost data on a network volume, so it tears the file like a failed write.
  if (!CloseHandle(file) && result.ok()) {
    result = Fail("CloseHandle", GetLastError());
  }
  if (!result.ok()) {
    // A torn temp file is useless to the caller and must not linger beside the real one.
    DeleteFileW(reinterpret_cast<LPCWSTR>(path.c_str()));
  }
  return result;
}

bool ReadGrantOptions(const Napi::Value& value, bool* inheritable, bool* replace) {
  if (!value.IsObject()) {
    return false;
  }
  auto options = value.As<Napi::Object>();
  auto inherit = options.Get("inheritable");
  auto replaceValue = options.Get("replace");
  if (!inherit.IsBoolean() || !replaceValue.IsBoolean()) {
    return false;
  }
  *inheritable = inherit.As<Napi::Boolean>().Value();
  *replace = replaceValue.As<Napi::Boolean>().Value();
  return true;
}

Napi::Value ThrowTypeError(Napi::Env env, const char* signature) {
  Napi::TypeError::New(env, signature).ThrowAsJavaScriptException();
  return env.Undefined();
}

Napi::Value SidString(Napi::Env env, PSID sid) {
  LPWSTR text = nullptr;
  if (!ConvertSidToStringSidW(sid, &text)) {
    ToError(env, Fail("ConvertSidToStringSidW", GetLastError())).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  LocalPtr owned(text);
  return Napi::String::New(env, reinterpret_cast<char16_t*>(text));
}

Napi::Value CurrentUserSid(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) {
    ToError(env, Fail("OpenProcessToken", GetLastError())).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  DWORD size = 0;
  GetTokenInformation(token, TokenUser, nullptr, 0, &size);
  std::vector<BYTE> buffer(size);
  BOOL queried = size > 0 && GetTokenInformation(token, TokenUser, buffer.data(), size, &size);
  DWORD queryError = GetLastError();
  CloseHandle(token);
  if (!queried) {
    ToError(env, Fail("GetTokenInformation", queryError)).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  return SidString(env, reinterpret_cast<TOKEN_USER*>(buffer.data())->User.Sid);
}

// Structure only, no policy: `{ protected, aces: [{ type, flags, mask, sid }] }`, or null for a
// NULL DACL. Only plain allow/deny ACEs carry a SID; every other type comes back with sid null so
// the caller can refuse what it does not understand (object, callback and conditional ACEs).
Napi::Value GetDaclAces(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    return ThrowTypeError(env, "getDaclAces(path: string)");
  }
  auto path = info[0].As<Napi::String>().Utf16Value();
  PSECURITY_DESCRIPTOR rawDescriptor = nullptr;
  PACL dacl = nullptr;
  PSID owner = nullptr;
  DWORD status = GetNamedSecurityInfoW(reinterpret_cast<LPCWSTR>(path.c_str()), SE_FILE_OBJECT,
                                       DACL_SECURITY_INFORMATION | OWNER_SECURITY_INFORMATION, &owner, nullptr, &dacl,
                                       nullptr, &rawDescriptor);
  if (status != ERROR_SUCCESS) {
    ToError(env, Fail("GetNamedSecurityInfoW", status)).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  LocalPtr descriptor(rawDescriptor);
  if (dacl == nullptr) {
    return env.Null();
  }
  SECURITY_DESCRIPTOR_CONTROL control = 0;
  DWORD revision = 0;
  if (!GetSecurityDescriptorControl(rawDescriptor, &control, &revision)) {
    ToError(env, Fail("GetSecurityDescriptorControl", GetLastError())).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  auto aces = Napi::Array::New(env, dacl->AceCount);
  for (DWORD index = 0; index < dacl->AceCount; index++) {
    void* raw = nullptr;
    if (!GetAce(dacl, index, &raw)) {
      ToError(env, Fail("GetAce", GetLastError())).ThrowAsJavaScriptException();
      return env.Undefined();
    }
    auto* header = static_cast<ACE_HEADER*>(raw);
    auto ace = Napi::Object::New(env);
    ace.Set("type", Napi::Number::New(env, header->AceType));
    ace.Set("flags", Napi::Number::New(env, header->AceFlags));
    // ACCESS_ALLOWED_ACE and ACCESS_DENIED_ACE share this layout: Mask, then SidStart.
    if (header->AceType == ACCESS_ALLOWED_ACE_TYPE || header->AceType == ACCESS_DENIED_ACE_TYPE) {
      auto* plain = static_cast<ACCESS_ALLOWED_ACE*>(raw);
      ace.Set("mask", Napi::Number::New(env, plain->Mask));
      auto sid = SidString(env, &plain->SidStart);
      if (env.IsExceptionPending()) {
        return env.Undefined();
      }
      ace.Set("sid", sid);
    } else {
      ace.Set("mask", Napi::Number::New(env, 0));
      ace.Set("sid", env.Null());
    }
    aces.Set(index, ace);
  }
  auto result = Napi::Object::New(env);
  if (owner == nullptr) {
    ToError(env, Fail("GetNamedSecurityInfoW owner", ERROR_INVALID_SECURITY_DESCR)).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  auto ownerSid = SidString(env, owner);
  if (env.IsExceptionPending()) return env.Undefined();
  result.Set("ownerSid", ownerSid);
  result.Set("protected", Napi::Boolean::New(env, (control & SE_DACL_PROTECTED) != 0));
  result.Set("aces", aces);
  return result;
}

Napi::Value SetDaclSddl(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    return ThrowTypeError(env, "setDaclSddl(path: string, sddl: string)");
  }
  auto result = ApplyDacl(info[0].As<Napi::String>().Utf16Value(),
                          info[1].As<Napi::String>().Utf16Value());
  if (!result.ok()) {
    ToError(env, result).ThrowAsJavaScriptException();
  }
  return env.Undefined();
}

Napi::Value CreatePrivateDirectoryJs(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() != 1 || !info[0].IsString()) {
    return ThrowTypeError(env, "createPrivateDirectory(path: string)");
  }
  const auto path = info[0].As<Napi::String>().Utf16Value();
  if (path.empty() || path.size() > 32767 || path.find(u'\0') != std::u16string::npos) {
    return ThrowTypeError(env, "createPrivateDirectory requires an absolute nonempty path without NUL");
  }
  bool absolute = false;
  auto validation = AbsoluteDirectoryPath(path, &absolute);
  if (!validation.ok()) {
    ToError(env, validation).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (!absolute) return ThrowTypeError(env, "createPrivateDirectory requires an absolute path");
  bool created = false;
  auto result = CreatePrivateDirectory(path, &created);
  if (!result.ok()) {
    ToError(env, result).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  return Napi::Boolean::New(env, created);
}

Napi::Value ReadServiceJobMember(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() != 2 || !info[0].IsString() || !info[1].IsNumber()) return ThrowTypeError(env, "readServiceJobMember(name: string, pid: number)");
  const auto name = info[0].As<Napi::String>().Utf16Value();
  const double requested = info[1].As<Napi::Number>().DoubleValue();
  if (name.rfind(u"Local\\SWAService", 0) != 0 || name.size() > 256 || !std::isfinite(requested) || requested <= 0 || requested > MAXDWORD || std::floor(requested) != requested) return ThrowTypeError(env, "SWA service Job identity is invalid");
  HandlePtr job(OpenJobObjectW(JOB_OBJECT_QUERY | READ_CONTROL, FALSE, reinterpret_cast<LPCWSTR>(name.c_str())));
  if (!job) { ToError(env, Fail("OpenJobObjectW", GetLastError())).ThrowAsJavaScriptException(); return env.Undefined(); }
  HandlePtr process(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE, static_cast<DWORD>(requested)));
  if (!process) { ToError(env, Fail("OpenProcess", GetLastError())).ThrowAsJavaScriptException(); return env.Undefined(); }
  BOOL member = FALSE;
  if (!IsProcessInJob(process.get(), job.get(), &member) || !member || WaitForSingleObject(process.get(), 0) != WAIT_TIMEOUT) { Napi::Error::New(env, "SWA service Job live membership is unavailable").ThrowAsJavaScriptException(); return env.Undefined(); }
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  if (!QueryInformationJobObject(job.get(), JobObjectExtendedLimitInformation, &limits, sizeof(limits), nullptr) || limits.BasicLimitInformation.LimitFlags != 0) { Napi::Error::New(env, "SWA service Job limits changed").ThrowAsJavaScriptException(); return env.Undefined(); }
  FILETIME created{}, exited{}, kernel{}, user{};
  if (!GetProcessTimes(process.get(), &created, &exited, &kernel, &user)) { ToError(env, Fail("GetProcessTimes", GetLastError())).ThrowAsJavaScriptException(); return env.Undefined(); }
  ULARGE_INTEGER time{};
  time.LowPart = created.dwLowDateTime;
  time.HighPart = created.dwHighDateTime;
  PSID owner = nullptr;
  PACL dacl = nullptr;
  PSECURITY_DESCRIPTOR raw = nullptr;
  const DWORD status = GetSecurityInfo(job.get(), SE_KERNEL_OBJECT, OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION, &owner, nullptr, &dacl, nullptr, &raw);
  LocalPtr descriptor(raw);
  if (status != ERROR_SUCCESS || !owner || !dacl) { ToError(env, Fail("GetSecurityInfo", status == ERROR_SUCCESS ? ERROR_INVALID_SECURITY_DESCR : status)).ThrowAsJavaScriptException(); return env.Undefined(); }
  SECURITY_DESCRIPTOR_CONTROL control = 0;
  DWORD revision = 0;
  if (!GetSecurityDescriptorControl(raw, &control, &revision)) { ToError(env, Fail("GetSecurityDescriptorControl", GetLastError())).ThrowAsJavaScriptException(); return env.Undefined(); }
  auto aces = Napi::Array::New(env, dacl->AceCount);
  for (DWORD index = 0; index < dacl->AceCount; index++) {
    void* entry = nullptr;
    if (!GetAce(dacl, index, &entry)) { ToError(env, Fail("GetAce", GetLastError())).ThrowAsJavaScriptException(); return env.Undefined(); }
    auto* header = static_cast<ACE_HEADER*>(entry);
    if (header->AceType != ACCESS_ALLOWED_ACE_TYPE) { Napi::Error::New(env, "SWA service Job ACE type changed").ThrowAsJavaScriptException(); return env.Undefined(); }
    auto* allowed = static_cast<ACCESS_ALLOWED_ACE*>(entry);
    auto sid = SidString(env, &allowed->SidStart);
    if (env.IsExceptionPending()) return env.Undefined();
    auto ace = Napi::Object::New(env);
    ace.Set("sid", sid);
    ace.Set("mask", Napi::Number::New(env, allowed->Mask));
    ace.Set("flags", Napi::Number::New(env, header->AceFlags));
    aces.Set(index, ace);
  }
  auto ownerSid = SidString(env, owner);
  if (env.IsExceptionPending()) return env.Undefined();
  auto result = Napi::Object::New(env);
  result.Set("name", info[0]);
  result.Set("pid", Napi::Number::New(env, requested));
  result.Set("creationTimeMs", Napi::Number::New(env, static_cast<double>(time.QuadPart / 10000ULL - 11644473600000ULL)));
  result.Set("ownerSid", ownerSid);
  result.Set("protected", Napi::Boolean::New(env, (control & SE_DACL_PROTECTED) != 0));
  result.Set("aces", aces);
  return result;
}

Napi::Value CreateFileWithDaclJs(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() < 3 || !info[0].IsString() || !info[1].IsString() ||
      !info[2].IsTypedArray()) {
    return ThrowTypeError(env, "createFileWithDacl(path: string, sddl: string, data: Uint8Array)");
  }
  auto data = info[2].As<Napi::Uint8Array>();
  auto result = CreateFileWithDacl(info[0].As<Napi::String>().Utf16Value(),
                                   info[1].As<Napi::String>().Utf16Value(), data.Data(),
                                   data.ByteLength());
  if (!result.ok()) {
    ToError(env, result).ThrowAsJavaScriptException();
  }
  return env.Undefined();
}

bool ReadGrantArguments(const Napi::CallbackInfo& info, std::u16string* path, std::u16string* sid,
                        DWORD* mask, bool* inheritable, bool* replace) {
  if (info.Length() < 4 || !info[0].IsString() || !info[1].IsString() || !info[2].IsNumber() ||
      !ReadGrantOptions(info[3], inheritable, replace)) {
    return false;
  }
  *path = info[0].As<Napi::String>().Utf16Value();
  *sid = info[1].As<Napi::String>().Utf16Value();
  *mask = info[2].As<Napi::Number>().Uint32Value();
  return true;
}

constexpr const char* kGrantSignature =
    "grantAccess(path: string, sid: string, accessMask: number, "
    "options: { inheritable: boolean, replace: boolean })";

Napi::Value GrantAccessJs(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::u16string path, sid;
  DWORD mask = 0;
  bool inheritable = false, replace = false;
  if (!ReadGrantArguments(info, &path, &sid, &mask, &inheritable, &replace)) {
    return ThrowTypeError(env, kGrantSignature);
  }
  auto result = GrantAccess(path, sid, mask, inheritable, replace);
  if (!result.ok()) {
    ToError(env, result).ThrowAsJavaScriptException();
  }
  return env.Undefined();
}

// Why a worker: a directory DACL change walks every descendant (seconds on a large userData).
class DaclWorker : public Napi::AsyncWorker {
 public:
  DaclWorker(Napi::Env env, std::function<Win32Result()> work)
      : Napi::AsyncWorker(env), deferred_(Napi::Promise::Deferred::New(env)),
        work_(std::move(work)) {}

  Napi::Promise Promise() { return deferred_.Promise(); }

  void Execute() override { result_ = work_(); }
  void OnOK() override {
    if (result_.ok()) {
      deferred_.Resolve(Env().Undefined());
    } else {
      deferred_.Reject(ToError(Env(), result_).Value());
    }
  }

 private:
  Napi::Promise::Deferred deferred_;
  std::function<Win32Result()> work_;
  Win32Result result_;
};

Napi::Value SetDaclSddlAsync(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    return ThrowTypeError(env, "setDaclSddlAsync(path: string, sddl: string)");
  }
  auto path = info[0].As<Napi::String>().Utf16Value();
  auto sddl = info[1].As<Napi::String>().Utf16Value();
  auto* worker = new DaclWorker(env, [path, sddl]() { return ApplyDacl(path, sddl); });
  auto promise = worker->Promise();
  worker->Queue();
  return promise;
}

Napi::Value GrantAccessAsync(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::u16string path, sid;
  DWORD mask = 0;
  bool inheritable = false, replace = false;
  if (!ReadGrantArguments(info, &path, &sid, &mask, &inheritable, &replace)) {
    return ThrowTypeError(env, kGrantSignature);
  }
  auto* worker = new DaclWorker(env, [=]() {
    return GrantAccess(path, sid, mask, inheritable, replace);
  });
  auto promise = worker->Promise();
  worker->Queue();
  return promise;
}

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("currentUserSid", Napi::Function::New(env, CurrentUserSid));
  exports.Set("getDaclAces", Napi::Function::New(env, GetDaclAces));
  exports.Set("readServiceJobMember", Napi::Function::New(env, ReadServiceJobMember));
  exports.Set("setDaclSddl", Napi::Function::New(env, SetDaclSddl));
  exports.Set("setDaclSddlAsync", Napi::Function::New(env, SetDaclSddlAsync));
  exports.Set("createPrivateDirectory", Napi::Function::New(env, CreatePrivateDirectoryJs));
  exports.Set("createFileWithDacl", Napi::Function::New(env, CreateFileWithDaclJs));
  exports.Set("grantAccess", Napi::Function::New(env, GrantAccessJs));
  exports.Set("grantAccessAsync", Napi::Function::New(env, GrantAccessAsync));
  return exports;
}

NODE_API_MODULE(orca_windows_security, Init)
