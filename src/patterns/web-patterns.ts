import { PatternConfig } from "../models/types";

/**
 * Security patterns specifically for web applications.
 */
export const WEB_PATTERNS: PatternConfig[] = [
  // Web security patterns
  {
    name: "XSS Vulnerabilities",
    description: "Finds potential Cross-Site Scripting vulnerabilities",
    tool: "ripgrep",
    pattern: "innerHTML|outerHTML|document\\.write\\(",
    severity: "critical",
  },
  {
    name: "Improper Content-Security-Policy",
    description: "Detects unsafe CSP directives",
    tool: "ripgrep",
    pattern:
      "Content-Security-Policy.*unsafe-inline|Content-Security-Policy.*unsafe-eval",
    severity: "critical",
  },
  {
    name: "CSRF Token Missing",
    description: "Detects forms without CSRF protection",
    tool: "ripgrep",
    pattern: "<form[^>]*>(?!.*csrf)",
    options: ["--pcre2"],
    severity: "warning",
  },
  {
    name: "SQL Query Construction",
    description: "Finds SQL queries being constructed with variables",
    tool: "ripgrep",
    pattern: "SELECT.*\\+|INSERT.*\\+|UPDATE.*\\+|DELETE.*\\+",
    severity: "warning",
  },
  {
    name: "JWT Without Verification",
    description: "Finds JWT usage without verification",
    tool: "ripgrep",
    pattern: "jwt\\.decode\\(|jwt\\.verify\\(",
    severity: "warning",
  },
  {
    name: "Insecure Cookie Settings",
    description: "Finds cookies set without secure flags",
    tool: "ripgrep",
    pattern: "setCookie|set-cookie|document\\.cookie",
    severity: "info",
  },
  {
    name: "Potential Path Traversal",
    description: "Detects patterns that might allow path traversal",
    tool: "ripgrep",
    pattern: "\\.\\./|\\.\\\\|\\\\\\.\\\\\\.|\\/\\.\\.|\\.\\.\\/",
    severity: "critical",
  },
];
