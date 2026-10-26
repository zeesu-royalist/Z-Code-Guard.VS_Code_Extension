/**
 * Lightweight mock of the VS Code extension API for unit tests running outside the IDE.
 */

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export class ThemeIcon {
  constructor(public id: string, public color?: ThemeColor) {}
}

export class ThemeColor {
  constructor(public id: string) {}
}

export class Disposable {
  constructor(private callOnDispose: () => void) {}

  dispose() {
    this.callOnDispose();
  }

  static from(...disposables: { dispose: () => void }[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) {
        if (d && typeof d.dispose === 'function') {
          d.dispose();
        }
      }
    });
  }
}

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  public start: Position;
  public end: Position;

  constructor(start: Position, end: Position) {
    this.start = start;
    this.end = end;
  }
}

export interface Diagnostic {
  range: Range;
  message: string;
  severity: DiagnosticSeverity;
  source?: string;
  code?: string | number | { value: string | number; target: Uri };
}

export class TreeItem {
  public id?: string;
  public description?: string;
  public tooltip?: string;
  public contextValue?: string;
  public iconPath?: ThemeIcon;
  public command?: { command: string; title: string; arguments?: unknown[] };

  constructor(
    public label: string,
    public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None
  ) {}
}

export class EventEmitter<T = unknown> {
  private listeners: ((e: T) => unknown)[] = [];

  event = (listener: (e: T) => unknown) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };

  fire = (data: T) => {
    for (const listener of this.listeners) {
      listener(data);
    }
  };
}

export const _mockDiagnostics = new Map<string, Diagnostic[]>();

export const languages = {
  getDiagnostics: (resource?: Uri): [Uri, Diagnostic[]][] | Diagnostic[] => {
    if (resource) {
      return _mockDiagnostics.get(resource.fsPath) || [];
    }
    const result: [Uri, Diagnostic[]][] = [];
    for (const [p, diags] of _mockDiagnostics) {
      result.push([Uri.file(p), diags]);
    }
    return result;
  },
};

export const window = {
  createTreeView: () => ({ dispose: () => {} }),
  showInformationMessage: () => Promise.resolve(),
  showWarningMessage: () => Promise.resolve(),
  showErrorMessage: () => Promise.resolve(),
  showWorkspaceFolderPick: () => Promise.resolve(),
  showTextDocument: () => Promise.resolve(),
  showQuickPick: () => Promise.resolve(),
  createOutputChannel: () => ({
    append: () => {},
    appendLine: () => {},
    show: () => {},
    dispose: () => {},
  }),
  withProgress: (_options: any, task: any) => task({ report: () => {} }),
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: () => Promise.resolve(),
};

export interface WorkspaceFolder {
  uri: Uri;
  name: string;
  index: number;
}

// Storage for test listeners so unit tests can simulate events
export const _testListeners = {
  saveListeners: [] as ((doc: { uri: Uri }) => unknown)[],
  createListeners: [] as ((event: { files: Uri[] }) => unknown)[],
  deleteListeners: [] as ((event: { files: Uri[] }) => unknown)[],
  renameListeners: [] as ((event: { files: { oldUri: Uri; newUri: Uri }[] }) => unknown)[],
  reset() {
    this.saveListeners = [];
    this.createListeners = [];
    this.deleteListeners = [];
    this.renameListeners = [];
    _mockDiagnostics.clear();
  },
};

export const workspace = {
  workspaceFolders: [] as WorkspaceFolder[],
  openTextDocument: () => Promise.resolve({}),
  getWorkspaceFolder: (uri: Uri): WorkspaceFolder | undefined => {
    return workspace.workspaceFolders.find((f) => uri.fsPath.startsWith(f.uri.fsPath));
  },
  onDidSaveTextDocument: (listener: (doc: { uri: Uri }) => unknown) => {
    _testListeners.saveListeners.push(listener);
    return new Disposable(() => {
      const idx = _testListeners.saveListeners.indexOf(listener);
      if (idx !== -1) {
        _testListeners.saveListeners.splice(idx, 1);
      }
    });
  },
  onDidCreateFiles: (listener: (event: { files: Uri[] }) => unknown) => {
    _testListeners.createListeners.push(listener);
    return new Disposable(() => {
      const idx = _testListeners.createListeners.indexOf(listener);
      if (idx !== -1) {
        _testListeners.createListeners.splice(idx, 1);
      }
    });
  },
  onDidDeleteFiles: (listener: (event: { files: Uri[] }) => unknown) => {
    _testListeners.deleteListeners.push(listener);
    return new Disposable(() => {
      const idx = _testListeners.deleteListeners.indexOf(listener);
      if (idx !== -1) {
        _testListeners.deleteListeners.splice(idx, 1);
      }
    });
  },
  onDidRenameFiles: (listener: (event: { files: { oldUri: Uri; newUri: Uri }[] }) => unknown) => {
    _testListeners.renameListeners.push(listener);
    return new Disposable(() => {
      const idx = _testListeners.renameListeners.indexOf(listener);
      if (idx !== -1) {
        _testListeners.renameListeners.splice(idx, 1);
      }
    });
  },
};

export class Uri {
  public authority: string = '';
  public path: string = '';
  public query: string = '';
  public fragment: string = '';

  constructor(public fsPath: string, public scheme: string = 'file') {
    this.path = fsPath;
  }

  static file(fsPath: string): Uri {
    return new Uri(fsPath, 'file');
  }

  static parse(val: string): Uri {
    const scheme = val.includes(':') ? val.split(':')[0] : 'file';
    return new Uri(val, scheme);
  }

  with(change: {
    scheme?: string;
    authority?: string;
    path?: string;
    query?: string;
    fragment?: string;
  }): Uri {
    const updated = new Uri(this.fsPath, change.scheme || this.scheme);
    updated.authority = change.authority ?? this.authority;
    updated.path = change.path ?? this.path;
    updated.query = change.query ?? this.query;
    updated.fragment = change.fragment ?? this.fragment;
    return updated;
  }

  toString(): string {
    return `${this.scheme}://${this.fsPath}`;
  }

  toJSON(): any {
    return { fsPath: this.fsPath, scheme: this.scheme };
  }
}
