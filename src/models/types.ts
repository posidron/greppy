import * as vscode from "vscode";

export interface PatternConfig {
  name: string;
  description: string;
  tool: "ripgrep" | "weggli";
  pattern: string;
  options?: string[];
  severity: "info" | "warning" | "critical";
}

export interface FindingResult {
  id: string;
  persistentId?: string; // Content-based hash that persists across runs
  patternName: string;
  patternDescription: string;
  tool: "ripgrep" | "weggli";
  severity: "info" | "warning" | "critical";
  filePath: string;
  lineNumber: number;
  matchedContent: string;
  contextContent?: string; // Surrounding context for fingerprinting
  codeIndicator?: string;
  timestamp: number;
  contextStart?: number; // Starting line number of context
  contextEnd?: number; // Ending line number of context
}

export interface TreeItem extends vscode.TreeItem {
  children?: TreeItem[];
}

export interface PatternTreeItem extends TreeItem {
  pattern: PatternConfig;
  findings: FindingResult[];
}

export interface FindingTreeItem extends TreeItem {
  finding: FindingResult;
}

// For mapping findings between runs
export interface IgnoredFinding {
  persistentId: string;
  id: string;
  patternName: string;
  filePath: string;
  lineNumber: number;
  matchedContent: string;
  timestamp: number;
}
