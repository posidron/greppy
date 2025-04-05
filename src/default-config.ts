import { PatternConfig } from "./models/types";

/**
 * Default patterns to use if none are configured.
 */
export const DEFAULT_PATTERNS: PatternConfig[] = [
  // Ripgrep patterns
  {
    name: "Hard-coded Credentials",
    description: "Finds hard-coded passwords and API keys",
    tool: "ripgrep",
    pattern: "(password|api.?key)\\s*=\\s*['\"]([\\w\\W]{5,}?)['\"]",
    severity: "critical",
  },
  {
    name: "SQL Injection Risk",
    description: "Detects potential SQL injection vulnerabilities",
    tool: "ripgrep",
    pattern: "execute\\(.*\\$.*\\)",
    severity: "warning",
  },
  {
    name: "Debug Print Statements",
    description: "Finds debug print statements that should be removed",
    tool: "ripgrep",
    pattern: "(console\\.log|print|printf|System\\.out\\.print)\\(",
    severity: "info",
  },
  {
    name: "Potential Memory Issues",
    description: "Finds potential memory allocation functions",
    tool: "ripgrep",
    pattern: "(malloc|calloc|realloc)\\(",
    options: ["--pcre2"],
    severity: "warning",
  },
  {
    name: "Insecure Functions",
    description: "Detects usage of insecure functions",
    tool: "ripgrep",
    pattern: "(strcpy|strcat|gets|sprintf)\\(",
    severity: "critical",
  },
  {
    name: "Potential Integer Overflow",
    description: "Detects patterns that might cause integer overflows",
    tool: "ripgrep",
    pattern: "\\(.*\\s*\\+\\s*.*\\)\\s*\\*|\\*\\s*\\(.*\\s*\\+\\s*.*\\)",
    severity: "warning",
  },

  // Weggli patterns for C/C++
  {
    name: "Vulnerable Memcpy Usage",
    description: "Detects potentially vulnerable memcpy calls",
    tool: "weggli",
    pattern: "{ _ $buf[_]; memcpy($buf,_,_); }",
    severity: "critical",
  },
  {
    name: "Missing NULL Check",
    description: "Finds pointer dereferences without NULL checks",
    tool: "weggli",
    pattern: "{ _* $p; not: if ($p == NULL) _; not: if ($p != NULL) _; *$p; }",
    severity: "warning",
  },
  {
    name: "Use After Free Risk",
    description: "Detects potential use-after-free vulnerabilities",
    tool: "weggli",
    pattern: "{ free($p); _($p); }",
    severity: "critical",
  },
];
