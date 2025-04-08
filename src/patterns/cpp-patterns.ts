import { PatternConfig } from "../models/types";

// C/C++ file extensions
const CPP_FILE_TYPES = [
  "c",
  "cpp",
  "h",
  "hpp",
  "cc",
  "cxx",
  "c++",
  "hxx",
  "h++",
];

/**
 * Security patterns specifically for C/C++ codebases.
 */
export const CPP_PATTERNS: PatternConfig[] = [
  // Ripgrep patterns for C/C++
  {
    name: "Potential Memory Issues",
    description: "Finds potential memory allocation functions",
    tool: "ripgrep",
    pattern: "(malloc|calloc|realloc)\\(",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
  },
  {
    name: "Insecure C Functions",
    description: "Detects usage of insecure C functions",
    tool: "ripgrep",
    pattern: "(strcpy|strcat|gets|sprintf)\\(",
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
  },
  {
    name: "Potential Integer Overflow",
    description: "Detects patterns that might cause integer overflows",
    tool: "ripgrep",
    pattern: "\\(.*\\s*\\+\\s*.*\\)\\s*\\*|\\*\\s*\\(.*\\s*\\+\\s*.*\\)",
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
  },

  // Weggli patterns for C/C++
  {
    name: "Vulnerable Memcpy Usage",
    description: "Detects potentially vulnerable memcpy calls",
    tool: "weggli",
    pattern: "{ _ $buf[_]; memcpy($buf,_,_); }",
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
  },
  {
    name: "Missing NULL Check",
    description: "Finds pointer dereferences without NULL checks",
    tool: "weggli",
    pattern: "{ _* $p; not: if ($p == NULL) _; not: if ($p != NULL) _; *$p; }",
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
  },
  {
    name: "Use After Free Risk",
    description: "Detects potential use-after-free vulnerabilities",
    tool: "weggli",
    pattern: "{ free($p); _($p); }",
    severity: "critical",
    supportedFileTypes: CPP_FILE_TYPES,
  },
  {
    name: "Uninitalized Variable Usage",
    description: "Detects usage of potentially uninitialized variables",
    tool: "weggli",
    pattern: "{ _* $p; NOT: $p = _; $func(&$p); }",
    severity: "warning",
    supportedFileTypes: CPP_FILE_TYPES,
  },
];
