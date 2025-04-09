import * as vscode from "vscode";
import { PatternConfig } from "../models/types";
import { PatternManager } from "../patterns/pattern-manager";

/**
 * TreeItem for pattern enable/disable view.
 */
export class PatternTreeItem extends vscode.TreeItem {
  constructor(
    public readonly pattern: PatternConfig,
    public readonly contextValue: string,
    public readonly isEnabled: boolean
  ) {
    super(pattern.name, vscode.TreeItemCollapsibleState.None);

    // Set description to show the severity and tool
    this.description = `${pattern.severity} | ${pattern.tool}`;

    // Set tooltip to show the pattern description and actual pattern
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${pattern.name}**\n\n`);
    this.tooltip.appendMarkdown(`${pattern.description}\n\n`);
    this.tooltip.appendMarkdown(`**Pattern:** \`${pattern.pattern}\`\n\n`);
    this.tooltip.appendMarkdown(`**Tool:** ${pattern.tool}\n\n`);
    this.tooltip.appendMarkdown(`**Severity:** ${pattern.severity}`);

    // Set the icon based on whether the pattern is enabled
    this.iconPath = isEnabled
      ? new vscode.ThemeIcon("check")
      : new vscode.ThemeIcon("circle-outline");
  }
}

/**
 * Provider for the pattern management view.
 */
export class PatternsProvider
  implements vscode.TreeDataProvider<PatternTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    PatternTreeItem | undefined | null | void
  > = new vscode.EventEmitter<PatternTreeItem | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<
    PatternTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Refreshes the tree view.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item for a given element.
   */
  getTreeItem(element: PatternTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Gets the children of a given element, or root elements if no element is provided.
   */
  getChildren(element?: PatternTreeItem): Thenable<PatternTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    } else {
      return Promise.resolve(this.getPatternItems());
    }
  }

  /**
   * Gets all pattern items for the tree view.
   */
  private getPatternItems(): PatternTreeItem[] {
    // Get all patterns from the PatternManager
    const patterns = PatternManager.getPatterns();

    // Get disabled patterns from workspace state
    const disabledPatterns = this.getDisabledPatterns();

    // Create tree items for each pattern with enabled/disabled state
    return patterns.map((pattern) => {
      const isEnabled = !disabledPatterns.includes(pattern.name);
      return new PatternTreeItem(
        pattern,
        isEnabled ? "enabledPattern" : "disabledPattern",
        isEnabled
      );
    });
  }

  /**
   * Gets the list of disabled pattern names from workspace state.
   */
  getDisabledPatterns(): string[] {
    return this.context.workspaceState.get<string[]>(
      "greppyDisabledPatterns",
      []
    );
  }

  /**
   * Sets the list of disabled pattern names in workspace state.
   */
  setDisabledPatterns(disabledPatterns: string[]): Thenable<void> {
    return this.context.workspaceState.update(
      "greppyDisabledPatterns",
      disabledPatterns
    );
  }

  /**
   * Toggles the enabled/disabled state of a pattern.
   */
  async togglePattern(patternItem: PatternTreeItem): Promise<void> {
    const patternName = patternItem.pattern.name;
    const disabledPatterns = this.getDisabledPatterns();

    if (patternItem.isEnabled) {
      // Disable the pattern if it's currently enabled
      if (!disabledPatterns.includes(patternName)) {
        disabledPatterns.push(patternName);
      }
    } else {
      // Enable the pattern if it's currently disabled
      const index = disabledPatterns.indexOf(patternName);
      if (index !== -1) {
        disabledPatterns.splice(index, 1);
      }
    }

    await this.setDisabledPatterns(disabledPatterns);

    // Refresh the patterns view
    this.refresh();
  }
}
