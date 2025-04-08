import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
// Re-importing with a slightly different format to clear any potential caching issues
import type {
  FindingResult,
  IgnoredFinding,
  PatternConfig,
} from "../models/types";
import { AIService } from "./ai-service";
import { IdService } from "./id-service";

/**
 * Service responsible for decorating code editors with language indicators
 * for findings from the security analysis.
 */
export class DecoratorService {
  // Store decorations by file URI to support multiple files
  private decorationsByUri: Map<string, vscode.TextEditorDecorationType[]> =
    new Map();

  // Store findings by file path for quick access
  private findingsByFilePath: Map<string, FindingResult[]> = new Map();

  // Store ignored findings to persist across sessions
  private ignoredFindings: Set<string> = new Set();

  // Storage folder and file paths
  private readonly STORAGE_FOLDER = ".greppy";
  private readonly IGNORED_FINDINGS_FILE = "ignored.json";

  // Store full ignored finding objects to support mapping
  private ignoredFindingObjects: IgnoredFinding[] = [];

  // In-memory cache of ignored findings by workspace folder
  private ignoredFindingsByWorkspace: Map<string, IgnoredFinding[]> = new Map();

  // AI service for explanations
  private aiService: AIService;

  // Cache for AI explanations to avoid repeated requests
  private explanationCache: Map<string, string> = new Map();

  constructor(private context?: vscode.ExtensionContext) {
    // Listen for active editor changes to apply decorations
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        this.applyDecorations(editor);
      }
    });

    // Listen for document changes to update decorations
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        this.applyDecorations(editor);
      }
    });

    // Register a hover provider for findings
    vscode.languages.registerHoverProvider("*", {
      provideHover: (document, position) => {
        return this.provideHoverForFinding(document, position);
      },
    });

    // Register command to ignore a finding
    if (context) {
      context.subscriptions.push(
        vscode.commands.registerCommand(
          "greppy.ignoreFinding",
          async (findingId: string) => {
            await this.ignoreFinding(findingId);
          }
        )
      );

      // Register command to manage ignored findings
      context.subscriptions.push(
        vscode.commands.registerCommand(
          "greppy.manageIgnoredFindings",
          async () => {
            await this.showIgnoredFindingsManager();
          }
        )
      );
    }

    // Load ignored findings for each workspace folder
    this.loadIgnoredFindings();

    // Initialize AI service
    this.aiService = new AIService();

    // Apply decorations to all open editors
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.applyDecorations(editor);
    });
  }

  /**
   * Load ignored findings from storage
   */
  private loadIgnoredFindings(): void {
    try {
      // Clear existing collections
      this.ignoredFindings.clear();
      this.ignoredFindingObjects = [];
      this.ignoredFindingsByWorkspace.clear();

      // Process each workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders || [];
      for (const workspaceFolder of workspaceFolders) {
        // Get the storage path for this workspace
        const ignoredFindingsPath = this.getIgnoredFindingsPath(
          workspaceFolder.uri.fsPath
        );

        // Load if it exists
        if (fs.existsSync(ignoredFindingsPath)) {
          try {
            const ignoredFindingsData = fs.readFileSync(
              ignoredFindingsPath,
              "utf8"
            );

            const ignoredFindings = JSON.parse(
              ignoredFindingsData
            ) as IgnoredFinding[];

            // Store the ignored findings for this workspace
            this.ignoredFindingsByWorkspace.set(
              workspaceFolder.uri.fsPath,
              ignoredFindings
            );

            // Add to the global collections
            for (const ignoredFinding of ignoredFindings) {
              this.ignoredFindings.add(ignoredFinding.id);
              this.ignoredFindingObjects.push(ignoredFinding);
            }
          } catch (err) {
            console.error(`Error parsing ignored findings: ${err}`);
          }
        }
      }
    } catch (error) {
      console.error("Error loading ignored findings:", error);
    }
  }

  /**
   * Save ignored findings to storage
   */
  private saveIgnoredFindings(filePath?: string): void {
    try {
      // Get the workspace folder for this file
      const workspaceFolder = this.getWorkspaceFolderForFile(filePath);
      if (!workspaceFolder) {
        console.error("No workspace folder found for file:", filePath);
        return;
      }

      // Get the ignored findings for this workspace
      const ignoredFindingsPath = this.getIgnoredFindingsPath(
        workspaceFolder.uri.fsPath
      );

      // Get or create the ignored findings for this workspace
      let workspaceIgnored = this.ignoredFindingsByWorkspace.get(
        workspaceFolder.uri.fsPath
      );
      if (!workspaceIgnored) {
        workspaceIgnored = [];
        this.ignoredFindingsByWorkspace.set(
          workspaceFolder.uri.fsPath,
          workspaceIgnored
        );
      }

      // Create the storage directory if it doesn't exist
      const storageDir = path.dirname(ignoredFindingsPath);
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      // Save the ignored findings for this workspace
      fs.writeFileSync(
        ignoredFindingsPath,
        JSON.stringify(workspaceIgnored, null, 2)
      );

      console.log(
        `Saved ${workspaceIgnored.length} ignored findings for workspace ${workspaceFolder.name}`
      );
    } catch (error) {
      console.error("Error saving ignored findings:", error);
      vscode.window.showErrorMessage(
        `Failed to save ignored findings: ${error}`
      );
    }
  }

  /**
   * Get the path to the ignored findings file for a workspace
   */
  private getIgnoredFindingsPath(workspacePath: string): string {
    return path.join(
      workspacePath,
      this.STORAGE_FOLDER,
      this.IGNORED_FINDINGS_FILE
    );
  }

  /**
   * Get the workspace folder containing a file
   */
  private getWorkspaceFolderForFile(
    filePath?: string
  ): vscode.WorkspaceFolder | undefined {
    if (!filePath) {
      // If no file path is provided, use the active editor
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        return vscode.workspace.workspaceFolders?.[0]; // Default to first workspace
      }
      filePath = activeEditor.document.uri.fsPath;
    }

    // Find the workspace folder containing this file
    return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  }

  /**
   * Add to the ignored findings for a workspace
   */
  private addToWorkspaceIgnored(
    finding: FindingResult,
    filePath: string
  ): void {
    const workspaceFolder = this.getWorkspaceFolderForFile(filePath);
    if (!workspaceFolder) {
      return;
    }

    // Create an ignored finding object to store
    const ignoredFinding: IgnoredFinding = {
      id: finding.id,
      persistentId:
        finding.persistentId || IdService.generatePersistentId(finding),
      patternName: finding.patternName,
      filePath: finding.filePath,
      lineNumber: finding.lineNumber,
      matchedContent: finding.matchedContent,
      timestamp: Date.now(),
    };

    // Get or create the array for this workspace
    let workspaceIgnored = this.ignoredFindingsByWorkspace.get(
      workspaceFolder.uri.fsPath
    );
    if (!workspaceIgnored) {
      workspaceIgnored = [];
      this.ignoredFindingsByWorkspace.set(
        workspaceFolder.uri.fsPath,
        workspaceIgnored
      );
    }

    // Add the finding to this workspace's ignored array
    workspaceIgnored.push(ignoredFinding);

    // Also add to the global collections for quick access
    this.ignoredFindings.add(finding.id);
    this.ignoredFindingObjects.push(ignoredFinding);
  }

  /**
   * Show a UI to manage ignored findings
   */
  private async showIgnoredFindingsManager(): Promise<void> {
    // Get the current workspace folder
    const workspaceFolder = this.getWorkspaceFolderForFile();
    if (!workspaceFolder) {
      vscode.window.showInformationMessage("No workspace folder found.");
      return;
    }

    // Get the ignored findings for this workspace
    const workspaceIgnored = this.ignoredFindingsByWorkspace.get(
      workspaceFolder.uri.fsPath
    );
    if (!workspaceIgnored || workspaceIgnored.length === 0) {
      vscode.window.showInformationMessage(
        "No ignored findings in this workspace."
      );
      return;
    }

    // Create an array of quick pick items
    const items = workspaceIgnored.map((ignoredFinding) => {
      // Try to find additional information about this finding
      let label = `${ignoredFinding.patternName} in ${path.basename(
        ignoredFinding.filePath
      )}:${ignoredFinding.lineNumber}`;
      let description = ignoredFinding.matchedContent;

      return {
        label,
        description,
        detail: "Click to remove from ignored list",
        id: ignoredFinding.id,
        persistentId: ignoredFinding.persistentId,
      };
    });

    // Show the quick pick menu
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select an ignored finding to remove from ignored list",
      canPickMany: true,
    });

    // If user made selections, remove them from ignored
    if (selected && selected.length > 0) {
      // Remove each selected finding
      for (const item of selected) {
        // Remove from workspace array
        const index = workspaceIgnored.findIndex((f) => f.id === item.id);
        if (index !== -1) {
          workspaceIgnored.splice(index, 1);
        }

        // Remove from global set and array
        this.ignoredFindings.delete(item.id);
        const objIndex = this.ignoredFindingObjects.findIndex(
          (f) => f.id === item.id
        );
        if (objIndex !== -1) {
          this.ignoredFindingObjects.splice(objIndex, 1);
        }
      }

      // Save changes
      this.saveIgnoredFindings(workspaceFolder.uri.fsPath);

      // Update decorations
      this.updateDecorationsAfterIgnore();

      vscode.window.showInformationMessage(
        `Removed ${selected.length} item(s) from ignored findings.`
      );
    }
  }

  /**
   * Update the findings and apply decorations to visible editors
   *
   * @param findings The findings from the security analysis
   */
  async updateFindings(findings: FindingResult[]): Promise<void> {
    // Clear old findings and decorations
    this.clearAllDecorations();
    this.findingsByFilePath.clear();

    // Enhance findings with context and persistent IDs
    const enhancedFindings: FindingResult[] = [];
    for (const finding of findings) {
      // Skip existing ignored findings by ID
      if (this.ignoredFindings.has(finding.id)) {
        continue;
      }

      // Enhance the finding with context and persistent ID
      const enhancedFinding = await IdService.enhanceFinding(finding);

      // Check if this finding matches any ignored findings by persistent ID or similarity
      const matchingIgnoredId = IdService.findMatchingIgnoredFinding(
        enhancedFinding,
        this.ignoredFindingObjects
      );

      if (matchingIgnoredId) {
        // This is effectively an ignored finding
        this.ignoredFindings.add(enhancedFinding.id);
        continue;
      }

      enhancedFindings.push(enhancedFinding);
    }

    // Group findings by file path (filtered out ignored findings)
    for (const finding of enhancedFindings) {
      const filePath = finding.filePath;
      if (!this.findingsByFilePath.has(filePath)) {
        this.findingsByFilePath.set(filePath, []);
      }
      this.findingsByFilePath.get(filePath)!.push(finding);
    }

    // Apply decorations to ALL visible editors, not just the active one
    for (const editor of vscode.window.visibleTextEditors) {
      this.applyDecorations(editor);
    }

    // Log a message to confirm findings were processed
    console.log(
      `Updating decorations for ${enhancedFindings.length} findings across ${this.findingsByFilePath.size} files`
    );
  }

  /**
   * Returns findings filtered to exclude ignored findings
   * For use by the results provider
   *
   * @param findings The findings to filter
   * @returns Filtered findings without ignored ones
   */
  public async getFilteredFindings(
    findings: FindingResult[]
  ): Promise<FindingResult[]> {
    const enhancedFindings: FindingResult[] = [];

    for (const finding of findings) {
      // Skip if already in the ignored set by ID
      if (this.ignoredFindings.has(finding.id)) {
        continue;
      }

      // Enhance the finding with context and persistent ID
      const enhancedFinding = await IdService.enhanceFinding(finding);

      // Check if this finding matches any ignored findings by persistent ID or similarity
      const matchingIgnoredId = IdService.findMatchingIgnoredFinding(
        enhancedFinding,
        this.ignoredFindingObjects
      );

      if (matchingIgnoredId) {
        // This is effectively an ignored finding
        this.ignoredFindings.add(enhancedFinding.id);
        continue;
      }

      enhancedFindings.push(enhancedFinding);
    }

    return enhancedFindings;
  }

  /**
   * Check if a finding is ignored
   *
   * @param findingId The ID of the finding to check
   * @returns Whether the finding is ignored
   */
  isIgnored(findingId: string): boolean {
    return this.ignoredFindings.has(findingId);
  }

  /**
   * Ignore a finding by its ID
   *
   * @param findingId The ID of the finding to ignore
   */
  private async ignoreFinding(findingId: string): Promise<void> {
    // Find the finding for this ID
    let findingToIgnore: FindingResult | undefined;
    let filePath = "";

    for (const [path, findings] of this.findingsByFilePath.entries()) {
      const finding = findings.find((f) => f.id === findingId);
      if (finding) {
        findingToIgnore = finding;
        filePath = path;
        break;
      }
    }

    if (!findingToIgnore) {
      console.error("Could not find finding to ignore with ID:", findingId);
      return;
    }

    // Add to workspace-specific ignored set
    this.addToWorkspaceIgnored(findingToIgnore, filePath);

    // Save to storage
    this.saveIgnoredFindings(filePath);

    // Update all editors
    this.updateDecorationsAfterIgnore();

    vscode.window.showInformationMessage(
      `Issue has been acknowledged and will be hidden.`
    );
  }

  /**
   * Update decorations after ignoring a finding
   */
  private updateDecorationsAfterIgnore(): void {
    // For each file path with findings
    for (const [filePath, findings] of this.findingsByFilePath.entries()) {
      // Filter out ignored findings
      const remainingFindings = findings.filter(
        (f) => !this.ignoredFindings.has(f.id)
      );

      if (remainingFindings.length === 0) {
        // Remove the file if no findings remain
        this.findingsByFilePath.delete(filePath);
      } else {
        // Update the findings list
        this.findingsByFilePath.set(filePath, remainingFindings);
      }
    }

    // Refresh the active editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      this.applyDecorations(activeEditor);
    }

    // Fire an event to notify the tree view to update
    vscode.commands.executeCommand("greppy.refreshResultsTree");
  }

  /**
   * Apply decorations to a text editor if it has findings
   *
   * @param editor The text editor to decorate
   */
  private applyDecorations(editor: vscode.TextEditor): void {
    const filePath = editor.document.uri.fsPath;
    const findings = this.findingsByFilePath.get(filePath);

    // Clear existing decorations for this editor
    this.clearDecorations(editor.document.uri.toString());

    if (!findings || findings.length === 0) {
      return;
    }

    // Create and apply decorations for each finding
    const decorationTypes: vscode.TextEditorDecorationType[] = [];

    for (const finding of findings) {
      // Create a decoration type with a severity icon in the gutter
      const gutterDecorationType = vscode.window.createTextEditorDecorationType(
        {
          isWholeLine: false,
          gutterIconPath: this.createSeverityIcon(finding.severity),
          gutterIconSize: "auto",
        }
      );

      // Create a decoration type for the line with pattern information
      const lineDecorationType = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: this.getSeverityBackgroundColor(finding.severity),
        overviewRulerColor: this.getSeverityColor(finding.severity),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        after: {
          contentText: ` • ${finding.patternName}`,
          color: new vscode.ThemeColor("editorInfo.foreground"),
        },
      });

      // Get zero-based line index
      const lineIndex = finding.lineNumber - 1;

      // Check if line exists in document
      if (lineIndex >= 0 && lineIndex < editor.document.lineCount) {
        const line = editor.document.lineAt(lineIndex);
        const range = new vscode.Range(
          new vscode.Position(lineIndex, 0),
          new vscode.Position(lineIndex, line.text.length)
        );

        // Apply the decorations to this range
        editor.setDecorations(gutterDecorationType, [range]);
        editor.setDecorations(lineDecorationType, [range]);
        decorationTypes.push(gutterDecorationType);
        decorationTypes.push(lineDecorationType);

        // Try to highlight the specific match pattern
        try {
          this.highlightMatchedContent(editor, lineIndex, finding);
        } catch (error) {
          console.error("Error highlighting matched content:", error);
        }
      }
    }

    // Store the decoration types for later disposal
    this.decorationsByUri.set(editor.document.uri.toString(), decorationTypes);
  }

  /**
   * Create a severity icon for the gutter
   *
   * @param severity The severity level
   * @returns URI of SVG image
   */
  private createSeverityIcon(
    severity: "info" | "warning" | "medium" | "critical"
  ): vscode.Uri {
    let icon = "";
    const color = this.getSeverityColor(severity);

    // Use same icons as the TreeView
    switch (severity) {
      case "info":
        icon = "info";
        break;
      case "warning":
      case "medium":
        icon = "warning";
        break;
      case "critical":
        icon = "error";
        break;
      default:
        icon = "circle-outline";
    }

    // Create a SVG icon that matches VS Code ThemeIcon
    const svg = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${color}">
      ${this.getIconPath(icon)}
    </svg>`;

    // Convert SVG to URI
    return vscode.Uri.parse(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
    );
  }

  /**
   * Get SVG path for a specific icon
   *
   * @param icon The icon name
   * @returns SVG path string
   */
  private getIconPath(icon: string): string {
    switch (icon) {
      case "info":
        return '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm-.5 4.77a.75.75 0 0 1 1.5 0v4.5a.75.75 0 0 1-1.5 0zm.75 7.98a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5z"/>';
      case "warning":
        return '<path d="M8.56 1h-1.12l-7 14h1.12l7-14Zm-1.12 0h1.12l7 14h-1.12l-7-14Z"/><path d="M8 4a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/>';
      case "error":
        return '<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm0-8a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3A.5.5 0 0 0 8 6zm0 5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z"/>';
      default:
        return '<circle cx="8" cy="8" r="6" fill="none" stroke-width="1.5"/>';
    }
  }

  /**
   * Create a colored square for language indicators
   *
   * @param codeIndicator The language indicator
   * @returns URI of SVG image
   */
  private createColorSquare(codeIndicator?: string): vscode.Uri {
    const color = this.getLanguageColor(codeIndicator);

    // Create a tiny colored square SVG that matches VS Code standards
    const svg = `<svg width="12" height="12" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="${color}" />
    </svg>`;

    // Convert SVG to URI
    return vscode.Uri.parse(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
    );
  }

  /**
   * Find the mitigation advice for a finding
   *
   * @param finding The finding to get mitigation for
   * @returns The mitigation advice if available
   */
  private findMitigationForFinding(finding: FindingResult): string | undefined {
    // Get all pattern sets to search through
    const config = vscode.workspace.getConfiguration("greppy");
    const patternSets = config.get<Record<string, PatternConfig[]>>(
      "patternSets",
      {}
    );
    const customPatterns = config.get<PatternConfig[]>("patterns", []);

    // Log for debugging
    console.log(`Finding mitigation for pattern: ${finding.patternName}`);

    // Check in custom patterns first
    const customMatch = customPatterns.find(
      (p) => p.name === finding.patternName
    );
    if (customMatch?.mitigation) {
      console.log(
        `Found mitigation in custom patterns: ${customMatch.mitigation}`
      );
      return customMatch.mitigation;
    }

    // Check in pattern sets
    for (const [setName, setPatterns] of Object.entries(patternSets)) {
      const match = setPatterns.find((p) => p.name === finding.patternName);
      if (match?.mitigation) {
        console.log(
          `Found mitigation in pattern set ${setName}: ${match.mitigation}`
        );
        return match.mitigation;
      }
    }

    // Fall back to checking built-in pattern sets in code
    // Import the pattern sets directly to ensure we have the latest definitions
    const { DEFAULT_PATTERNS } = require("../default-config");
    const { GENERAL_PATTERNS } = require("../patterns/general-patterns");
    const { CPP_PATTERNS } = require("../patterns/cpp-patterns");
    const { WEB_PATTERNS } = require("../patterns/web-patterns");

    // Check each built-in pattern set
    const builtInSets = [
      DEFAULT_PATTERNS,
      GENERAL_PATTERNS,
      CPP_PATTERNS,
      WEB_PATTERNS,
    ];

    for (const patternSet of builtInSets) {
      const match = patternSet.find(
        (p: PatternConfig) => p.name === finding.patternName
      );
      if (match?.mitigation) {
        console.log(
          `Found mitigation in built-in patterns: ${match.mitigation}`
        );
        return match.mitigation;
      }
    }

    console.log(`No mitigation found for pattern: ${finding.patternName}`);
    return undefined;
  }

  /**
   * Provides hover information for findings
   */
  private async provideHoverForFinding(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    const filePath = document.uri.fsPath;
    const findings = this.findingsByFilePath.get(filePath);

    if (!findings) {
      return undefined;
    }

    // Find a matching finding at the current line
    const finding = findings.find((f) => f.lineNumber - 1 === position.line);

    if (!finding) {
      return undefined;
    }

    // Check if AI analysis is enabled in settings
    const isAiAnalysisEnabled = vscode.workspace
      .getConfiguration("greppy")
      .get<boolean>("enableAiAnalysis", true);

    // Only fetch AI explanation if enabled
    let aiExplanation: string | undefined;
    if (isAiAnalysisEnabled) {
      // Try to get AI explanation if it's not in the cache
      const cacheKey = `${finding.patternName}-${finding.matchedContent}`;
      aiExplanation = this.explanationCache.get(cacheKey);

      // If explanation isn't cached, fetch it now before creating the hover content
      if (!aiExplanation) {
        try {
          aiExplanation = await this.aiService.getExplanation(finding);

          // Cache the explanation if we got one
          if (aiExplanation) {
            this.explanationCache.set(cacheKey, aiExplanation);
          }
        } catch (error) {
          console.error("Error getting AI explanation:", error);
          aiExplanation = "Error loading AI analysis. Please try again.";
        }
      }
    }

    // Create hover content with markdown
    const hoverContent = new vscode.MarkdownString(undefined, true);
    hoverContent.isTrusted = true;

    // Add a bit of whitespace to make the hover larger
    hoverContent.appendMarkdown(`### ${finding.patternName}\n\n`);
    hoverContent.appendMarkdown(`**Severity**: ${finding.severity}\n\n`);
    hoverContent.appendMarkdown(
      `**Description**: ${finding.patternDescription}\n\n`
    );
    hoverContent.appendMarkdown(
      `**Matched Content**: \`${finding.matchedContent}\`\n\n`
    );
    hoverContent.appendMarkdown(`**Tool**: ${finding.tool}\n\n`);

    // Find and display mitigation advice if available
    const mitigation = this.findMitigationForFinding(finding);
    if (mitigation) {
      hoverContent.appendMarkdown(`**Mitigation**: ${mitigation}\n\n`);
    } else {
      // Provide a generic fallback mitigation suggestion based on the severity
      let fallbackMitigation = "Review the code for potential security issues.";
      if (finding.severity === "critical") {
        fallbackMitigation =
          "This is a critical security issue that should be addressed immediately.";
      } else if (
        finding.severity === "medium" ||
        finding.severity === "warning"
      ) {
        fallbackMitigation =
          "Review and address this potential security issue in your next development cycle.";
      }

      hoverContent.appendMarkdown(`**Mitigation**: ${fallbackMitigation}\n\n`);
    }

    // Add the AI explanation only if enabled
    if (isAiAnalysisEnabled) {
      hoverContent.appendMarkdown(
        `**AI Analysis**: ${aiExplanation || "Not available at this time."}\n\n`
      );
    }

    // Add spacer to increase hover height
    hoverContent.appendMarkdown(`---\n\n`);

    // Add command link to ignore this finding
    hoverContent.appendMarkdown(
      `[$(eye-closed) Ignore this issue](command:greppy.ignoreFinding?${encodeURIComponent(
        JSON.stringify(finding.id)
      )})`
    );

    // Add more whitespace at the bottom
    hoverContent.appendMarkdown(`\n\n`);

    // Use a large range to make the hover bigger
    const lineRange = document.lineAt(position.line).range;
    return new vscode.Hover(hoverContent, lineRange);
  }

  /**
   * Highlight the specific matched content on the line
   *
   * @param editor The text editor
   * @param lineIndex The line index (0-based)
   * @param finding The finding with the matched content
   */
  private highlightMatchedContent(
    editor: vscode.TextEditor,
    lineIndex: number,
    finding: FindingResult
  ): void {
    const lineText = editor.document.lineAt(lineIndex).text;
    const matchedContent = finding.matchedContent.trim();

    // Skip if matched content is empty or too short
    if (!matchedContent || matchedContent.length < 3) {
      return;
    }

    // Try to find the matched content in the line
    const startCharIndex = lineText.indexOf(matchedContent);
    if (startCharIndex >= 0) {
      // Create a decoration for the specific matched content
      const matchDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: this.getLanguageColor(finding.codeIndicator) + "33", // Add transparency
        borderColor: this.getLanguageColor(finding.codeIndicator),
        borderStyle: "solid",
        borderWidth: "1px",
      });

      // Apply the decoration to the match range
      const matchRange = new vscode.Range(
        new vscode.Position(lineIndex, startCharIndex),
        new vscode.Position(lineIndex, startCharIndex + matchedContent.length)
      );

      editor.setDecorations(matchDecoration, [matchRange]);

      // Get the decoration collection for this editor
      const decorationsForUri = this.decorationsByUri.get(
        editor.document.uri.toString()
      );

      // Only push if the collection exists
      if (decorationsForUri) {
        decorationsForUri.push(matchDecoration);
      } else {
        // If no collection exists, create a new one with this decoration
        this.decorationsByUri.set(editor.document.uri.toString(), [
          matchDecoration,
        ]);
      }
    }
  }

  /**
   * Clear decorations for a specific editor
   *
   * @param uriString The URI string of the document
   */
  private clearDecorations(uriString: string): void {
    const decorations = this.decorationsByUri.get(uriString);
    if (decorations) {
      for (const decoration of decorations) {
        decoration.dispose();
      }
      this.decorationsByUri.delete(uriString);
    }
  }

  /**
   * Clear all decorations
   */
  private clearAllDecorations(): void {
    for (const [uriString, decorations] of this.decorationsByUri.entries()) {
      for (const decoration of decorations) {
        decoration.dispose();
      }
    }
    this.decorationsByUri.clear();
  }

  /**
   * Get a consistent color for a specific language
   *
   * @param codeIndicator The language code indicator
   * @returns A color string for the language
   */
  private getLanguageColor(codeIndicator?: string): string {
    switch (codeIndicator) {
      case "js":
        return "#F0DB4F"; // JavaScript yellow
      case "python":
        return "#3572A5"; // Python blue
      case "c":
        return "#E34C26"; // C/C++ red (changed to match screenshot)
      case "java":
        return "#B07219"; // Java brown
      case "go":
        return "#00ADD8"; // Go blue
      case "php":
        return "#4F5D95"; // PHP purple
      case "ruby":
        return "#CC342D"; // Ruby red
      case "html":
        return "#E34C26"; // HTML orange
      case "css":
        return "#563D7C"; // CSS purple
      case "json":
        return "#292929"; // JSON black
      case "xml":
        return "#0060AC"; // XML blue
      case "markdown":
        return "#083FA1"; // Markdown blue
      case "bash":
        return "#3E474A"; // Bash dark gray
      default:
        return "#6B8E23"; // Olive for other languages
    }
  }

  /**
   * Get a color for a specific severity level
   *
   * @param severity The severity level
   * @returns A color string for the severity
   */
  private getSeverityColor(
    severity: "info" | "warning" | "medium" | "critical"
  ): string {
    switch (severity) {
      case "info":
        return "#2196F3"; // Blue for info
      case "warning":
        return "#FFC107"; // Yellow for warning
      case "medium":
        return "#FF9800"; // Orange for medium
      case "critical":
        return "#F44336"; // Red for critical
      default:
        return "#757575"; // Gray for unknown
    }
  }

  /**
   * Get a background color for a specific severity level
   *
   * @param severity The severity level
   * @returns A background color string for the severity
   */
  private getSeverityBackgroundColor(
    severity: "info" | "warning" | "medium" | "critical"
  ): string {
    switch (severity) {
      case "info":
        return "rgba(33, 150, 243, 0.1)"; // Light blue for info
      case "warning":
        return "rgba(255, 193, 7, 0.1)"; // Light yellow for warning
      case "medium":
        return "rgba(255, 152, 0, 0.1)"; // Light orange for medium
      case "critical":
        return "rgba(244, 67, 54, 0.1)"; // Light red for critical
      default:
        return "rgba(117, 117, 117, 0.1)"; // Light gray for unknown
    }
  }
}
