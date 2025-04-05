import * as path from "path";
import * as vscode from "vscode";
import {
  FindingResult,
  FindingTreeItem,
  PatternConfig,
  PatternTreeItem,
  TreeItem,
} from "../models/types";
import { DecoratorService } from "../services/decorator-service";

export class GrepResultsProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    TreeItem | undefined | null | void
  > = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    TreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private results: FindingResult[] = [];
  private patterns: Map<string, PatternConfig> = new Map();
  private showWelcomeView: boolean = true;

  constructor(
    private context: vscode.ExtensionContext,
    private decoratorService: DecoratorService
  ) {}

  /**
   * Update the results shown in the TreeView.
   *
   * @param results The results to display
   * @param patterns The patterns used for the results
   */
  update(results: FindingResult[], patterns: PatternConfig[]): void {
    // Filter out any ignored findings using the decorator service
    const filteredResults = this.decoratorService.getFilteredFindings(results);

    this.results = filteredResults;
    this.patterns = new Map(patterns.map((pattern) => [pattern.name, pattern]));
    this.showWelcomeView = filteredResults.length === 0;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Explicitly refresh the tree view without changing the results
   * Called when ignored findings change
   */
  refresh(): void {
    // Re-filter the existing results to account for newly ignored findings
    if (this.results.length > 0) {
      const filteredResults = this.decoratorService.getFilteredFindings(
        this.results
      );
      this.results = filteredResults;
      this.showWelcomeView = filteredResults.length === 0;
    }

    // Fire event to refresh the tree view
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get the tree item for a given element.
   *
   * @param element The tree element
   * @returns The tree item to display
   */
  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get the children of a tree element.
   *
   * @param element The tree element
   * @returns The children of the element
   */
  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    if (this.showWelcomeView) {
      return Promise.resolve(this.getWelcomeViewItems());
    }

    if (this.results.length === 0) {
      return Promise.resolve([
        {
          label: "No results found",
          collapsibleState: vscode.TreeItemCollapsibleState.None,
        },
      ]);
    }

    if (!element) {
      // Root - show patterns with findings
      const patternGroups = this.groupResultsByPattern();
      return Promise.resolve(this.createPatternTreeItems(patternGroups));
    } else if ("pattern" in element) {
      // Pattern - show findings for this pattern
      const patternItem = element as PatternTreeItem;
      return Promise.resolve(this.createFindingTreeItems(patternItem.findings));
    }

    return Promise.resolve([]);
  }

  /**
   * Create welcome view items with buttons.
   */
  private getWelcomeViewItems(): TreeItem[] {
    return [
      {
        label: "Welcome to Greppy",
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        iconPath: new vscode.ThemeIcon("shield"),
      },
      {
        label: "Run Security Analysis",
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        iconPath: new vscode.ThemeIcon("play"),
        command: {
          command: "greppy.runAnalysis",
          title: "Run Security Analysis",
        },
        contextValue: "greppyAction",
      },
      {
        label: "Select Pattern Set",
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        iconPath: new vscode.ThemeIcon("list-selection"),
        command: {
          command: "greppy.selectPatternSet",
          title: "Select Pattern Set",
        },
        contextValue: "greppyAction",
      },
      {
        label: "Edit Patterns",
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        iconPath: new vscode.ThemeIcon("gear"),
        command: {
          command: "greppy.editPatterns",
          title: "Edit Patterns",
        },
        contextValue: "greppyAction",
      },
      {
        label: "View Documentation",
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        iconPath: new vscode.ThemeIcon("book"),
        command: {
          command: "markdown.showPreview",
          title: "View Documentation",
          arguments: [
            vscode.Uri.file(path.join(this.context.extensionPath, "README.md")),
          ],
        },
        contextValue: "greppyAction",
      },
    ];
  }

  /**
   * Group results by pattern.
   *
   * @returns Map of pattern name to findings
   */
  private groupResultsByPattern(): Map<string, FindingResult[]> {
    const patternGroups = new Map<string, FindingResult[]>();

    for (const result of this.results) {
      const patternName = result.patternName;

      if (!patternGroups.has(patternName)) {
        patternGroups.set(patternName, []);
      }

      patternGroups.get(patternName)!.push(result);
    }

    return patternGroups;
  }

  /**
   * Create TreeItems for patterns.
   *
   * @param patternGroups Map of pattern name to findings
   * @returns Array of PatternTreeItems
   */
  private createPatternTreeItems(
    patternGroups: Map<string, FindingResult[]>
  ): PatternTreeItem[] {
    const items: PatternTreeItem[] = [];

    for (const [patternName, findings] of patternGroups.entries()) {
      const pattern = this.patterns.get(patternName);

      if (!pattern) {
        continue;
      }

      const severityIcon = this.getSeverityIcon(pattern.severity);

      items.push({
        label: `${patternName} (${findings.length})`,
        description: pattern.description,
        tooltip: `${pattern.description}\nTool: ${pattern.tool}\nPattern: ${pattern.pattern}`,
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        iconPath: severityIcon,
        pattern,
        findings,
      });
    }

    return items;
  }

  /**
   * Create TreeItems for findings.
   *
   * @param findings Array of finding results
   * @returns Array of FindingTreeItems
   */
  private createFindingTreeItems(findings: FindingResult[]): FindingTreeItem[] {
    return findings.map((finding) => {
      const fileName = path.basename(finding.filePath);

      return {
        label: `${fileName}:${finding.lineNumber}`,
        description: `${finding.matchedContent}`,
        tooltip: `${finding.filePath}:${finding.lineNumber}\n${finding.matchedContent}`,
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        finding,
        iconPath: this.getSeverityIcon(finding.severity),
        command: {
          command: "vscode.open",
          arguments: [
            vscode.Uri.file(finding.filePath),
            {
              selection: new vscode.Range(
                finding.lineNumber - 1,
                0,
                finding.lineNumber - 1,
                0
              ),
            },
          ],
          title: "Open File",
        },
      };
    });
  }

  /**
   * Get the icon for a severity level.
   *
   * @param severity The severity level
   * @returns The icon for the severity
   */
  private getSeverityIcon(
    severity: "info" | "warning" | "critical"
  ): vscode.ThemeIcon {
    switch (severity) {
      case "info":
        return new vscode.ThemeIcon("info");
      case "warning":
        return new vscode.ThemeIcon("warning");
      case "critical":
        return new vscode.ThemeIcon("error");
      default:
        return new vscode.ThemeIcon("circle-outline");
    }
  }
}
