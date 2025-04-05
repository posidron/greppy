import * as assert from "assert";
import * as sinon from "sinon";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import { FindingResult } from "../models/types";
import { DecoratorService } from "../services/decorator-service";

// Create a mocked version of vscode namespace for testing
const mockVscode = {
  commands: {
    registerCommand: sinon.stub().returns({ dispose: () => {} }),
    executeCommand: sinon.stub(),
  },
  languages: {
    registerHoverProvider: sinon.stub().returns({ dispose: () => {} }),
  },
  window: {
    createTextEditorDecorationType: sinon.stub().returns({
      dispose: () => {},
      key: "mockDecoration",
    }),
    onDidChangeActiveTextEditor: sinon.stub().returns({ dispose: () => {} }),
    activeTextEditor: {
      document: {
        uri: { fsPath: "/path/to/file.c" },
        lineAt: sinon.stub().returns({ text: "int main() { int a = b + c; }" }),
        lineCount: 10,
      },
      setDecorations: sinon.stub(),
    },
    showInformationMessage: sinon.stub(),
  },
  ThemeColor: function (color: string) {
    return { id: color };
  },
  Uri: {
    parse: sinon.stub().returns({ toString: () => "mock-uri" }),
  },
  Hover: class MockHover {},
  Range: class MockRange {
    constructor(public start: vscode.Position, public end: vscode.Position) {}
  },
  Position: class MockPosition {
    constructor(public line: number, public character: number) {}
  },
  MarkdownString: class MockMarkdownString {
    constructor(public value?: string, public supportThemeIcons?: boolean) {}

    isTrusted = false;
    appendMarkdown(text: string): MockMarkdownString {
      return this;
    }
  },
};

// Mock the vscode namespace
const mockContext = {
  globalState: {
    get: sinon.stub().returns([]),
    update: sinon.stub().resolves(),
  },
  subscriptions: [],
} as unknown as vscode.ExtensionContext;

// Mock position for hover provider
const mockPosition = new mockVscode.Position(5, 10);

// Sample findings for testing
const createMockFinding = (
  id: string,
  filePath: string,
  lineNumber: number
): FindingResult => {
  return {
    id,
    patternName: "Test Pattern",
    patternDescription: "Test description",
    tool: "ripgrep",
    severity: "warning",
    filePath,
    lineNumber,
    matchedContent: "Test matched content",
    codeIndicator: "c",
    timestamp: Date.now(),
  };
};

suite("DecoratorService Tests", () => {
  let decoratorService: DecoratorService;
  let mockFindings: FindingResult[];
  const commandStub = mockVscode.commands.executeCommand;

  // Create a decorator service with our mocked VS Code APIs
  class TestableDecoratorService extends DecoratorService {
    constructor(context: vscode.ExtensionContext) {
      super(context);
    }

    // Make private methods accessible for testing
    public testProvideHoverForFinding(document: any, position: any): any {
      return this["provideHoverForFinding"](document, position);
    }

    public testIgnoreFinding(findingId: string): void {
      return this["ignoreFinding"](findingId);
    }
  }

  setup(() => {
    // Reset mocks
    sinon.resetHistory();

    // Reset stubs
    (mockContext.globalState.get as sinon.SinonStub).reset();
    (mockContext.globalState.update as sinon.SinonStub).reset();
    commandStub.reset();

    // Set up mock ignored findings in context
    (mockContext.globalState.get as sinon.SinonStub)
      .withArgs("greppy.ignoredFindings")
      .returns([]);

    // Create test decorator service
    decoratorService = new TestableDecoratorService(mockContext);

    // Create mock findings
    mockFindings = [
      createMockFinding(uuidv4(), "/path/to/file1.c", 10),
      createMockFinding(uuidv4(), "/path/to/file1.c", 20),
      createMockFinding(uuidv4(), "/path/to/file2.c", 5),
    ];
  });

  test("getFilteredFindings should return all findings when none are ignored", () => {
    const filteredFindings = decoratorService.getFilteredFindings(mockFindings);
    assert.strictEqual(filteredFindings.length, mockFindings.length);
  });

  test("getFilteredFindings should filter out ignored findings", () => {
    // Mock an ignored finding ID
    const ignoredId = mockFindings[1].id;
    (decoratorService as any).ignoredFindings.add(ignoredId);

    const filteredFindings = decoratorService.getFilteredFindings(mockFindings);

    // Should have one less finding
    assert.strictEqual(filteredFindings.length, mockFindings.length - 1);

    // The ignored finding should not be in the filtered results
    const hasIgnoredFinding = filteredFindings.some((f) => f.id === ignoredId);
    assert.strictEqual(hasIgnoredFinding, false);
  });

  test("ignoreFinding should add a finding to the ignored set", () => {
    const idToIgnore = mockFindings[0].id;
    const testableService = decoratorService as TestableDecoratorService;

    // Use our public wrapper for the private method
    testableService.testIgnoreFinding(idToIgnore);

    // Check if the finding was added to the ignored findings set
    const isIgnored = (decoratorService as any).ignoredFindings.has(idToIgnore);
    assert.strictEqual(isIgnored, true);

    // Should save to storage
    assert.strictEqual(
      (mockContext.globalState.update as sinon.SinonStub).calledOnce,
      true
    );
  });

  test("updateFindings should filter out ignored findings", () => {
    // Mock an ignored finding ID
    const ignoredId = mockFindings[1].id;
    (decoratorService as any).ignoredFindings.add(ignoredId);

    // Call updateFindings with all findings
    decoratorService.updateFindings(mockFindings);

    // The findingsByFilePath map should not contain the ignored finding
    const allStoredFindings: FindingResult[] = [];
    (decoratorService as any).findingsByFilePath.forEach(
      (findings: FindingResult[]) => {
        allStoredFindings.push(...findings);
      }
    );

    const hasIgnoredFinding = allStoredFindings.some((f) => f.id === ignoredId);
    assert.strictEqual(hasIgnoredFinding, false);
  });

  test("isIgnored should check if a finding is ignored", () => {
    const idToCheck = mockFindings[0].id;

    // Initially should not be ignored
    let isIgnored = decoratorService.isIgnored(idToCheck);
    assert.strictEqual(isIgnored, false);

    // Mark as ignored
    (decoratorService as any).ignoredFindings.add(idToCheck);

    // Now should be ignored
    isIgnored = decoratorService.isIgnored(idToCheck);
    assert.strictEqual(isIgnored, true);
  });
});
