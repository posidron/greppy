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
    description: "Finds potential memory leak patterns",
    tool: "ripgrep",
    pattern: "(malloc|calloc|realloc)\\((?!.*free)",
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
];
