import { PatternConfig } from "../models/types";

// Web file extensions
const WEB_FILE_TYPES = [
  "js",
  "ts",
  "jsx",
  "tsx",
  "html",
  "css",
  "php",
  "vue",
  "svelte",
];
const JS_FILE_TYPES = ["js", "ts", "jsx", "tsx"];
const MARKUP_FILE_TYPES = ["html", "php", "vue", "svelte", "jsx", "tsx"];
const STYLE_FILE_TYPES = ["css", "scss", "less"];

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
    supportedFileTypes: JS_FILE_TYPES,
  },
  {
    name: "Improper Content-Security-Policy",
    description: "Detects unsafe CSP directives",
    tool: "ripgrep",
    pattern:
      "Content-Security-Policy.*unsafe-inline|Content-Security-Policy.*unsafe-eval",
    severity: "critical",
    supportedFileTypes: [...MARKUP_FILE_TYPES, ...JS_FILE_TYPES],
  },
  {
    name: "CSRF Token Missing",
    description: "Detects forms without CSRF protection",
    tool: "ripgrep",
    pattern: "<form[^>]*>(?!.*csrf)",
    options: ["--pcre2"],
    severity: "warning",
    supportedFileTypes: MARKUP_FILE_TYPES,
  },
  {
    name: "SQL Query Construction",
    description: "Finds SQL queries being constructed with variables",
    tool: "ripgrep",
    pattern: "SELECT.*\\+|INSERT.*\\+|UPDATE.*\\+|DELETE.*\\+",
    severity: "warning",
    supportedFileTypes: JS_FILE_TYPES,
  },
  {
    name: "JWT Without Verification",
    description: "Finds JWT usage without verification",
    tool: "ripgrep",
    pattern: "jwt\\.decode\\(|jwt\\.verify\\(",
    severity: "warning",
    supportedFileTypes: JS_FILE_TYPES,
  },
  {
    name: "Insecure Cookie Settings",
    description: "Finds cookies set without secure flags",
    tool: "ripgrep",
    pattern: "setCookie|set-cookie|document\\.cookie",
    severity: "info",
    supportedFileTypes: [...MARKUP_FILE_TYPES, ...JS_FILE_TYPES],
  },
  {
    name: "Potential Path Traversal",
    description: "Detects patterns that might allow path traversal",
    tool: "ripgrep",
    pattern: "\\.\\./|\\.\\\\|\\\\\\.\\\\\\.|\\/\\.\\.|\\.\\.\\/",
    severity: "critical",
    supportedFileTypes: WEB_FILE_TYPES,
  },
];
