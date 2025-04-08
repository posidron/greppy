import { PatternConfig } from "../models/types";

// C/C++ file extensions - expanded to include more specialized file types
export const CPP_FILE_TYPES = [
  "c",
  "cpp",
  "h",
  "hpp",
  "cc",
  "cxx",
  "c++",
  "hxx",
  "h++",
  "ixx", // C++20 modules interface
  "cppm", // C++20 modules implementation
  "cu", // CUDA files
  "inl", // Inline implementation files
  "tpp", // Template implementation files
  "txx", // Template implementation files (alternative extension)
  "mxx", // Module implementation files
];

/**
 * Advanced security patterns for modern C/C++ codebases (2025).
 * Covers memory safety, concurrency issues, and modern C++ misuse.
 */
export const CPP_PATTERNS: PatternConfig[] = [
  // === Memory Safety Patterns ===
  {
    name: "Unsafe Memory Allocation",
    description:
      "Finds manual memory allocation without proper checks or RAII patterns",
    tool: "ripgrep",
    pattern: "(malloc|calloc|realloc)\\s*\\([^\\)]*\\)(?!\\s*(?:\\?|or|&&))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Use smart pointers (std::unique_ptr, std::shared_ptr) or containers instead of raw memory allocation",
  },
  {
    name: "Banned Legacy C Functions",
    description:
      "Detects usage of dangerous C functions that have safer alternatives",
    tool: "ripgrep",
    pattern:
      "(strcpy|strcat|gets|sprintf|scanf|vsprintf|strncpy|strncat|gmtime|rand|strtok|asctime|atoi|atof|atol)\\s*\\(",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Use safer alternatives: std::string, std::format, std::chrono, std::random, std::from_chars",
  },
  {
    name: "Integer Arithmetic Vulnerabilities",
    description:
      "Detects patterns that might cause integer overflows, underflows, or wraparounds",
    tool: "ripgrep",
    pattern:
      "(?:\\b(?:int|long|short|size_t|uint\\w+_t)\\b.*?\\b(?:(?:\\+=|-=|\\*=|/=|<<|>>|\\+|\\-|\\*|/)\\s*(?:[^;]*?)))|\\((?:[^\\)]*)(?:\\+|\\-|\\*|\\/)(?:[^\\)]*)\\)\\s*(?:\\*|/)",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Use safe integer operations: std::safe_numerics, bounded arithmetic, or explicit overflow checks",
  },
  {
    name: "Buffer Overflow Risks",
    description:
      "Identifies buffer access patterns that might lead to overflows",
    tool: "ripgrep",
    pattern:
      "(?:\\[\\s*[^\\]]*?(?:\\+|\\-|\\*|/)\\s*[^\\]]*?\\])|(?:memcpy|memmove|memset)\\s*\\([^,]+,[^,]+,([^\\)]*)\\)",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Use std::span, std::array, or std::vector with .at() for bounds-checked access",
  },
  {
    name: "Pointer Arithmetic Risks",
    description: "Finds dangerous pointer arithmetic patterns",
    tool: "ripgrep",
    pattern:
      "\\w+\\s*(?:\\+|\\-|\\+=|\\-=)\\s*(?:\\w+|\\d+)(?!\\s*<\\s*(?:\\w+\\.(?:size|length|end)\\(\\)))",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation: "Use iterators or std::span instead of raw pointer arithmetic",
  },

  // === Modern C++ Misuse ===
  {
    name: "Unguarded Move Operations",
    description:
      "Detects potentially dangerous use of std::move that could lead to use-after-move bugs",
    tool: "ripgrep",
    pattern: "std::move\\(\\s*(\\w+)\\s*\\)(?!\\s*;).*?\\1",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Avoid using moved-from objects or reset them immediately after move",
  },
  {
    name: "Coroutine Memory Safety",
    description: "Identifies potential lifetime issues with coroutines (C++20)",
    tool: "ripgrep",
    pattern: "co_await\\s+[^;]*?(?:\\w+\\.)",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Ensure awaited objects outlive the coroutine or use std::shared_ptr for shared ownership",
  },
  {
    name: "Dangerous Smart Pointer Usage",
    description:
      "Detects risky smart pointer patterns including raw pointer extraction and custom deleters",
    tool: "ripgrep",
    pattern:
      "(?:\\.get\\(\\)(?!\\s*==)|(?:unique_ptr|shared_ptr)<[^>]*?>\\([^\\)]*?new\\s+[^\\)]*?\\)(?!\\s*;)|(?:unique_ptr|shared_ptr)<[^>]*?,\\s*[^>]*?>)",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Avoid .get() where possible, use make_unique/make_shared, and be careful with custom deleters",
  },
  {
    name: "Lambda Capture Hazards",
    description:
      "Finds potentially dangerous lambda captures that could lead to dangling references",
    tool: "ripgrep",
    pattern:
      "\\[(?:&|=[^\\]]*&[^\\]]*)\\]\\s*\\([^\\)]*\\)\\s*(?:->|\\{)(?!.*?\\bstatic\\b)",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Avoid capturing local variables by reference in lambdas that outlive their scope",
  },

  // === Concurrency Issues ===
  {
    name: "Data Race Potential",
    description: "Identifies shared mutable state accessed across threads",
    tool: "ripgrep",
    pattern:
      "(?:std::thread|std::async|std::jthread).*?\\[(?:[^\\]]*&[^\\]]*)\\]|(?:atomic|mutex|condition_variable)\\s*<.*?>",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Use proper synchronization primitives and consider thread-safe designs",
  },
  {
    name: "Lock Management Issues",
    description: "Detects manual lock/unlock patterns without RAII",
    tool: "ripgrep",
    pattern:
      "(?:\\.lock\\(\\).*?(?!\\s*std::lock_guard|\\s*std::unique_lock|\\s*std::scoped_lock))|(?:\\.unlock\\(\\)(?!\\s*\\}))",
    options: ["--pcre2"],
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Use RAII lock guards: std::lock_guard, std::unique_lock, or std::scoped_lock",
  },
  {
    name: "Deadlock Risks",
    description: "Identifies patterns that could lead to deadlocks",
    tool: "ripgrep",
    pattern:
      "(?:\\.lock\\(\\).*?\\.lock\\(\\))|(?:std::lock_guard<[^>]*?>\\s*\\w+\\([^\\)]*?\\);\\s*std::lock_guard<[^>]*?>\\s*\\w+\\([^\\)]*?\\);)",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Use std::scoped_lock or std::lock for multiple locks to prevent deadlocks",
  },

  // === Advanced Safety Patterns ===
  {
    name: "Unsafe Type Casting",
    description: "Finds C-style casts and dangerous reinterpret_casts",
    tool: "ripgrep",
    pattern:
      "(?:\\(\\s*(?:int|char|void|float|double|unsigned|size_t|uint\\w+_t)[^\\w].*?\\))|(?:reinterpret_cast<.*?>)",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Use static_cast, std::bit_cast (C++20), or std::any/std::variant for type-safe conversions",
  },
  {
    name: "Exception Safety Concerns",
    description: "Identifies code patterns that might not be exception-safe",
    tool: "ripgrep",
    pattern:
      "(?:catch\\s*\\([^\\)]*?\\)\\s*\\{\\s*\\})|(?:catch\\s*\\(...\\)\\s*\\{[^\\}]*?\\})",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Handle exceptions properly, avoid catching all exceptions without proper handling",
  },
  {
    name: "Memory Barrier Misuse",
    description: "Detects potential misuse of memory barriers and atomics",
    tool: "ripgrep",
    pattern:
      "std::atomic(?:<[^>]*?>)?\\s*\\w+\\s*=\\s*[^;]*?;(?!.*?std::memory_order)",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Specify memory ordering constraints explicitly when using atomics",
  },

  // === Modernized weggli patterns ===
  {
    name: "Buffer Manipulation Vulnerabilities",
    description:
      "Detects unsafe buffer operations with potential overflow risks",
    tool: "weggli",
    pattern:
      "{ _* $buf[$size]; (memcpy|memmove|strncpy)($buf, $src, $len); NOT: if ($len <= $size) _; }",
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Validate buffer sizes before operations or use std::span/std::array/std::vector",
  },
  {
    name: "Missing Null Pointer Validation",
    description: "Finds pointer dereferences without NULL/nullptr checks",
    tool: "weggli",
    pattern:
      "{ _* $p; NOT: if ($p == NULL) _; NOT: if ($p != NULL) _; NOT: if ($p == nullptr) _; NOT: if ($p != nullptr) _; NOT: if (!$p) _; NOT: if ($p) _; (*$p | $p->_); }",
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Add nullptr checks or use std::optional/std::reference_wrapper for nullable references",
  },
  {
    name: "Double Free/Use After Free Risk",
    description:
      "Detects potential use-after-free and double-free vulnerabilities",
    tool: "weggli",
    pattern:
      "{ (free|delete|delete[])($p); ...; (free|delete|delete[]|*$p|$p->_|$p[$_]); }",
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Use RAII with smart pointers or set pointers to nullptr after freeing",
  },
  {
    name: "Uninitialized Memory Usage",
    description: "Detects potential use of uninitialized memory",
    tool: "weggli",
    pattern:
      "{ (_* $var; NOT: $var = _; NOT: $var{_}; NOT: $var(_); NOT: memset(&$var, _, _); NOT: $var[_] = _; ($var | *$var | $var->_ | $var[_])) | (_* $p = (malloc|calloc|realloc)(_); NOT: memset($p, _, _); NOT: $p->_ = _; NOT: $p[_] = _; ($p->_ | $p[_])) }",
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Initialize all variables at declaration or use std::unique_ptr with make_unique",
  },
  {
    name: "Format String Vulnerabilities",
    description:
      "Detects format string vulnerabilities in printf-style functions",
    tool: "weggli",
    pattern:
      '{ (printf|sprintf|fprintf|snprintf)($_, $var); NOT: $var = "%"; NOT: $var = "_"; }',
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Use std::format (C++20) or ensure format strings are string literals",
  },
  {
    name: "Race Condition in Signal Handlers",
    description: "Identifies potential race conditions in signal handlers",
    tool: "weggli",
    pattern: "{ signal($_, $handler); ... { $handler(_) { _ = $global; } } }",
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation: "Use sig_atomic_t for variables accessed in signal handlers",
  },
  {
    name: "Command Injection Risks",
    description: "Detects potential command injection vulnerabilities",
    tool: "weggli",
    pattern:
      '{ (system|popen|execl|execlp|execle|execv|execvp|execvpe)($cmd); NOT: $cmd = "_"; }',
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Avoid shell commands with user input or use proper argument lists with execv family",
  },
  {
    name: "Template Metaprogramming Safety Issues",
    description:
      "Identifies potentially unsafe template metaprogramming patterns",
    tool: "weggli",
    pattern: "{ template <typename $T> _ { _ $t = static_cast<$T>(_); } }",
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Use SFINAE, concepts (C++20), or type traits to constrain templates",
  },
  {
    name: "RTTI Misuse",
    description: "Detects potential misuse of runtime type information",
    tool: "weggli",
    pattern:
      "{ $obj = dynamic_cast<$T>($ptr); NOT: if ($obj) _; NOT: if ($obj != nullptr) _; $obj->_; }",
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation: "Always check dynamic_cast results before dereferencing",
  },
  {
    name: "Global State Mutation",
    description: "Identifies risky patterns with global state modification",
    tool: "weggli",
    pattern: "{ static $type $var; $thread_func(_) { $var = _; } }",
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Use thread-local storage or proper synchronization for global state",
  },
  {
    name: "Smart Pointer Deletion Issues",
    description:
      "Finds problematic patterns with smart pointers and custom deleters",
    tool: "weggli",
    pattern:
      "{ std::unique_ptr<$T, $Deleter> $ptr(_); NOT: $Deleter $d; NOT: $Deleter{_}; }",
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
    mitigation:
      "Define custom deleters carefully and prefer stateless lambdas when possible",
  },
];
