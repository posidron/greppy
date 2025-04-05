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

  constructor() {
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
      // Create a decoration type with a colored square for the language indicator in gutter
      const gutterDecorationType = vscode.window.createTextEditorDecorationType(
        {
          isWholeLine: false,
          gutterIconPath: this.createColorSquare(finding.codeIndicator),
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
   * Create a colored square for the gutter icon
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
