import * as assert from "assert";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import { FindingResult, PatternConfig } from "../models/types";
import { DecoratorService } from "../services/decorator-service";
import { GrepResultsProvider } from "../views/results-provider";

// Mock context for VS Code
const mockContext = {
  globalState: {
    get: (key: string) => (key === "greppy.ignoredFindings" ? [] : undefined),
    update: () => Promise.resolve(),
  },
  subscriptions: [],
  extensionPath: "/path/to/extension",
} as unknown as vscode.ExtensionContext;

// Create testable decorator service that exposes private methods
class TestableDecoratorService extends DecoratorService {
  constructor(context: vscode.ExtensionContext) {
    super(context);
  }

  public addToIgnored(findingId: string): void {
    this["ignoredFindings"].add(findingId);
  }
}

// Helper to create test data
const createTestData = () => {
  // Create test patterns
  const patterns: PatternConfig[] = [
    {
      name: "Security Issue",
      description: "Test security issue",
      tool: "ripgrep",
      pattern: "test pattern",
      severity: "critical",
    },
  ];

  // Create test findings
  const findings: FindingResult[] = [
    {
      id: uuidv4(),
      patternName: "Security Issue",
      patternDescription: "Test security issue",
      tool: "ripgrep",
      severity: "critical",
      filePath: "/test/path/file.c",
      lineNumber: 42,
      matchedContent: "Vulnerable code here",
      codeIndicator: "c",
      timestamp: Date.now(),
    },
    {
      id: uuidv4(),
      patternName: "Security Issue",
      patternDescription: "Test security issue",
      tool: "ripgrep",
      severity: "critical",
      filePath: "/test/path/other.c",
      lineNumber: 100,
      matchedContent: "Another issue",
      codeIndicator: "c",
      timestamp: Date.now(),
    },
  ];

  return { patterns, findings };
};

suite("Integration Tests", () => {
  test("DecoratorService and GrepResultsProvider should correctly handle ignored findings", async () => {
    // Create test data
    const { patterns, findings } = createTestData();

    // Create actual service instances
    const decoratorService = new TestableDecoratorService(mockContext);
    const resultsProvider = new GrepResultsProvider(
      mockContext,
      decoratorService
    );

    // Update the provider with our findings
    resultsProvider.update(findings, patterns);

    // Initial state - should have all findings
    let filteredFindings = decoratorService.getFilteredFindings(findings);
    assert.strictEqual(filteredFindings.length, findings.length);

    // Get the first finding to ignore
    const findingToIgnore = findings[0];

    // Simulate ignoring the finding using our test helper
    (decoratorService as TestableDecoratorService).addToIgnored(
      findingToIgnore.id
    );

    // After ignoring - filtered results should exclude the ignored finding
    filteredFindings = decoratorService.getFilteredFindings(findings);
    assert.strictEqual(filteredFindings.length, findings.length - 1);

    // Refresh the provider
    resultsProvider.refresh();

    // Verify that the tree view is updated
    const rootItems = await resultsProvider.getChildren();
    const patternItem = rootItems[0];

    // Verify the pattern item exists
    assert.ok(patternItem);

    // Get the findings for this pattern
    const findingItems = await resultsProvider.getChildren(patternItem);

    // Should only have one finding now
    assert.strictEqual(findingItems.length, 1);

    // And it should be the second finding (not the ignored one)
    const findingItem = findingItems[0];
    const findingLabel = findingItem.label as string;

    // The label should contain the filename from the second finding
    assert.ok(findingLabel.includes("other.c"));
  });
});
