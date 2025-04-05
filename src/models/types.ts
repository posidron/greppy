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
  patternName: string;
  patternDescription: string;
  tool: "ripgrep" | "weggli";
  severity: "info" | "warning" | "critical";
  filePath: string;
  lineNumber: number;
  matchedContent: string;
  codeIndicator?: string;
  timestamp: number;
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
