import * as assert from "assert";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import { FindingResult, PatternConfig, PatternTreeItem } from "../models/types";
import { DecoratorService } from "../services/decorator-service";
import { GrepResultsProvider } from "../views/results-provider";

// Mock the vscode namespace
const mockContext = {
  subscriptions: [],
  extensionPath: "/path/to/extension",
} as unknown as vscode.ExtensionContext;

// Create testable decorator service
class TestableDecoratorService {
  private ignoredIds: Set<string> = new Set();

  public getFilteredFindings(findings: FindingResult[]): FindingResult[] {
    return findings.filter((finding) => !this.ignoredIds.has(finding.id));
  }

  public isIgnored(id: string): boolean {
    return this.ignoredIds.has(id);
  }

  public mockIgnoreFinding(id: string): void {
    this.ignoredIds.add(id);
  }
}

// Create sample test data
const createMockPatterns = (): PatternConfig[] => {
  return [
    {
      name: "Integer Overflow",
      description: "Detects potential integer overflow issues",
      tool: "ripgrep",
      pattern: "int\\s+\\w+\\s*=\\s*[\\w\\s+]+",
      severity: "warning",
    },
    {
      name: "Memory Leak",
      description: "Detects potential memory leaks",
      tool: "ripgrep",
      pattern: "malloc\\(.*\\)",
      severity: "critical",
    },
  ];
};

const createMockFindings = (): FindingResult[] => {
  return [
    {
      id: uuidv4(),
      patternName: "Integer Overflow",
      patternDescription: "Detects potential integer overflow issues",
      tool: "ripgrep",
      severity: "warning",
      filePath: "/path/to/file1.c",
      lineNumber: 10,
      matchedContent: "int sum = a + b",
      codeIndicator: "c",
      timestamp: Date.now(),
    },
    {
      id: uuidv4(),
      patternName: "Integer Overflow",
      patternDescription: "Detects potential integer overflow issues",
      tool: "ripgrep",
      severity: "warning",
      filePath: "/path/to/file2.c",
      lineNumber: 20,
      matchedContent: "int result = x * y",
      codeIndicator: "c",
      timestamp: Date.now(),
    },
    {
      id: uuidv4(),
      patternName: "Memory Leak",
      patternDescription: "Detects potential memory leaks",
      tool: "ripgrep",
      severity: "critical",
      filePath: "/path/to/file1.c",
      lineNumber: 30,
      matchedContent: "char* p = malloc(10)",
      codeIndicator: "c",
      timestamp: Date.now(),
    },
  ];
};

suite("GrepResultsProvider Tests", () => {
  let resultsProvider: GrepResultsProvider;
  let mockDecoratorService: TestableDecoratorService;
  let mockPatterns: PatternConfig[];
  let mockFindings: FindingResult[];

  setup(() => {
    mockDecoratorService = new TestableDecoratorService();
    resultsProvider = new GrepResultsProvider(
      mockContext,
      mockDecoratorService as unknown as DecoratorService
    );
    mockPatterns = createMockPatterns();
    mockFindings = createMockFindings();
  });

  test("update should filter findings using decorator service", async () => {
    // Initial update with all findings
    resultsProvider.update(mockFindings, mockPatterns);

    // Get root level items
    const rootItems = await resultsProvider.getChildren();

    // Should have 2 pattern groups (Integer Overflow and Memory Leak)
    assert.strictEqual(rootItems.length, 2);

    // Now mark one finding as ignored
    const idToIgnore = mockFindings[0].id;
    mockDecoratorService.mockIgnoreFinding(idToIgnore);

    // Refresh the provider
    resultsProvider.refresh();

    // Get updated root items
    const updatedRootItems = await resultsProvider.getChildren();

    // Should still have 2 pattern groups
    assert.strictEqual(updatedRootItems.length, 2);

    // But the Integer Overflow group should now have only 1 finding
    const intOverflowItem = updatedRootItems.find(
      (item) =>
        "pattern" in item &&
        (item as PatternTreeItem).pattern.name === "Integer Overflow"
    ) as PatternTreeItem | undefined;

    assert.notStrictEqual(intOverflowItem, undefined);
    if (intOverflowItem) {
      assert.strictEqual(intOverflowItem.findings.length, 1);

      // And it shouldn't be the ignored finding
      const hasIgnoredFinding = intOverflowItem.findings.some(
        (f) => f.id === idToIgnore
      );
      assert.strictEqual(hasIgnoredFinding, false);
    }
  });

  test("getChildren should show welcome view when no results", async () => {
    // Initial state with no results
    const welcomeItems = await resultsProvider.getChildren();

    // Should show welcome view items
    assert.strictEqual(welcomeItems.length, 5); // 5 welcome view items
    assert.strictEqual(welcomeItems[0].label, "Welcome to Greppy");
  });

  test('getChildren should show "No results found" when empty results are passed', async () => {
    // Update with empty results array
    resultsProvider.update([], mockPatterns);

    // Get children
    const items = await resultsProvider.getChildren();

    // Should show "No results found"
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].label, "No results found");
  });

  test("getChildren should return pattern groups for root level", async () => {
    // Update with findings
    resultsProvider.update(mockFindings, mockPatterns);

    // Get root level items
    const rootItems = await resultsProvider.getChildren();

    // Should have 2 pattern groups
    assert.strictEqual(rootItems.length, 2);

    // Verify pattern names and counts in labels
    const intOverflowItem = rootItems.find(
      (item) =>
        "pattern" in item &&
        (item as PatternTreeItem).pattern.name === "Integer Overflow"
    ) as PatternTreeItem | undefined;
    const memoryLeakItem = rootItems.find(
      (item) =>
        "pattern" in item &&
        (item as PatternTreeItem).pattern.name === "Memory Leak"
    ) as PatternTreeItem | undefined;

    assert.notStrictEqual(intOverflowItem, undefined);
    assert.notStrictEqual(memoryLeakItem, undefined);

    // Labels should include count
    if (intOverflowItem && memoryLeakItem) {
      assert.strictEqual(
        intOverflowItem.label?.toString(),
        "Integer Overflow (2)"
      );
      assert.strictEqual(memoryLeakItem.label?.toString(), "Memory Leak (1)");
    }
  });

  test("getChildren should return findings for pattern item", async () => {
    // Update with findings
    resultsProvider.update(mockFindings, mockPatterns);

    // Get root level items
    const rootItems = await resultsProvider.getChildren();

    // Get the Integer Overflow pattern item
    const intOverflowItem = rootItems.find(
      (item) =>
        "pattern" in item &&
        (item as PatternTreeItem).pattern.name === "Integer Overflow"
    ) as PatternTreeItem | undefined;

    assert.notStrictEqual(intOverflowItem, undefined);

    if (intOverflowItem) {
      // Get children of the Integer Overflow pattern item
      const findingItems = await resultsProvider.getChildren(intOverflowItem);

      // Should have 2 findings
      assert.strictEqual(findingItems.length, 2);

      // Verify finding labels
      const label0 = findingItems[0].label?.toString() || "";
      const label1 = findingItems[1].label?.toString() || "";

      assert.strictEqual(label0.includes(":10"), true); // Line number in label
      assert.strictEqual(label1.includes(":20"), true); // Line number in label

      // Verify finding descriptions (matched content)
      assert.strictEqual(findingItems[0].description, "int sum = a + b");
      assert.strictEqual(findingItems[1].description, "int result = x * y");
    }
  });

  test("refresh should re-filter findings and update tree view", async () => {
    // Initial update with all findings
    resultsProvider.update(mockFindings, mockPatterns);

    // Mark a finding as ignored
    const idToIgnore = mockFindings[0].id;
    mockDecoratorService.mockIgnoreFinding(idToIgnore);

    // Refresh the provider
    resultsProvider.refresh();

    // Get root level items
    const rootItems = await resultsProvider.getChildren();

    // Get the Integer Overflow pattern item
    const intOverflowItem = rootItems.find(
      (item) =>
        "pattern" in item &&
        (item as PatternTreeItem).pattern.name === "Integer Overflow"
    ) as PatternTreeItem | undefined;

    if (intOverflowItem) {
      // Get findings for Integer Overflow
      const findingItems = await resultsProvider.getChildren(intOverflowItem);

      // Should only have 1 finding (the other was ignored)
      assert.strictEqual(findingItems.length, 1);

      // The remaining finding should be the second one (line 20)
      const label = findingItems[0].label?.toString() || "";
      assert.strictEqual(label.includes(":20"), true);
    }
  });
});
