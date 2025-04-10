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

  // Severity filter settings
  private showInfo: boolean = true;
  private showWarning: boolean = true;
  private showCritical: boolean = true;

  constructor(
    private context: vscode.ExtensionContext,
    private decoratorService: DecoratorService
  ) {
    // Initialize filter settings from context
    this.loadFilterSettings();

    // Register commands for toggling severity filters
    this.registerFilterCommands();

    // Register a command to get a finding by ID
    vscode.commands.registerCommand(
      "greppy.getFindingById",
      (findingId: string) => this.getFindingById(findingId)
    );
  }

  /**
   * Load filter settings from extension storage
   */
  private loadFilterSettings(): void {
    if (this.context) {
      this.showInfo = this.context.globalState.get<boolean>(
        "greppy.showInfo",
        true
      );
      this.showWarning = this.context.globalState.get<boolean>(
        "greppy.showWarning",
        true
      );
      this.showCritical = this.context.globalState.get<boolean>(
        "greppy.showCritical",
        true
      );

      // Update checkboxes to match loaded settings
      this.updateFilterCheckboxes();
    }
  }

  /**
   * Save filter settings to extension storage
   */
  private saveFilterSettings(): void {
    if (this.context) {
      this.context.globalState.update("greppy.showInfo", this.showInfo);
      this.context.globalState.update("greppy.showWarning", this.showWarning);
      this.context.globalState.update("greppy.showCritical", this.showCritical);
    }
  }

  /**
   * Register commands for toggling severity filters
   */
  private registerFilterCommands(): void {
    // Register all the filter by severity commands to show the same dropdown
    const showFilterDropdown = async () => {
      // Get a checked/unchecked icon based on status
      const getStatusIcon = (isActive: boolean) =>
        isActive ? "$(check)" : "$(circle-large-outline)";

      const items = [
        {
          label: `${getStatusIcon(this.showInfo)} $(info) Info`,
          description: this.showInfo ? "Showing" : "Hidden",
          picked: this.showInfo,
          severity: "info" as const,
          alwaysShow: true,
        },
        {
          label: `${getStatusIcon(this.showWarning)} $(warning) Warning`,
          description: this.showWarning ? "Showing" : "Hidden",
          picked: this.showWarning,
          severity: "warning" as const,
          alwaysShow: true,
        },
        {
          label: `${getStatusIcon(this.showWarning)} $(warning) Medium`,
          description: this.showWarning ? "Showing" : "Hidden", // Using showWarning for medium until we add a dedicated filter
          picked: this.showWarning,
          severity: "medium" as const,
          alwaysShow: true,
          // Custom icon color will be applied in the QuickPick UI
          iconPath: this.getSeverityIcon("medium"),
        },
        {
          label: `${getStatusIcon(this.showCritical)} $(error) Critical`,
          description: this.showCritical ? "Showing" : "Hidden",
          picked: this.showCritical,
          severity: "critical" as const,
          alwaysShow: true,
        },
      ];

      // Count active filters for the title
      const activeCount = [
        this.showInfo,
        this.showWarning, // Counts for both warning and medium
        this.showCritical,
      ].filter(Boolean).length;
      // We display 4 severity levels but only have 3 actual toggles
      const title = `Filter by Severity (${activeCount}/3 active)`;

      const selected = await vscode.window.showQuickPick(items, {
        title,
        canPickMany: true,
        placeHolder: "Select severity levels to display",
      });

      if (selected) {
        // Update filter states based on selection
        this.showInfo = selected.some((item) => item.severity === "info");
        this.showWarning = selected.some(
          (item) => item.severity === "warning" || item.severity === "medium"
        );
        this.showCritical = selected.some(
          (item) => item.severity === "critical"
        );

        this.saveFilterSettings();
        this.updateFilterCheckboxes();
        this._onDidChangeTreeData.fire();
      }
    };

    // Register all three filter commands to use the same dropdown
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        "greppy.filterBySeverity",
        showFilterDropdown
      ),
      vscode.commands.registerCommand(
        "greppy.filterBySeverityAll",
        showFilterDropdown
      ),
      vscode.commands.registerCommand(
        "greppy.filterBySeverityPartial",
        showFilterDropdown
      )
    );

    // Toggle info severity visibility (both regular and "Off" versions)
    this.context.subscriptions.push(
      vscode.commands.registerCommand("greppy.toggleInfoSeverity", () => {
        this.showInfo = !this.showInfo;
        this.saveFilterSettings();
        this.updateFilterCheckboxes();
        this._onDidChangeTreeData.fire();
      }),
      vscode.commands.registerCommand("greppy.toggleInfoSeverityOff", () => {
        this.showInfo = !this.showInfo;
        this.saveFilterSettings();
        this.updateFilterCheckboxes();
        this._onDidChangeTreeData.fire();
      })
    );

    // Toggle warning severity visibility (both regular and "Off" versions)
    this.context.subscriptions.push(
      vscode.commands.registerCommand("greppy.toggleWarningSeverity", () => {
        this.showWarning = !this.showWarning;
        this.saveFilterSettings();
        this.updateFilterCheckboxes();
        this._onDidChangeTreeData.fire();
      }),
      vscode.commands.registerCommand("greppy.toggleWarningSeverityOff", () => {
        this.showWarning = !this.showWarning;
        this.saveFilterSettings();
        this.updateFilterCheckboxes();
        this._onDidChangeTreeData.fire();
      })
    );

    // Toggle critical severity visibility (both regular and "Off" versions)
    this.context.subscriptions.push(
      vscode.commands.registerCommand("greppy.toggleCriticalSeverity", () => {
        this.showCritical = !this.showCritical;
        this.saveFilterSettings();
        this.updateFilterCheckboxes();
        this._onDidChangeTreeData.fire();
      }),
      vscode.commands.registerCommand(
        "greppy.toggleCriticalSeverityOff",
        () => {
          this.showCritical = !this.showCritical;
          this.saveFilterSettings();
          this.updateFilterCheckboxes();
          this._onDidChangeTreeData.fire();
        }
      )
    );
  }

  /**
   * Update the checkbox states for filter commands
   */
  private updateFilterCheckboxes(): void {
    // Count enabled filters
    const enabledCount = [
      this.showInfo,
      this.showWarning, // Controls both warning and medium severities
      this.showCritical,
    ].filter(Boolean).length;
    // We have 4 severity levels (info, warning, medium, critical)
    // but only 3 toggles since medium shares the warning filter
    const totalFilters = 3;

    // Set filter display state
    const showAll = enabledCount === totalFilters;
    const showPartial = enabledCount > 0 && enabledCount < totalFilters;
    const showDefault = enabledCount === 0;

    vscode.commands.executeCommand(
      "setContext",
      "greppy.showFilterAll",
      showAll
    );
    vscode.commands.executeCommand(
      "setContext",
      "greppy.showFilterPartial",
      showPartial
    );
    vscode.commands.executeCommand(
      "setContext",
      "greppy.showFilterDefault",
      showDefault
    );

    // Also update individual severity states (for backward compatibility)
    vscode.commands.executeCommand(
      "setContext",
      "greppy.showInfo",
      this.showInfo
    );
    vscode.commands.executeCommand(
      "setContext",
      "greppy.showWarning",
      this.showWarning
    );
    vscode.commands.executeCommand(
      "setContext",
      "greppy.showCritical",
      this.showCritical
    );
  }

  /**
   * Get filtered results based on current severity filters
   */
  private async getFilteredResults(): Promise<FindingResult[]> {
    // First filter out ignored findings using decoratorService
    const nonIgnoredResults = await this.decoratorService.getFilteredFindings(
      this.results
    );

    // Then apply severity filters
    // Note: Medium severity is currently grouped with Warning in the UI filter system
    // This could be expanded in the future to have a dedicated filter toggle
    return nonIgnoredResults.filter((finding) => {
      switch (finding.severity) {
        case "info":
          return this.showInfo;
        case "warning":
          return this.showWarning;
        case "medium":
          return this.showWarning; // Using showWarning for medium until we add a dedicated filter
        case "critical":
          return this.showCritical;
        default:
          return true;
      }
    });
  }

  /**
   * Update the results and patterns.
   * If isAutoScan is true, it will only replace results for the files in the current results.
   *
   * @param newResults The new results to display
   * @param patterns The patterns used to get these results
   * @param isAutoScan Whether this is an auto-scan of a single file (default: false)
   */
  async update(
    newResults: FindingResult[],
    patterns: PatternConfig[],
    isAutoScan: boolean = false
  ): Promise<void> {
    if (isAutoScan && newResults.length > 0) {
      // For auto-scan, get the filePath of the scanned file
      const scannedFilePath = newResults[0].filePath;

      // Filter out previous results for the same file(s)
      this.results = this.results.filter(
        (result) =>
          !newResults.some(
            (newResult) =>
              path.normalize(result.filePath) ===
              path.normalize(newResult.filePath)
          )
      );

      // Add new results
      this.results = [...this.results, ...newResults];
    } else {
      // For manual scans, replace all results
      this.results = newResults;
    }

    // Update patterns
    this.patterns = new Map(patterns.map((pattern) => [pattern.name, pattern]));

    // Determine if we should show the welcome view based on filtered results
    const filteredResults = await this.getFilteredResults();
    this.showWelcomeView = filteredResults.length === 0;

    this._onDidChangeTreeData.fire();
  }

  /**
   * Explicitly refresh the tree view without changing the results
   * Called when ignored findings change
   */
  async refresh(): Promise<void> {
    // Re-filter the existing results to account for newly ignored findings
    if (this.results.length > 0) {
      const filteredResults = await this.getFilteredResults();
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
  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (this.showWelcomeView) {
      return this.getWelcomeViewItems();
    }

    const filteredResults = await this.getFilteredResults();
    if (filteredResults.length === 0) {
      return [
        {
          label: "No results found",
          collapsibleState: vscode.TreeItemCollapsibleState.None,
        },
      ];
    }

    if (!element) {
      // Root - show patterns with findings
      const patternGroups = this.groupResultsByPattern(filteredResults);
      return this.createPatternTreeItems(patternGroups);
    } else if ("pattern" in element) {
      // Pattern - show findings for this pattern
      const patternItem = element as PatternTreeItem;
      return this.createFindingTreeItems(patternItem.findings);
    }

    return [];
  }

  /**
   * Group results by pattern.
   *
   * @returns Map of pattern name to findings
   */
  private groupResultsByPattern(
    results: FindingResult[]
  ): Map<string, FindingResult[]> {
    const patternGroups = new Map<string, FindingResult[]>();

    for (const result of results) {
      const patternName = result.patternName;

      if (!patternGroups.has(patternName)) {
        patternGroups.set(patternName, []);
      }

      patternGroups.get(patternName)!.push(result);
    }

    return patternGroups;
  }

  /**
   * Create welcome view items with buttons.
   */
  private getWelcomeViewItems(): TreeItem[] {
    return [
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
        tooltip: `${pattern.description}\nTool: ${pattern.tool}\nPattern: ${pattern.pattern}\nSeverity: ${pattern.severity}`,
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        iconPath: severityIcon,
        pattern,
        findings,
        resourceUri: vscode.Uri.parse(`greppy:pattern/${pattern.severity}`),
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
        tooltip: `${finding.filePath}:${finding.lineNumber}\n${finding.matchedContent}\nSeverity: ${finding.severity}`,
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        finding,
        contextValue: "finding",
        iconPath: this.getSeverityIcon(finding.severity),
        resourceUri: vscode.Uri.parse(`greppy:finding/${finding.severity}`),
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
              // Set a flag to track that we're opening from results
              // This ensures the right context when we open files
              preserveFocus: false, // Focus on the editor
              preview: false, // Open as a regular editor, not a preview
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
    severity: "info" | "warning" | "medium" | "critical"
  ): vscode.ThemeIcon {
    let iconId: string;
    let color: vscode.ThemeColor | undefined;

    switch (severity) {
      case "info":
        iconId = "info";
        color = new vscode.ThemeColor("charts.blue");
        break;
      case "warning":
        iconId = "warning";
        color = new vscode.ThemeColor("charts.yellow");
        break;
      case "medium":
        iconId = "warning";
        color = new vscode.ThemeColor("charts.orange");
        break;
      case "critical":
        iconId = "error";
        color = new vscode.ThemeColor("charts.red");
        break;
      default:
        iconId = "circle-outline";
        color = undefined;
    }

    // If we can use the color property on ThemeIcon, do so
    // This is technically not fully supported in the stable API yet,
    // but is available in newer VS Code versions
    try {
      // @ts-ignore - Using unofficially supported property
      return new vscode.ThemeIcon(iconId, color);
    } catch (e) {
      // Fallback to standard ThemeIcon without color
      return new vscode.ThemeIcon(iconId);
    }
  }

  /**
   * Get the color for a severity level.
   *
   * @param severity The severity level
   * @returns The ThemeColor for the severity
   */
  private getSeverityColor(
    severity: "info" | "warning" | "medium" | "critical"
  ): vscode.ThemeColor {
    switch (severity) {
      case "info":
        return new vscode.ThemeColor("charts.blue");
      case "warning":
        return new vscode.ThemeColor("charts.yellow");
      case "medium":
        return new vscode.ThemeColor("charts.orange");
      case "critical":
        return new vscode.ThemeColor("charts.red");
      default:
        return new vscode.ThemeColor("foreground");
    }
  }

  /**
   * Get a finding by its ID.
   *
   * @param findingId The ID of the finding to retrieve
   * @returns The finding with the specified ID, or undefined if not found
   */
  private getFindingById(findingId: string): FindingResult | undefined {
    // Look through all findings to find the one with the matching ID
    return this.results.find((finding) => finding.id === findingId);
  }

  /**
   * Check if there are non-empty results available
   * Used to determine if the current file open is from a manual scan
   */
  public hasNonEmptyResults(): boolean {
    return this.results.length > 0;
  }

  /**
   * Get the current results
   * Used to restore decorations when opening files from results view
   */
  public getResults(): FindingResult[] {
    return this.results;
  }

  /**
   * Get code indicator based on file extension
   */
}
