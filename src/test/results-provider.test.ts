import * as assert from "assert";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import { FindingResult, PatternConfig } from "../models/types";
import { DecoratorService } from "../services/decorator-service";
import { GrepResultsProvider } from "../views/results-provider";
import { initializeTestEnvironment, MockVSCode } from "./test-utils";

// Initialize the test environment
const { sandbox } = initializeTestEnvironment();

// Create VS Code mock
const mockVSCode = new MockVSCode();

// Mock context for VS Code
const mockContext = MockVSCode.createMockContext();

// Create testable decorator service
class TestableDecoratorService {
  private ignoredIds: Set<string> = new Set();

  public async getFilteredFindings(
    findings: FindingResult[]
  ): Promise<FindingResult[]> {
    return findings.filter((finding) => !this.ignoredIds.has(finding.id));
  }

  public isIgnored(id: string): boolean {
    return this.ignoredIds.has(id);
  }

  public mockIgnoreFinding(id: string): void {
    this.ignoredIds.add(id);
  }
}

// Create a testable version of GrepResultsProvider that uses our mocks
class TestableResultsProvider extends GrepResultsProvider {
  constructor(
    context: vscode.ExtensionContext,
    decoratorService: DecoratorService
  ) {
    // Set up mocked vscode dependencies
    (GrepResultsProvider.prototype as any)["vscode"] = {
      workspace: mockVSCode.workspace,
      window: mockVSCode.window,
      commands: mockVSCode.commands,
      Uri: mockVSCode.Uri,
      ThemeColor: mockVSCode.ThemeColor,
      TreeItemCollapsibleState: mockVSCode.TreeItemCollapsibleState,
    };

    // Override the registerFilterCommands method to prevent command registration
    (GrepResultsProvider.prototype as any)["registerFilterCommands"] =
      function () {
        // No-op implementation to avoid registering commands in tests
        console.log("Skipping command registration in test environment");
      };

    super(context, decoratorService);
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
  let resultsProvider: TestableResultsProvider;
  let mockDecoratorService: TestableDecoratorService;
  let mockPatterns: PatternConfig[];
  let mockFindings: FindingResult[];

  setup(() => {
    // Reset sandbox before each test
    sandbox.resetHistory();

    // Reset registered commands to prevent conflicts
    mockVSCode.resetRegisteredCommands();

    // Call override just to maintain API consistency
    mockVSCode.override();

    mockDecoratorService = new TestableDecoratorService();
    resultsProvider = new TestableResultsProvider(
      mockContext,
      mockDecoratorService as unknown as DecoratorService
    );
    mockPatterns = createMockPatterns();
    mockFindings = createMockFindings();
  });

  test("update should filter findings using decorator service", async () => {
    // Initial update with all findings
    await resultsProvider.update(mockFindings, mockPatterns);

    // Get root level items
    const rootItems = await resultsProvider.getChildren();

    // Should have 2 pattern groups (Integer Overflow and Memory Leak)
    assert.strictEqual(rootItems.length, 2);

    // Now mark one finding as ignored
    const idToIgnore = mockFindings[0].id;
    mockDecoratorService.mockIgnoreFinding(idToIgnore);

    // Refresh the provider
    await resultsProvider.refresh();

    // Get updated root items
    const updatedRootItems = await resultsProvider.getChildren();

    // Should still have 2 pattern groups
    assert.strictEqual(updatedRootItems.length, 2);

    // But the Integer Overflow group should now have only 1 finding
    const intOverflowItem = updatedRootItems.find(
      (item) =>
        "pattern" in item && (item as any).pattern.name === "Integer Overflow"
    ) as any;

    assert.notStrictEqual(intOverflowItem, undefined);
    if (intOverflowItem) {
      assert.strictEqual(intOverflowItem.findings.length, 1);

      // And it shouldn't be the ignored finding
      const hasIgnoredFinding = intOverflowItem.findings.some(
        (f: FindingResult) => f.id === idToIgnore
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
    // Update with empty results array and explicitly set showWelcomeView to false
    await resultsProvider.update([], mockPatterns);

    // Force the provider to show empty results rather than welcome view
    (resultsProvider as any).showWelcomeView = false;

    // Get children
    const items = await resultsProvider.getChildren();

    // Should show "No results found"
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].label, "No results found");
  });

  test("getChildren should return pattern groups for root level", async () => {
    // Update with findings
    await resultsProvider.update(mockFindings, mockPatterns);

    // Get root level items
    const rootItems = await resultsProvider.getChildren();

    // Should have 2 pattern groups
    assert.strictEqual(rootItems.length, 2);

    // Verify pattern names and counts in labels
    const intOverflowItem = rootItems.find(
      (item) =>
        "pattern" in item && (item as any).pattern.name === "Integer Overflow"
    ) as any;
    const memoryLeakItem = rootItems.find(
      (item) =>
        "pattern" in item && (item as any).pattern.name === "Memory Leak"
    ) as any;

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
    await resultsProvider.update(mockFindings, mockPatterns);

    // Get root level items
    const rootItems = await resultsProvider.getChildren();

    // Get the Integer Overflow pattern item
    const intOverflowItem = rootItems.find(
      (item) =>
        "pattern" in item && (item as any).pattern.name === "Integer Overflow"
    ) as any;

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
    await resultsProvider.update(mockFindings, mockPatterns);

    // Mark a finding as ignored
    const idToIgnore = mockFindings[0].id;
    mockDecoratorService.mockIgnoreFinding(idToIgnore);

    // Refresh the provider
    await resultsProvider.refresh();

    // Get root level items
    const rootItems = await resultsProvider.getChildren();

    // Get the Integer Overflow pattern item
    const intOverflowItem = rootItems.find(
      (item) =>
        "pattern" in item && (item as any).pattern.name === "Integer Overflow"
    ) as any;

    assert.notStrictEqual(intOverflowItem, undefined);

    if (intOverflowItem) {
      // Should have one less finding
      assert.strictEqual(intOverflowItem.findings.length, 1);

      // And it shouldn't be the ignored finding
      const hasIgnoredFinding = intOverflowItem.findings.some(
        (f: FindingResult) => f.id === idToIgnore
      );
      assert.strictEqual(hasIgnoredFinding, false);
    }
  });
});
