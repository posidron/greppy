import * as vscode from "vscode";
import { FindingResult } from "../models/types";

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

  // Storage key for ignored findings
  private readonly IGNORED_FINDINGS_KEY = "greppy.ignoredFindings";

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
    vscode.commands.registerCommand(
      "greppy.ignoreFinding",
      (findingId: string) => {
        this.ignoreFinding(findingId);
      }
    );

    // Load ignored findings from storage if context is provided
    this.loadIgnoredFindings();
  }

  /**
   * Load ignored findings from storage
   */
  private loadIgnoredFindings(): void {
    if (this.context) {
      try {
        const ignoredFindingsJson = this.context.globalState.get<string[]>(
          this.IGNORED_FINDINGS_KEY,
          []
        );

        this.ignoredFindings = new Set(ignoredFindingsJson);
        console.log(
          `Loaded ${this.ignoredFindings.size} ignored findings from storage`
        );
      } catch (error) {
        console.error("Error loading ignored findings:", error);
      }
    }
  }

  /**
   * Save ignored findings to storage
   */
  private saveIgnoredFindings(): void {
    if (this.context) {
      try {
        const ignoredFindingsArray = Array.from(this.ignoredFindings);
        this.context.globalState.update(
          this.IGNORED_FINDINGS_KEY,
          ignoredFindingsArray
        );
        console.log(
          `Saved ${ignoredFindingsArray.length} ignored findings to storage`
        );
      } catch (error) {
        console.error("Error saving ignored findings:", error);
      }
    }
  }

  /**
   * Update the findings and apply decorations to visible editors
   *
   * @param findings The findings from the security analysis
   */
  updateFindings(findings: FindingResult[]): void {
    // Clear old findings and decorations
    this.clearAllDecorations();
    this.findingsByFilePath.clear();

    // Group findings by file path (filtering out ignored findings)
    for (const finding of findings) {
      if (this.ignoredFindings.has(finding.id)) {
        continue; // Skip ignored findings
      }

      const filePath = finding.filePath;
      if (!this.findingsByFilePath.has(filePath)) {
        this.findingsByFilePath.set(filePath, []);
      }
      this.findingsByFilePath.get(filePath)!.push(finding);
    }

    // Apply decorations to the active editor if needed
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      this.applyDecorations(activeEditor);
    }
  }

  /**
   * Returns findings filtered to exclude ignored findings
   * For use by the results provider
   *
   * @param findings The findings to filter
   * @returns Filtered findings without ignored ones
   */
  public getFilteredFindings(findings: FindingResult[]): FindingResult[] {
    return findings.filter((finding) => !this.ignoredFindings.has(finding.id));
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
    severity: "info" | "warning" | "critical"
  ): vscode.Uri {
    let icon = "";
    const color = this.getSeverityColor(severity);

    // Use same icons as the TreeView
    switch (severity) {
      case "info":
        icon = "info";
        break;
      case "warning":
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
   * Provide hover information for findings
   *
   * @param document The document being hovered
   * @param position The position in the document
   * @returns Hover information if there's a finding at the position
   */
  private provideHoverForFinding(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
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

    // Create hover content with markdown
    const hoverContent = new vscode.MarkdownString(undefined, true);
    hoverContent.isTrusted = true;

    hoverContent.appendMarkdown(`### ${finding.patternName}\n\n`);
    hoverContent.appendMarkdown(`**Severity**: ${finding.severity}\n\n`);
    hoverContent.appendMarkdown(
      `**Description**: ${finding.patternDescription}\n\n`
    );
    hoverContent.appendMarkdown(
      `**Matched Content**: \`${finding.matchedContent}\`\n\n`
    );
    hoverContent.appendMarkdown(`**Tool**: ${finding.tool}\n\n`);

    // Add command link to ignore this finding
    hoverContent.appendMarkdown(
      `[Ignore this issue](command:greppy.ignoreFinding?${encodeURIComponent(
        JSON.stringify(finding.id)
      )})`
    );

    return new vscode.Hover(hoverContent);
  }

  /**
   * Ignore a finding by its ID
   *
   * @param findingId The ID of the finding to ignore
   */
  private ignoreFinding(findingId: string): void {
    // Add to ignored set
    this.ignoredFindings.add(findingId);

    // Save to storage
    this.saveIgnoredFindings();

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
      this.decorationsByUri
        .get(editor.document.uri.toString())!
        .push(matchDecoration);
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
  private getSeverityColor(severity: "info" | "warning" | "critical"): string {
    switch (severity) {
      case "info":
        return "#2196F3"; // Blue for info
      case "warning":
        return "#FFC107"; // Yellow for warning
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
    severity: "info" | "warning" | "critical"
  ): string {
    switch (severity) {
      case "info":
        return "rgba(33, 150, 243, 0.1)"; // Light blue for info
      case "warning":
        return "rgba(255, 193, 7, 0.1)"; // Light yellow for warning
      case "critical":
        return "rgba(244, 67, 54, 0.1)"; // Light red for critical
      default:
        return "rgba(117, 117, 117, 0.1)"; // Light gray for unknown
    }
  }
}
