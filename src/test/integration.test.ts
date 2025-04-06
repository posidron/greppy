import * as assert from "assert";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import { FindingResult, PatternConfig } from "../models/types";
import { DecoratorService } from "../services/decorator-service";
import { GrepResultsProvider } from "../views/results-provider";
import {
  initializeTestEnvironment,
  MockFileSystem,
  MockVSCode,
} from "./test-utils";

// Initialize the test environment
const { sandbox } = initializeTestEnvironment();

// Mock VS Code
const mockVSCode = new MockVSCode();

// Mock context for VS Code
const mockContext = MockVSCode.createMockContext();

// Create testable decorator service that exposes private methods
class TestableDecoratorService extends DecoratorService {
  constructor(context: vscode.ExtensionContext) {
    // Create a file system mock for the decorator service
    const fsInstance = MockFileSystem.getInstance();
    // Override fs methods to use our mock
    (DecoratorService.prototype as any)["fs"] = {
      existsSync: fsInstance.existsSync.bind(fsInstance),
      readFileSync: fsInstance.readFileSync.bind(fsInstance),
      writeFileSync: fsInstance.writeFileSync.bind(fsInstance),
      mkdirSync: fsInstance.mkdirSync.bind(fsInstance),
    };

    // Manually set up mocked vscode dependencies before calling super
    (DecoratorService.prototype as any)["vscode"] = {
      workspace: mockVSCode.workspace,
      window: mockVSCode.window,
      commands: mockVSCode.commands,
      Uri: mockVSCode.Uri,
      ThemeColor: mockVSCode.ThemeColor,
    };

    // Override ignoreFinding command registration
    const originalRegisterCommand = mockVSCode.commands.registerCommand;
    (mockVSCode.commands.registerCommand as any) = function (
      this: typeof mockVSCode.commands,
      commandId: string,
      handler: any
    ) {
      if (
        commandId === "greppy.ignoreFinding" ||
        commandId === "greppy.manageIgnoredFindings"
      ) {
        console.log(
          `Skipping registration of ${commandId} in test environment`
        );
        return { dispose: () => {} };
      }
      return originalRegisterCommand.call(
        mockVSCode.commands,
        commandId,
        handler
      );
    };

    super(context);

    // Restore original registerCommand
    mockVSCode.commands.registerCommand = originalRegisterCommand;
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

  // Create actual service instances
  const decoratorService = new TestableDecoratorService(mockContext);

  return { patterns, findings, decoratorService, mockContext };
};

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

suite("Integration Tests", () => {
  setup(() => {
    // Reset sandbox before each test
    sandbox.resetHistory();

    // Reset registered commands to prevent conflicts
    mockVSCode.resetRegisteredCommands();

    // Call override just to maintain API consistency, but it doesn't do anything now
    mockVSCode.override();
  });

  test("DecoratorService and GrepResultsProvider should correctly handle ignored findings", async () => {
    // Create test data
    const { patterns, findings, decoratorService, mockContext } =
      createTestData();

    const resultsProvider = new TestableResultsProvider(
      mockContext,
      decoratorService
    );

    // Update the provider with our findings
    await resultsProvider.update(findings, patterns);

    // Initial state - should have all findings
    const filteredFindings = await decoratorService.getFilteredFindings(
      findings
    );
    assert.strictEqual(filteredFindings.length, findings.length);

    // Get the first finding to ignore
    const findingToIgnore = findings[0];

    // Simulate ignoring the finding using our test helper
    (decoratorService as TestableDecoratorService).addToIgnored(
      findingToIgnore.id
    );

    // After ignoring - filtered results should exclude the ignored finding
    const updatedFilteredFindings = await decoratorService.getFilteredFindings(
      findings
    );
    assert.strictEqual(updatedFilteredFindings.length, findings.length - 1);

    // Refresh the provider
    await resultsProvider.refresh();

    // Verify that the tree view is updated
    const rootItems = await resultsProvider.getChildren();

    // There should be 1 root item (the pattern)
    assert.strictEqual(rootItems.length, 1);

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
